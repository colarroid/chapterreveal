-- Bible translations added from the admin dashboard, shown to every church.
-- The built-in public-domain ones (kjv, bsb, nheb, asv, bbe) ship with the
-- app in public/bibles and are not in this table.
--
-- The text itself lives in the public "bibles" storage bucket as
-- <id>/v<version>.json, served from the CDN and cached for a year: a new
-- upload gets a new version, so a cached old file is never shown.

-- People who run the platform (not church admins). Add yourself once:
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy "see own admin row" on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
grant execute on function public.is_platform_admin() to authenticated;

create table public.translations (
  id text primary key
    check (id ~ '^[a-z0-9][a-z0-9-]{1,15}$')
    check (id not in ('kjv', 'bsb', 'nheb', 'asv', 'bbe')),
  short text not null check (char_length(short) between 1 and 12),
  name text not null check (char_length(name) between 2 and 120),
  language text not null default 'en',
  -- Shown under each verse on the projector when the licence asks for it.
  copyright text not null default '',
  version int not null default 1,
  verse_count int not null default 0,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.translations enable row level security;

create policy "read published translations" on public.translations
  for select to authenticated using (published or public.is_platform_admin());
create policy "admins add translations" on public.translations
  for insert to authenticated with check (public.is_platform_admin());
create policy "admins change translations" on public.translations
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "admins remove translations" on public.translations
  for delete to authenticated using (public.is_platform_admin());

-- Storage: anyone can read (the files are fetched straight from the CDN),
-- only platform admins can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bibles', 'bibles', true, 20971520, array['application/json'])
on conflict (id) do nothing;

create policy "admins upload bibles" on storage.objects
  for insert to authenticated with check (bucket_id = 'bibles' and public.is_platform_admin());
create policy "admins replace bibles" on storage.objects
  for update to authenticated using (bucket_id = 'bibles' and public.is_platform_admin());
create policy "admins delete bibles" on storage.objects
  for delete to authenticated using (bucket_id = 'bibles' and public.is_platform_admin());
