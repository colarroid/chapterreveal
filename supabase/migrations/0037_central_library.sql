-- One central song library, churches tagged on it (decided 2026-10-24).
--
-- Every song exists once (songs, church_id null). A church's library is the
-- songs it's tagged on (church_songs): adding a song to it adds a tag, not a
-- copy of the words. When a church edits a song, the edit is its own
-- version, kept on its tag, and also goes to the admin site's Review as a
-- suggested correction; accepted, it becomes the song for every church. A
-- song a church added that no other church has is just edited.
--
-- When a church adds a song: the same words in the library already, it's
-- tagged on that one; otherwise the song joins the library, and if it looks
-- like one there (the same title, or mostly the same words) Review shows
-- both to merge or keep apart.
--
-- This replaces church copies (0031) and church contributions (0032). The
-- data is converted below: copies become tags (with the church's version
-- where it differed), a church's own songs join the library, and
-- playlists, learned orders, songs shown and the detection log are pointed
-- at the library songs.
--
-- Run after 0031 and 0032. Paste into the
-- Supabase SQL editor and run once.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.song_words(t text)
returns text language sql immutable set search_path = public as $$
  select trim(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- ---- Tags --------------------------------------------------------------------
create table if not exists public.church_songs (
  church_id uuid not null references public.churches(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  -- The church's own version, when it has edited the song (null: as in the library).
  title text check (title is null or char_length(title) between 1 and 200),
  author text check (author is null or char_length(author) <= 200),
  slides jsonb check (slides is null or jsonb_typeof(slides) = 'array'),
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (church_id, song_id)
);
create index if not exists church_songs_song on public.church_songs(song_id);
alter table public.church_songs enable row level security;
drop policy if exists "members read their songs" on public.church_songs;
create policy "members read their songs" on public.church_songs for select using (church_id = public.my_church_id() or public.is_platform_admin());
drop policy if exists "members add songs to their library" on public.church_songs;
create policy "members add songs to their library" on public.church_songs for insert with check (church_id = public.my_church_id());
drop policy if exists "members take songs out of their library" on public.church_songs;
create policy "members take songs out of their library" on public.church_songs for delete using (church_id = public.my_church_id());
-- Versions are saved through save_song() below, not directly.
grant select, insert, delete on public.church_songs to authenticated;
grant all on public.church_songs to service_role;

-- ---- Review: duplicates to merge, and suggested corrections ------------------------
drop trigger if exists songs_contribute on public.songs;
drop function if exists public.contribute_song_trigger();
drop function if exists public.contribute_song(uuid);
drop function if exists public.resolve_song_review(bigint, text);
drop table if exists public.song_reviews;
create table public.song_reviews (
  id bigint generated always as identity primary key,
  -- 'duplicate': song_id was added and looks like other_song_id.
  -- 'edit': a church's change to song_id, in proposed.
  kind text not null check (kind in ('duplicate', 'edit')),
  song_id uuid not null references public.songs(id) on delete cascade,
  other_song_id uuid references public.songs(id) on delete cascade,
  church_id uuid references public.churches(id) on delete set null,
  similarity real not null default 0,
  proposed jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('keep_existing', 'keep_new', 'separate', 'accept', 'reject'))
);
create unique index song_reviews_pair on public.song_reviews(song_id, other_song_id) where kind = 'duplicate';
create unique index song_reviews_open_edit on public.song_reviews(song_id, church_id) where kind = 'edit' and resolved_at is null;
alter table public.song_reviews enable row level security;
create policy "admins read song reviews" on public.song_reviews for select using (public.is_platform_admin());
grant select on public.song_reviews to authenticated;
grant all on public.song_reviews to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---- Moving everything that points at one song to another ----------------------------
-- p_church: only that church's (a copy being folded in); null: everyone's (a merge).
create or replace function public.repoint_song(p_from uuid, p_to uuid, p_church uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Tags: keep the one already on the target.
  delete from church_songs f using church_songs t
    where f.song_id = p_from and t.song_id = p_to and t.church_id = f.church_id and (p_church is null or f.church_id = p_church);
  update church_songs set song_id = p_to where song_id = p_from and (p_church is null or church_id = p_church);
  delete from song_orders f using song_orders t
    where f.song_id = p_from and t.song_id = p_to and t.church_id = f.church_id and (p_church is null or f.church_id = p_church);
  update song_orders set song_id = p_to where song_id = p_from and (p_church is null or church_id = p_church);
  update setlists set song_ids = array_replace(song_ids, p_from, p_to) where p_from = any(song_ids) and (p_church is null or church_id = p_church);
  update songs_shown set song_id = p_to where song_id = p_from and (p_church is null or church_id = p_church);
  update song_detections set song_id = p_to where song_id = p_from and (p_church is null or church_id = p_church);
  update song_detections set current_song_id = p_to where current_song_id = p_from and (p_church is null or church_id = p_church);
  if p_church is null then
    update song_performances set song_id = p_to where song_id = p_from
      and not exists (select 1 from song_performances t where t.song_id = p_to and t.church_id = song_performances.church_id and t.service_id = song_performances.service_id);
  end if;
end;
$$;
revoke all on function public.repoint_song(uuid, uuid, uuid) from public, anon, authenticated;

-- ---- Converting what's there -----------------------------------------------------
do $$
declare
  r record;
  target uuid;
begin
  -- Copies of library songs: a tag, with the church's version where it differed.
  for r in
    select c.*, s.title as src_title, s.author as src_author, s.slides as src_slides
    from songs c join songs s on s.id = c.based_on and s.church_id is null
    where c.church_id is not null
  loop
    insert into church_songs (church_id, song_id, title, author, slides, added_by, added_at)
    values (r.church_id, r.based_on,
      case when r.title is distinct from r.src_title or r.slides is distinct from r.src_slides then r.title end,
      case when r.title is distinct from r.src_title or r.slides is distinct from r.src_slides then r.author end,
      case when r.slides is distinct from r.src_slides then r.slides end,
      r.created_by, r.created_at)
    on conflict do nothing;
    perform repoint_song(r.id, r.based_on, r.church_id);
    delete from songs where id = r.id;
  end loop;

  -- A church's own songs: tagged on the same words if the library has them, else they join it.
  for r in select * from songs where church_id is not null order by created_at loop
    target := null;
    select id into target from songs
      where church_id is null and (song_words(body) = song_words(r.body) or (r.fingerprint is not null and fingerprint = r.fingerprint))
      limit 1;
    if target is not null then
      insert into church_songs (church_id, song_id, added_by, added_at) values (r.church_id, target, r.created_by, r.created_at) on conflict do nothing;
      perform repoint_song(r.id, target, r.church_id);
      delete from songs where id = r.id;
    else
      insert into church_songs (church_id, song_id, added_by, added_at) values (r.church_id, r.id, r.created_by, r.created_at) on conflict do nothing;
      update songs set church_id = null, based_on = null where id = r.id;
    end if;
  end loop;
end $$;

drop index if exists public.songs_one_copy;

-- ---- Who can change the library -------------------------------------------------
-- Everyone in a church reads it; only admins change it directly. Churches
-- add and edit through add_song() and save_song().
drop policy if exists "read public and own songs" on public.songs;
drop policy if exists "members read every song" on public.songs;
drop policy if exists "read shared and own songs" on public.songs;
drop policy if exists "read the library" on public.songs;
create policy "read the library" on public.songs for select using (public.my_church_id() is not null or public.is_platform_admin());
drop policy if exists "add songs" on public.songs;
drop policy if exists "edit songs" on public.songs;
drop policy if exists "delete songs" on public.songs;
drop policy if exists "admins add songs" on public.songs;
drop policy if exists "admins change songs" on public.songs;
drop policy if exists "admins remove songs" on public.songs;
create policy "admins add songs" on public.songs for insert with check (church_id is null and public.is_platform_admin());
create policy "admins change songs" on public.songs for update using (public.is_platform_admin()) with check (church_id is null);
create policy "admins remove songs" on public.songs for delete using (public.is_platform_admin());

-- Finds library songs like this one, for Review.
create or replace function public.flag_duplicates(p_song uuid, p_church uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s songs%rowtype;
  w text;
  near record;
begin
  select * into s from songs where id = p_song;
  if not found then return; end if;
  w := song_words(s.body);
  for near in
    select id, similarity(song_words(body), w) as sim from songs
    where church_id is null and id <> p_song
      and (song_words(title) = song_words(s.title) or similarity(song_words(body), w) >= 0.5)
    order by similarity(song_words(body), w) desc
    limit 3
  loop
    insert into song_reviews (kind, song_id, other_song_id, church_id, similarity)
    values ('duplicate', p_song, near.id, p_church, near.sim)
    on conflict do nothing;
  end loop;
end;
$$;
revoke all on function public.flag_duplicates(uuid, uuid) from public, anon, authenticated;

-- A church adds a song: tagged on the same words if they're there, else it
-- joins the library (and Review if it looks like another). Returns its id.
create or replace function public.add_song(p_title text, p_author text, p_copyright text, p_ccli text, p_slides jsonb, p_body text, p_first_line text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  church uuid := public.my_church_id();
  found_id uuid;
begin
  if church is null then raise exception 'Not in a church.' using errcode = '42501'; end if;
  select id into found_id from songs where church_id is null and song_words(body) = song_words(p_body) limit 1;
  if found_id is null then
    insert into songs (church_id, title, author, copyright, ccli_number, slides, body, first_line, source, created_by)
    values (null, p_title, coalesce(p_author, ''), coalesce(p_copyright, ''), coalesce(p_ccli, ''), p_slides, p_body, p_first_line, 'manual', auth.uid())
    returning id into found_id;
    perform flag_duplicates(found_id, church);
  end if;
  insert into church_songs (church_id, song_id, added_by) values (church, found_id, auth.uid()) on conflict do nothing;
  return found_id;
end;
$$;
revoke all on function public.add_song(text, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.add_song(text, text, text, text, jsonb, text, text) to authenticated;

-- A church edits a song in its library. Its own song that no other church
-- has: the library song changes ('song'). Otherwise the church's version,
-- and a suggested correction for Review ('version'). The library's words
-- again: back to the library song ('song').
create or replace function public.save_song(p_song uuid, p_title text, p_author text, p_copyright text, p_ccli text, p_slides jsonb, p_body text, p_first_line text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  church uuid := public.my_church_id();
  s songs%rowtype;
  ours boolean;
begin
  if not exists (select 1 from church_songs where church_id = church and song_id = p_song) then
    raise exception 'That song isn''t in your library.' using errcode = '42501';
  end if;
  select * into s from songs where id = p_song;
  ours := exists (select 1 from church_members m where m.church_id = church and m.user_id = s.created_by)
    and not exists (select 1 from church_songs where song_id = p_song and church_id <> church);
  if ours then
    update songs set title = p_title, author = coalesce(p_author, ''), copyright = coalesce(p_copyright, ''), ccli_number = coalesce(p_ccli, ''),
      slides = p_slides, body = p_body, first_line = p_first_line, updated_at = now()
    where id = p_song;
    update church_songs set title = null, author = null, slides = null, updated_at = now() where church_id = church and song_id = p_song;
    return 'song';
  end if;
  if p_title = s.title and p_slides = s.slides then
    update church_songs set title = null, author = null, slides = null, updated_at = now() where church_id = church and song_id = p_song;
    delete from song_reviews where kind = 'edit' and song_id = p_song and church_id = church and resolved_at is null;
    return 'song';
  end if;
  update church_songs set title = p_title, author = coalesce(p_author, ''), slides = p_slides, updated_at = now() where church_id = church and song_id = p_song;
  insert into song_reviews (kind, song_id, church_id, proposed)
  values ('edit', p_song, church, jsonb_build_object('title', p_title, 'author', coalesce(p_author, ''), 'slides', p_slides, 'body', p_body, 'first_line', p_first_line))
  on conflict (song_id, church_id) where kind = 'edit' and resolved_at is null
  do update set proposed = excluded.proposed, created_at = now();
  return 'version';
end;
$$;
revoke all on function public.save_song(uuid, text, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.save_song(uuid, text, text, text, text, jsonb, text, text) to authenticated;

-- Back to the library's song: the church's version goes, and its suggestion with it.
create or replace function public.reset_song(p_song uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare church uuid := public.my_church_id();
begin
  update church_songs set title = null, author = null, slides = null, updated_at = now() where church_id = church and song_id = p_song;
  delete from song_reviews where kind = 'edit' and song_id = p_song and church_id = church and resolved_at is null;
end;
$$;
revoke all on function public.reset_song(uuid) from public, anon;
grant execute on function public.reset_song(uuid) to authenticated;

-- ---- Admin: Review, and tagging a church on songs --------------------------------
create or replace function public.resolve_song_review(p_review bigint, p_choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r song_reviews%rowtype;
begin
  perform public.assert_platform_admin();
  select * into r from song_reviews where id = p_review and resolved_at is null;
  if not found then return; end if;
  if r.kind = 'duplicate' then
    if p_choice = 'keep_existing' then
      perform repoint_song(r.song_id, r.other_song_id, null);
      delete from songs where id = r.song_id;
    elsif p_choice = 'keep_new' then
      perform repoint_song(r.other_song_id, r.song_id, null);
      delete from songs where id = r.other_song_id;
    elsif p_choice <> 'separate' then
      raise exception 'Unknown choice %', p_choice;
    end if;
    -- A merged song's other comparisons went with it (on delete cascade).
  else
    if p_choice = 'accept' then
      update songs set
        title = r.proposed->>'title', author = coalesce(r.proposed->>'author', ''), slides = r.proposed->'slides',
        body = coalesce(r.proposed->>'body', body), first_line = coalesce(r.proposed->>'first_line', first_line), updated_at = now()
      where id = r.song_id;
      -- The suggesting church's version is the library's song now.
      update church_songs set title = null, author = null, slides = null, updated_at = now() where church_id = r.church_id and song_id = r.song_id;
    elsif p_choice <> 'reject' then
      raise exception 'Unknown choice %', p_choice;
    end if;
  end if;
  update song_reviews set resolved_at = now(), resolution = p_choice where id = p_review;
end;
$$;
revoke all on function public.resolve_song_review(bigint, text) from public, anon;
grant execute on function public.resolve_song_review(bigint, text) to authenticated;

-- Puts library songs in a church's library (importing its songbook).
create or replace function public.admin_tag_church(p_church uuid, p_songs uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare added integer;
begin
  perform public.assert_platform_admin();
  insert into church_songs (church_id, song_id)
  select p_church, s.id from songs s where s.id = any(p_songs)
  on conflict do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function public.admin_tag_church(uuid, uuid[]) from public, anon;
grant execute on function public.admin_tag_church(uuid, uuid[]) to authenticated;
drop function if exists public.admin_add_to_church(uuid, uuid[]);

-- ---- Learning how songs are sung, for tags -----------------------------------------
-- Performances count only for churches singing the library's words (no
-- version of their own), so slide numbers line up.
create or replace function public.record_performance(p_song uuid, p_slides integer[], p_service uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  church uuid := public.my_church_id();
  s songs%rowtype;
begin
  if not exists (select 1 from church_songs where church_id = church and song_id = p_song and slides is null) then return; end if;
  select * into s from songs where id = p_song;
  if cardinality(p_slides) not between 1 and 200
    or exists (select 1 from unnest(p_slides) x where x < 0 or x >= jsonb_array_length(s.slides))
    or not exists (select 1 from services where id = p_service and church_id = church) then
    return;
  end if;
  insert into song_performances (song_id, church_id, service_id, slides)
  values (p_song, church, p_service, p_slides)
  on conflict (song_id, church_id, service_id) do update set slides = excluded.slides, at = now();
end;
$$;
revoke all on function public.record_performance(uuid, integer[], uuid) from public, anon;
grant execute on function public.record_performance(uuid, integer[], uuid) to authenticated;

create or replace function public.song_profiles()
returns table (song_id uuid, slides integer[], performances integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (t.song_id) t.song_id, p.slides, count(*)::integer
  from church_songs t
  join song_performances p on p.song_id = t.song_id and p.at > now() - interval '365 days'
  where t.church_id = public.my_church_id() and t.slides is null
  group by t.song_id, p.slides
  order by t.song_id, count(*) desc, max(p.at) desc
$$;
revoke all on function public.song_profiles() from public, anon;
grant execute on function public.song_profiles() to authenticated;
