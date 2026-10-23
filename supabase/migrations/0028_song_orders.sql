-- The order songs are sung in.
--
-- 1. song_orders: each church's order for a song, as a list of its slide
--    numbers (0-based), parts repeated where they come back: learned from
--    what went on screen in a service ('sung'), or arranged by hand in the
--    Song Lyrics console ('arranged'). One per church per song.
-- 2. common_song_orders(): for songs in the shared library, the order most
--    churches use, and how many use it. Only slide numbers and counts: no
--    church is named. A church singing a shared song for the first time
--    starts from it.
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

create table if not exists public.song_orders (
  church_id uuid not null references public.churches(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  slides integer[] not null check (cardinality(slides) between 1 and 200),
  source text not null check (source in ('sung', 'arranged')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (church_id, song_id)
);

alter table public.song_orders enable row level security;

drop policy if exists "members read their song orders" on public.song_orders;
create policy "members read their song orders" on public.song_orders
  for select using (church_id = public.my_church_id());

drop policy if exists "members add song orders" on public.song_orders;
create policy "members add song orders" on public.song_orders
  for insert with check (church_id = public.my_church_id());

drop policy if exists "members change song orders" on public.song_orders;
create policy "members change song orders" on public.song_orders
  for update using (church_id = public.my_church_id()) with check (church_id = public.my_church_id());

drop policy if exists "members remove song orders" on public.song_orders;
create policy "members remove song orders" on public.song_orders
  for delete using (church_id = public.my_church_id());

-- From 2026-10-30 Supabase stops granting new tables automatically (see 0025).
grant select, insert, update, delete on public.song_orders to authenticated;
grant all on public.song_orders to service_role;

create or replace function public.common_song_orders()
returns table (song_id uuid, slides integer[], churches integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (o.song_id) o.song_id, o.slides, count(*)::integer
  from song_orders o
  join songs s on s.id = o.song_id and s.church_id is null
  where public.my_church_id() is not null
  group by o.song_id, o.slides
  order by o.song_id, count(*) desc, max(o.updated_at) desc
$$;

revoke all on function public.common_song_orders() from public, anon;
grant execute on function public.common_song_orders() to authenticated;
