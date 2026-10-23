-- Songs churches add go into the public library too (decided 2026-10-23).
--
-- When a church adds a song of its own (not a copy of a public one):
--   - the same words are already public: the church's song is linked to
--     that public song (based_on), nothing new is added;
--   - something similar is public (the same title, or mostly the same
--     words): a song_reviews row for the admin site, which shows both and
--     lets an admin keep the public one, make the church's the default, or
--     add it as a separate song;
--   - nothing like it: a public copy is added and the church's song linked
--     to it, so how the church sings it feeds the shared profile (0031).
-- Songs churches added before this run through the same check once, below.
-- A church's later edits never change the public song.
--
-- Run after 0031. Paste into the Supabase SQL editor and run once. Safe to
-- run again.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.song_reviews (
  id bigint generated always as identity primary key,
  church_song_id uuid not null references public.songs(id) on delete cascade,
  public_song_id uuid not null references public.songs(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  -- How alike their words are, 0 to 1.
  similarity real not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- 'keep' (the public song stays the default), 'replace' (the church's
  -- words became the public song's) or 'separate' (added as its own song).
  resolution text check (resolution in ('keep', 'replace', 'separate')),
  unique (church_song_id, public_song_id)
);
alter table public.song_reviews enable row level security;
drop policy if exists "admins read song reviews" on public.song_reviews;
create policy "admins read song reviews" on public.song_reviews for select using (public.is_platform_admin());
grant select on public.song_reviews to authenticated;
grant all on public.song_reviews to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Words compared without case or punctuation.
create or replace function public.song_words(t text)
returns text language sql immutable set search_path = public as $$
  select trim(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Puts a church's song into the public library, or links it, or asks an admin.
create or replace function public.contribute_song(p_song uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s songs%rowtype;
  words text;
  same uuid;
  near record;
  added uuid;
begin
  select * into s from songs where id = p_song;
  if not found or s.church_id is null or s.based_on is not null or coalesce(s.body, '') = '' then return; end if;
  words := song_words(s.body);

  -- The same words are public already: just link to it.
  select id into same from songs where church_id is null and song_words(body) = words limit 1;
  if same is not null then
    begin
      update songs set based_on = same where id = s.id;
    exception when unique_violation then null; -- the church has a copy of it already
    end;
    return;
  end if;

  -- Something like it: for an admin to compare.
  for near in
    select id, similarity(song_words(body), words) as sim
    from songs
    where church_id is null
      and (song_words(title) = song_words(s.title) or similarity(song_words(body), words) >= 0.5)
    order by similarity(song_words(body), words) desc
    limit 3
  loop
    insert into song_reviews (church_song_id, public_song_id, church_id, similarity)
    values (s.id, near.id, s.church_id, near.sim)
    on conflict do nothing;
  end loop;
  if found then return; end if;

  -- Nothing like it: a public copy, and the church's song linked to it.
  insert into songs (church_id, title, author, copyright, ccli_number, slides, body, first_line, source)
  values (null, s.title, s.author, s.copyright, s.ccli_number, s.slides, s.body, s.first_line, 'manual')
  returning id into added;
  update songs set based_on = added where id = s.id;
end;
$$;
revoke all on function public.contribute_song(uuid) from public, anon, authenticated;

create or replace function public.contribute_song_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.contribute_song(new.id);
  return null;
end;
$$;

drop trigger if exists songs_contribute on public.songs;
create trigger songs_contribute after insert on public.songs
  for each row when (new.church_id is not null and new.based_on is null)
  execute function public.contribute_song_trigger();

-- An admin's choice on a review.
create or replace function public.resolve_song_review(p_review bigint, p_choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r song_reviews%rowtype;
  c songs%rowtype;
  added uuid;
begin
  perform public.assert_platform_admin();
  select * into r from song_reviews where id = p_review and resolved_at is null;
  if not found then return; end if;
  select * into c from songs where id = r.church_song_id;
  if p_choice = 'replace' then
    -- The church's words become the public song's (copies others made keep theirs).
    update songs set title = c.title, author = c.author, copyright = c.copyright, ccli_number = c.ccli_number,
      slides = c.slides, body = c.body, first_line = c.first_line, updated_at = now()
    where id = r.public_song_id and church_id is null;
    begin
      update songs set based_on = r.public_song_id where id = c.id;
    exception when unique_violation then null;
    end;
  elsif p_choice = 'separate' then
    insert into songs (church_id, title, author, copyright, ccli_number, slides, body, first_line, source)
    values (null, c.title, c.author, c.copyright, c.ccli_number, c.slides, c.body, c.first_line, 'manual')
    returning id into added;
    update songs set based_on = added where id = c.id;
  elsif p_choice <> 'keep' then
    raise exception 'Unknown choice %', p_choice;
  end if;
  -- One choice settles every open comparison for that church song.
  update song_reviews set resolved_at = now(), resolution = case when id = r.id then p_choice else 'keep' end
  where church_song_id = r.church_song_id and resolved_at is null;
end;
$$;
revoke all on function public.resolve_song_review(bigint, text) from public, anon;
grant execute on function public.resolve_song_review(bigint, text) to authenticated;

-- Songs churches added before this.
do $$
declare
  s record;
begin
  for s in select id from public.songs where church_id is not null and based_on is null order by created_at loop
    perform public.contribute_song(s.id);
  end loop;
end $$;
