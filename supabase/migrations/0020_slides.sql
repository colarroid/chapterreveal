-- Slides: a church's own text and picture slides (announcements, notices,
-- welcome messages, flyers), kept to put on screen again any week. Pictures
-- are stored in Cloudinary in the church's folder, like its backgrounds.

create table if not exists public.slides (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  kind text not null check (kind in ('text', 'image')),
  title text not null default '' check (char_length(title) <= 120),
  -- Text slides: the words, one line per line.
  body text not null default '' check (char_length(body) <= 2000),
  -- Picture slides: the projector copy, and Cloudinary's id for deleting it.
  image_url text check (image_url is null or image_url like 'https://res.cloudinary.com/%'),
  public_id text,
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'text' and image_url is null) or (kind = 'image' and image_url is not null))
);
create index if not exists slides_church_position on public.slides(church_id, position, created_at);

alter table public.slides enable row level security;

drop policy if exists "members see slides" on public.slides;
drop policy if exists "members add slides" on public.slides;
drop policy if exists "members change slides" on public.slides;
drop policy if exists "members remove slides" on public.slides;

-- The whole media team works with slides, like songs and playlists.
create policy "members see slides" on public.slides
  for select using (church_id = public.my_church_id());
create policy "members add slides" on public.slides
  for insert with check (church_id = public.my_church_id());
create policy "members change slides" on public.slides
  for update using (church_id = public.my_church_id()) with check (church_id = public.my_church_id());
create policy "members remove slides" on public.slides
  for delete using (church_id = public.my_church_id());
