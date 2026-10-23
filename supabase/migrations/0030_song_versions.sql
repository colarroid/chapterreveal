-- A church's own version of a song (decided 2026-10-23): any church can
-- edit any song, and the edit stays theirs. Editing a song the church
-- didn't add saves a copy in the church's library, pointing back at the
-- original with based_on; that church sees its version instead of the
-- original, every other church still sees the original. Deleting the
-- version brings the original back.
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

alter table public.songs add column if not exists based_on uuid references public.songs(id) on delete set null;
create index if not exists songs_church_based_on on public.songs(church_id, based_on);
