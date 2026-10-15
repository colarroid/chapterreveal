-- The translation list's order and visibility, set by platform admins on the
-- admin site, for built-in and added translations alike (built-in ones have
-- no row in `translations`). Added translations also keep `published`: the
-- admin site's Hide/Show uses it for them and `hidden` here for built-ins.
-- And each user's starred translations, which go to the top of their picker.

create table if not exists public.translation_order (
  translation_id text primary key check (translation_id ~ '^[a-z0-9][a-z0-9-]{1,15}$'),
  position integer not null default 0,
  hidden boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.translation_order enable row level security;

drop policy if exists "everyone reads translation order" on public.translation_order;
drop policy if exists "platform admins add translation order" on public.translation_order;
drop policy if exists "platform admins change translation order" on public.translation_order;
drop policy if exists "platform admins remove translation order" on public.translation_order;
create policy "everyone reads translation order" on public.translation_order
  for select to authenticated using (true);
create policy "platform admins add translation order" on public.translation_order
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform admins change translation order" on public.translation_order
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins remove translation order" on public.translation_order
  for delete to authenticated using (public.is_platform_admin());

create table if not exists public.translation_stars (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  translation_id text not null check (translation_id ~ '^[a-z0-9][a-z0-9-]{1,15}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, translation_id)
);
alter table public.translation_stars enable row level security;

drop policy if exists "users manage their stars" on public.translation_stars;
create policy "users manage their stars" on public.translation_stars
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
