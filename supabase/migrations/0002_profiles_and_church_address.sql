-- 0002: people's names and phone numbers, and church addresses.
-- Run after 0001_init.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Profiles: first name, last name and phone for every account.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 80),
  last_name text not null default '' check (char_length(last_name) <= 80),
  -- Digits with an optional leading +, spaces, dashes and brackets.
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Fills the profile from what the signup form sent. A malformed phone is
-- dropped rather than allowed to fail the whole signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phone text := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
begin
  insert into profiles (id, first_name, last_name, phone)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), 80),
    left(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), 80),
    case when v_phone ~ '^\+?[0-9 ()-]{7,20}$' then v_phone end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before this migration get an empty profile.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Church address: country (ISO code), state or region, street.

alter table public.churches add column if not exists country_code text check (country_code ~ '^[A-Z]{2}$');
alter table public.churches add column if not exists region text check (char_length(region) <= 80);
alter table public.churches add column if not exists street_address text check (char_length(street_address) <= 200);

-- create_church now takes the address. Drop the old one-argument version so
-- calls are never ambiguous.
drop function if exists public.create_church(text);

create or replace function public.create_church(p_name text, p_country text, p_region text, p_street text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_church uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from church_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a church';
  end if;
  if coalesce(upper(trim(p_country)), '') !~ '^[A-Z]{2}$' then
    raise exception 'Choose a country';
  end if;
  if coalesce(trim(p_region), '') = '' then
    raise exception 'Choose a state';
  end if;
  insert into churches (name, created_by, country_code, region, street_address)
  values (trim(p_name), auth.uid(), upper(trim(p_country)), trim(p_region), nullif(trim(coalesce(p_street, '')), ''))
  returning id into v_church;
  insert into church_members (church_id, user_id, role) values (v_church, auth.uid(), 'admin');
  insert into screens (church_id) values (v_church);
  return v_church;
end $$;

revoke all on function public.create_church(text, text, text, text) from public, anon;
grant execute on function public.create_church(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The member list now carries names and phone numbers. Its return type
-- changes, so it has to be dropped and created again.

drop function if exists public.church_member_list();

create function public.church_member_list()
returns table (user_id uuid, email text, first_name text, last_name text, phone text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, coalesce(p.first_name, ''), coalesce(p.last_name, ''), p.phone, m.role, m.created_at
  from church_members m
  join auth.users u on u.id = m.user_id
  left join profiles p on p.id = m.user_id
  where m.church_id = public.my_church_id()
  order by m.created_at
$$;

revoke all on function public.church_member_list() from public, anon;
grant execute on function public.church_member_list() to authenticated;
