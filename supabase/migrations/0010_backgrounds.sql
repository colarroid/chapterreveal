-- Projector backgrounds: pictures and short looping videos a church uploads
-- in Settings → Display. The files live in Cloudinary (uploaded straight from
-- the browser with a signature from /api/backgrounds/sign); this table is the
-- church's list of them, so the picker loads without asking Cloudinary.

create table if not exists public.backgrounds (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  -- The optimised link the projector loads (res.cloudinary.com/...).
  url text not null check (url like 'https://res.cloudinary.com/%'),
  -- Cloudinary's id for the file, for deleting it there too.
  public_id text not null unique,
  bytes integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists backgrounds_church_created on public.backgrounds(church_id, created_at desc);

alter table public.backgrounds enable row level security;

drop policy if exists "members see backgrounds" on public.backgrounds;
drop policy if exists "admins add backgrounds" on public.backgrounds;
drop policy if exists "admins remove backgrounds" on public.backgrounds;

create policy "members see backgrounds" on public.backgrounds
  for select using (church_id = public.my_church_id());
create policy "admins add backgrounds" on public.backgrounds
  for insert with check (church_id = public.my_church_id() and public.is_church_admin(church_id));
create policy "admins remove backgrounds" on public.backgrounds
  for delete using (church_id = public.my_church_id() and public.is_church_admin(church_id));
