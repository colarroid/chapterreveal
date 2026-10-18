-- Licensed Bibles (added on the admin site: NKJV, NLT...) were in a public
-- bucket: anyone with the address could download a whole translation. Now:
--   - the bucket is private;
--   - signed-in users can read published translations' files (the app's
--     /api/bible route reads them for its church), platform admins all;
--   - each church has its own key: the route encrypts the text with it, and
--     the console keeps the offline copy encrypted on the computer.
-- The built-in public-domain Bibles (served from the app's own /bibles) are
-- not affected.

update storage.buckets set public = false where id = 'bibles';

drop policy if exists "members read published bibles" on storage.objects;
create policy "members read published bibles" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bibles'
    and exists (select 1 from public.translations t where t.published and storage.objects.name like t.id || '/%')
  );
-- (Platform admins already read every file: "admins read bibles", 0018.)

create table if not exists public.church_keys (
  church_id uuid primary key references public.churches(id) on delete cascade,
  key bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now()
);
alter table public.church_keys enable row level security;
-- No policies: read only through bible_key() below.

-- This church's key (base64), made the first time it's asked for.
create or replace function public.bible_key()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_church uuid := public.my_church_id();
  v_key bytea;
begin
  if v_church is null then
    raise exception 'No church';
  end if;
  insert into church_keys (church_id) values (v_church) on conflict (church_id) do nothing;
  select key into v_key from church_keys where church_id = v_church;
  return encode(v_key, 'base64');
end;
$$;
revoke all on function public.bible_key() from public, anon;
grant execute on function public.bible_key() to authenticated;
