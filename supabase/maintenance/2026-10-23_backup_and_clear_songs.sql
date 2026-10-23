-- Start the song library again from empty (decided 2026-10-23): churches
-- add their own songs, pasted from Google or lyrics sites. Not a migration:
-- run each step by hand in the Supabase SQL editor, in order, checking the
-- result of each before the next.
--
-- Run this BEFORE migrations 0029 and 0030.


-- ============================================================================
-- STEP 1. Back up every song, inside the database.
-- A full copy, readable by nobody but you (the SQL editor and the service
-- role). It stays until you drop it.

create table if not exists public.songs_backup_2026_10_23 as
  select id, church_id, title, author, copyright, ccli_number, slides, body, first_line, source, fingerprint, created_by, created_at, updated_at
  from public.songs;
alter table public.songs_backup_2026_10_23 enable row level security;
revoke all on public.songs_backup_2026_10_23 from anon, authenticated;

-- These two numbers must match before going on.
select (select count(*) from public.songs) as songs, (select count(*) from public.songs_backup_2026_10_23) as backed_up;

-- Then also keep it as a file: Table Editor > songs_backup_2026_10_23 >
-- Export > Export table as CSV. Store it somewhere safe (it holds every
-- church's lyrics: don't share it).


-- ============================================================================
-- STEP 2. Delete every song.
-- Each church's slide orders for them go too (0028, if run). Playlists are
-- emptied, as their songs are gone. Service history keeps the titles of
-- songs that were shown.

begin;
delete from public.songs;
update public.setlists set song_ids = '{}', updated_at = now();
commit;

-- Should be 0.
select count(*) as songs_left from public.songs;


-- ============================================================================
-- RESTORE (only if you ever want the old songs back). Puts every backed-up
-- song back, skipping any whose id or words a church has since added again.
--
-- insert into public.songs (id, church_id, title, author, copyright, ccli_number, slides, body, first_line, source, fingerprint, created_by, created_at, updated_at)
-- select id, church_id, title, author, copyright, ccli_number, slides, body, first_line, source, fingerprint, created_by, created_at, updated_at
-- from public.songs_backup_2026_10_23
-- on conflict do nothing;
