-- Setlists: the songs a worship leader plans to sing, in order. While one
-- is chosen, worship mode listens for those songs first, which is far more
-- reliable than listening for the whole library.

create table if not exists public.setlists (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- Song ids in singing order. A song deleted later is simply skipped.
  song_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists setlists_church_updated on public.setlists(church_id, updated_at desc);

alter table public.setlists enable row level security;

drop policy if exists "members read setlists" on public.setlists;
drop policy if exists "members add setlists" on public.setlists;
drop policy if exists "members edit setlists" on public.setlists;
drop policy if exists "members delete setlists" on public.setlists;

create policy "members read setlists" on public.setlists
  for select using (church_id = public.my_church_id());
create policy "members add setlists" on public.setlists
  for insert with check (church_id = public.my_church_id());
create policy "members edit setlists" on public.setlists
  for update using (church_id = public.my_church_id()) with check (church_id = public.my_church_id());
create policy "members delete setlists" on public.setlists
  for delete using (church_id = public.my_church_id());
