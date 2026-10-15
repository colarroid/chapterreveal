-- Songs: one shared library every church sees (managed by platform admins
-- on the admin site), plus each church's own songs.
--   church_id null  -> shared
--   church_id set   -> that church only
-- Safe to run whether or not 0007 was run first.

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  author text not null default '' check (char_length(author) <= 200),
  copyright text not null default '' check (char_length(copyright) <= 300),
  ccli_number text not null default '' check (char_length(ccli_number) <= 20),
  slides jsonb not null default '[]'::jsonb check (jsonb_typeof(slides) = 'array'),
  body text not null default '',
  first_line text not null default '',
  source text not null default 'manual' check (source in ('manual', 'videopsalm')),
  fingerprint text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.songs alter column church_id drop not null;

-- Whose library a song is in, as a plain column so "already imported" can be
-- checked per library (nulls never match each other in a unique index).
alter table public.songs add column if not exists library uuid
  generated always as (coalesce(church_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

drop index if exists public.songs_church_fingerprint;
create unique index if not exists songs_library_fingerprint on public.songs(library, fingerprint);
create index if not exists songs_church_title on public.songs(church_id, lower(title));

alter table public.songs enable row level security;

drop policy if exists "members read songs" on public.songs;
drop policy if exists "members add songs" on public.songs;
drop policy if exists "members edit songs" on public.songs;
drop policy if exists "members delete songs" on public.songs;

-- Everyone in a church sees the shared library and their own songs.
create policy "read shared and own songs" on public.songs
  for select using (church_id is null or church_id = public.my_church_id());

-- A church's media team manages its own songs; platform admins manage the
-- shared library.
create policy "add songs" on public.songs
  for insert with check (
    church_id = public.my_church_id() or (church_id is null and public.is_platform_admin())
  );
create policy "edit songs" on public.songs
  for update
  using (church_id = public.my_church_id() or (church_id is null and public.is_platform_admin()))
  with check (church_id = public.my_church_id() or (church_id is null and public.is_platform_admin()));
create policy "delete songs" on public.songs
  for delete using (church_id = public.my_church_id() or (church_id is null and public.is_platform_admin()));
