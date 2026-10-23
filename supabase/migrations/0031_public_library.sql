-- The public song library, "Copy to My Library", and learning how songs
-- are sung across churches (decided 2026-10-23).
--
-- 1. The songs backed up on 2026-10-23 (supabase/maintenance) come back as
--    the public library: no church, managed by platform admins. Each set of
--    words once.
-- 2. A church sees its own songs and the public library, nobody else's
--    (this replaces 0029). Its library is its own songs; the public library
--    is searched separately and copied from.
-- 3. A church's copy keeps based_on (0030) pointing at the public song, at
--    most one copy per public song per church.
-- 4. song_performances: how a public song was sung (its slides in order),
--    one row per church per service, from unedited copies only (an edited
--    copy's slide numbers no longer match the public song). Written through
--    record_performance().
-- 5. song_profiles(): for each of this church's copies, the order the
--    public song is most often sung in, across every church's services.
--    A church's own learned or arranged order (song_orders, 0028) still
--    wins for that church: its variation, on top of the shared profile.
--
-- Run after 0028, 0029 and 0030. Paste into the Supabase SQL editor and
-- run once. Safe to run again.

-- 1. The public library, from the backup.
do $$
begin
  if to_regclass('public.songs_backup_2026_10_23') is not null then
    insert into public.songs (church_id, title, author, copyright, ccli_number, slides, body, first_line, source, fingerprint, created_at, updated_at)
    select distinct on (b.body) null, b.title, b.author, b.copyright, b.ccli_number, b.slides, b.body, b.first_line, b.source, b.fingerprint, b.created_at, b.updated_at
    from public.songs_backup_2026_10_23 b
    where b.body <> ''
      and not exists (select 1 from public.songs s where s.church_id is null and s.body = b.body)
    -- Of copies with the same words: the shared library's first, then the newest.
    order by b.body, (b.church_id is null) desc, b.updated_at desc
    on conflict do nothing;
  end if;
end $$;

-- 2. Own songs and the public library only.
drop policy if exists "members read every song" on public.songs;
drop policy if exists "read shared and own songs" on public.songs;
drop policy if exists "read public and own songs" on public.songs;
create policy "read public and own songs" on public.songs
  for select using (church_id is null or church_id = public.my_church_id() or public.is_platform_admin());

-- 3. One copy of a public song per church.
create unique index if not exists songs_one_copy on public.songs(church_id, based_on) where based_on is not null;

-- 4. How public songs are sung.
create table if not exists public.song_performances (
  id bigint generated always as identity primary key,
  song_id uuid not null references public.songs(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  slides integer[] not null check (cardinality(slides) between 1 and 200),
  at timestamptz not null default now(),
  unique (song_id, church_id, service_id)
);
alter table public.song_performances enable row level security;
drop policy if exists "admins read performances" on public.song_performances;
create policy "admins read performances" on public.song_performances
  for select using (public.is_platform_admin());
-- From 2026-10-30 Supabase stops granting new tables automatically (see 0025).
grant select on public.song_performances to authenticated;
grant all on public.song_performances to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

create or replace function public.record_performance(p_song uuid, p_slides integer[], p_service uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  copy songs%rowtype;
  src songs%rowtype;
begin
  select * into copy from songs where id = p_song and church_id = public.my_church_id();
  if not found or copy.based_on is null then return; end if;
  select * into src from songs where id = copy.based_on and church_id is null;
  -- Edited since it was copied: its slides no longer line up with the public song.
  if not found or copy.slides is distinct from src.slides then return; end if;
  if cardinality(p_slides) not between 1 and 200
    or exists (select 1 from unnest(p_slides) x where x < 0 or x >= jsonb_array_length(src.slides))
    or not exists (select 1 from services where id = p_service and church_id = copy.church_id) then
    return;
  end if;
  insert into song_performances (song_id, church_id, service_id, slides)
  values (src.id, copy.church_id, p_service, p_slides)
  on conflict (song_id, church_id, service_id) do update set slides = excluded.slides, at = now();
end;
$$;
revoke all on function public.record_performance(uuid, integer[], uuid) from public, anon;
grant execute on function public.record_performance(uuid, integer[], uuid) to authenticated;

-- 5. The shared profile, for each of this church's unedited copies.
create or replace function public.song_profiles()
returns table (song_id uuid, slides integer[], performances integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (c.id) c.id, p.slides, count(*)::integer
  from songs c
  join songs src on src.id = c.based_on and src.church_id is null and src.slides = c.slides
  join song_performances p on p.song_id = src.id and p.at > now() - interval '365 days'
  where c.church_id = public.my_church_id()
  group by c.id, p.slides
  order by c.id, count(*) desc, max(p.at) desc
$$;
revoke all on function public.song_profiles() from public, anon;
grant execute on function public.song_profiles() to authenticated;

-- Replaced by song_profiles().
drop function if exists public.common_song_orders();
