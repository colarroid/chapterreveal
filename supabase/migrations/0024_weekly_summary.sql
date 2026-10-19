-- Weekly service summary by email.
--
-- 1. songs_shown: which songs went on screen in a service, logged by the Song
--    Lyrics console (through the same outbox as verses_shown).
-- 2. summary_emails: one row per church per week once its summary is sent,
--    so a retried cron run never emails twice. Server only.
-- 3. summary_recipients(): the admins of churches that turned the summary on
--    (churches.settings.weekly_summary), for the weekly job. Server only.
-- Paste into the Supabase SQL editor and run once.

create table if not exists public.songs_shown (
  id bigint generated always as identity primary key,
  client_id uuid unique,
  service_id uuid not null references public.services(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  -- No foreign key: the song may be deleted later; the title stays.
  song_id uuid,
  title text not null check (char_length(title) <= 200),
  shown_at timestamptz not null default now()
);
create index if not exists songs_shown_service on public.songs_shown(service_id, shown_at);

alter table public.songs_shown enable row level security;

drop policy if exists "members read songs shown" on public.songs_shown;
create policy "members read songs shown" on public.songs_shown
  for select using (church_id = public.my_church_id());

drop policy if exists "members log songs shown" on public.songs_shown;
create policy "members log songs shown" on public.songs_shown
  for insert with check (
    church_id = public.my_church_id()
    and exists (select 1 from public.services s where s.id = songs_shown.service_id and s.church_id = songs_shown.church_id)
  );

create table if not exists public.summary_emails (
  church_id uuid not null references public.churches(id) on delete cascade,
  -- The Monday (UTC) the summary was sent for, as YYYY-MM-DD.
  week text not null,
  sent_at timestamptz not null default now(),
  primary key (church_id, week)
);
-- RLS on with no policies: only the service role (the weekly job) touches it.
alter table public.summary_emails enable row level security;

create or replace function public.summary_recipients()
returns table (church_id uuid, church_name text, email text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, u.email::text
  from churches c
  join church_members m on m.church_id = c.id and m.role = 'admin'
  join auth.users u on u.id = m.user_id
  where coalesce((c.settings->>'weekly_summary')::boolean, false)
    and u.email is not null
  order by c.id
$$;

revoke all on function public.summary_recipients() from public, anon, authenticated;
grant execute on function public.summary_recipients() to service_role;
