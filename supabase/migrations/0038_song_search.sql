-- Searching all songs by title or any line, at any size of library.
--
-- The All songs search matches a few typed words against every song's
-- words. Without an index that reads every song each time, fine for
-- thousands, slow for tens of thousands. A trigram index answers it from
-- the index. The words are kept as a column (song_words(body): lower case,
-- no punctuation) so the search and the index agree on what a word is.
--
-- Run after 0037. Paste into the Supabase SQL editor and run once. Safe to
-- run again.

create extension if not exists pg_trgm with schema extensions;

alter table public.songs add column if not exists words text generated always as (public.song_words(body)) stored;
create index if not exists songs_words_trgm on public.songs using gin (words extensions.gin_trgm_ops);
create index if not exists songs_title_trgm on public.songs using gin (title extensions.gin_trgm_ops);
