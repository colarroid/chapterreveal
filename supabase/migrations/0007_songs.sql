-- Each church's song library. Private to the church: lyrics are projected
-- under the church's own CCLI licence, so one church's songs are never shown
-- to another.
--
-- A song is an ordered list of slides, the way churches already run them in
-- VideoPsalm: [{ "label": "Chorus", "text": "line one\nline two" }, ...].
-- "label" is optional (Verse 1, Chorus, Bridge...).

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  author text not null default '' check (char_length(author) <= 200),
  copyright text not null default '' check (char_length(copyright) <= 300),
  ccli_number text not null default '' check (char_length(ccli_number) <= 20),
  slides jsonb not null default '[]'::jsonb check (jsonb_typeof(slides) = 'array'),
  -- All the lyrics as plain text, for searching by any line, and the first
  -- line on its own for the library list.
  body text not null default '',
  first_line text not null default '',
  -- Where it came from, and a fingerprint of the original so importing the
  -- same songbook twice doesn't add the songs twice.
  source text not null default 'manual' check (source in ('manual', 'videopsalm')),
  fingerprint text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_church_title on public.songs(church_id, lower(title));
-- Songs typed in by hand have no fingerprint (null), and nulls never clash.
create unique index songs_church_fingerprint on public.songs(church_id, fingerprint);

alter table public.songs enable row level security;

-- The whole media team manages songs, like they do in VideoPsalm.
create policy "members read songs" on public.songs
  for select using (church_id = public.my_church_id());
create policy "members add songs" on public.songs
  for insert with check (church_id = public.my_church_id());
create policy "members edit songs" on public.songs
  for update using (church_id = public.my_church_id()) with check (church_id = public.my_church_id());
create policy "members delete songs" on public.songs
  for delete using (church_id = public.my_church_id());
