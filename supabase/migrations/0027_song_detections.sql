-- Song Lyrics detection: a log to measure and tune it, and usage to rank songs.
--
-- 1. song_detections: what the Song Lyrics console heard during worship,
--    the songs it thought it could be (top 3, with scores) and what it did;
--    and every song put on screen, with how (automatically, from a
--    suggestion, or picked by the operator). Replaying a service's log
--    shows how often detection was right, before and after a change.
--    Written through the console's outbox, like songs_shown.
-- 2. song_usage(): for each song, how many churches have sung it this year
--    and whether this church sang it in the last 90 days, from songs_shown.
--    Counts only, no church names: songs sung widely rank a little higher
--    when two are otherwise level.
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

create table if not exists public.song_detections (
  id bigint generated always as identity primary key,
  client_id uuid unique,
  service_id uuid not null references public.services(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  at timestamptz not null default now(),
  -- 'heard': a finished line of singing and what detection made of it.
  -- 'shown': a slide put on screen.
  kind text not null check (kind in ('heard', 'shown')),
  -- The words used for matching (the last couple of lines), for 'heard'.
  heard text check (char_length(heard) <= 600),
  -- Up to 3: [{ "song_id", "slide", "score" }], best first.
  candidates jsonb,
  -- heard: 'auto' (put up), 'suggest', 'hold' or 'none'.
  -- shown: 'auto', 'early' (next slide ahead of the singer), 'suggestion' or 'operator'.
  decision text check (char_length(decision) <= 20),
  -- No foreign keys: songs may be deleted later; the log stays readable.
  song_id uuid,
  slide integer,
  -- What was on screen before, and whether a song was locked.
  current_song_id uuid,
  current_slide integer,
  locked boolean,
  playlist boolean
);
create index if not exists song_detections_service on public.song_detections(service_id, at);

alter table public.song_detections enable row level security;

drop policy if exists "members read song detections" on public.song_detections;
create policy "members read song detections" on public.song_detections
  for select using (church_id = public.my_church_id() or public.is_platform_admin());

drop policy if exists "members log song detections" on public.song_detections;
create policy "members log song detections" on public.song_detections
  for insert with check (
    church_id = public.my_church_id()
    and exists (select 1 from public.services s where s.id = song_detections.service_id and s.church_id = song_detections.church_id)
  );

-- From 2026-10-30 Supabase stops granting new tables automatically (see 0025).
grant select, insert on public.song_detections to authenticated;
grant all on public.song_detections to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

create or replace function public.song_usage()
returns table (song_id uuid, churches integer, here_recently boolean)
language sql
stable
security definer
set search_path = public
as $$
  select s.song_id,
         count(distinct s.church_id)::integer,
         bool_or(s.church_id = public.my_church_id() and s.shown_at > now() - interval '90 days')
  from songs_shown s
  where s.song_id is not null
    and s.shown_at > now() - interval '365 days'
    and public.my_church_id() is not null
  group by s.song_id
$$;

revoke all on function public.song_usage() from public, anon;
grant execute on function public.song_usage() to authenticated;
