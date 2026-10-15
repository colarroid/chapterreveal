-- Live Scripture Detection: initial schema.
-- Paste into the Supabase SQL editor and run once on a fresh project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Settings the admin controls. Kept loose so v1 settings need no migration.
  settings jsonb not null default '{"translation":"kjv","silence_end_minutes":20}'::jsonb
);

create table public.church_members (
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'operator')),
  created_at timestamptz not null default now(),
  primary key (church_id, user_id)
);
-- One church per account for now.
create unique index church_members_one_church on public.church_members(user_id);

create table public.church_invites (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  code text not null unique default upper(encode(gen_random_bytes(5), 'hex')),
  role text not null default 'operator' check (role in ('admin', 'operator')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users(id),
  used_at timestamptz
);

-- What the output page is showing. The token in the output URL is the only
-- thing the projector and vMix know, so it must be hard to guess.
create table public.screens (
  church_id uuid primary key references public.churches(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  payload jsonb,
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  started_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('operator', 'silence', 'abandoned')),
  -- Seconds of audio streamed to the transcriber. Tracked from day one so
  -- paid plans can switch on later.
  audio_seconds integer not null default 0
);
create index services_church_started on public.services(church_id, started_at desc);

create table public.transcript_segments (
  id bigint generated always as identity primary key,
  service_id uuid not null references public.services(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  seq integer not null,
  start_ms integer not null,
  end_ms integer not null,
  text text not null,
  created_at timestamptz not null default now(),
  unique (service_id, seq)
);

create table public.verses_shown (
  id bigint generated always as identity primary key,
  service_id uuid not null references public.services(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  label text not null,
  book smallint not null,
  chapter smallint not null,
  verse_start smallint,
  verse_end smallint,
  translation text not null,
  source text not null check (source in ('detected', 'search', 'step')),
  confidence real,
  -- Where in the transcript the reference was spoken, when it was detected.
  segment_seq integer,
  char_start integer,
  char_end integer,
  shown_at timestamptz not null default now()
);
create index verses_shown_service on public.verses_shown(service_id, shown_at);

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so RLS policies can call them without recursing
-- into church_members' own policies.

create or replace function public.my_church_id()
returns uuid language sql stable security definer set search_path = public as $$
  select church_id from church_members where user_id = auth.uid() limit 1
$$;

create or replace function public.is_church_admin(p_church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from church_members
    where church_id = p_church and user_id = auth.uid() and role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- Row level security: everything is visible only inside its own church.

alter table public.churches enable row level security;
alter table public.church_members enable row level security;
alter table public.church_invites enable row level security;
alter table public.screens enable row level security;
alter table public.services enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.verses_shown enable row level security;

create policy "members read their church" on public.churches
  for select using (id = public.my_church_id());
create policy "admins update their church" on public.churches
  for update using (public.is_church_admin(id)) with check (public.is_church_admin(id));

create policy "members see each other" on public.church_members
  for select using (church_id = public.my_church_id());
create policy "admins remove members" on public.church_members
  for delete using (public.is_church_admin(church_id) and user_id <> auth.uid());

create policy "admins read invites" on public.church_invites
  for select using (public.is_church_admin(church_id));
create policy "admins create invites" on public.church_invites
  for insert with check (public.is_church_admin(church_id) and created_by = auth.uid());
create policy "admins delete invites" on public.church_invites
  for delete using (public.is_church_admin(church_id));

create policy "members read screen" on public.screens
  for select using (church_id = public.my_church_id());
create policy "members drive screen" on public.screens
  for update using (church_id = public.my_church_id()) with check (church_id = public.my_church_id());

create policy "members read services" on public.services
  for select using (church_id = public.my_church_id());
create policy "members start services" on public.services
  for insert with check (church_id = public.my_church_id() and started_by = auth.uid());
create policy "members update services" on public.services
  for update using (church_id = public.my_church_id()) with check (church_id = public.my_church_id());

create policy "members read transcripts" on public.transcript_segments
  for select using (church_id = public.my_church_id());
create policy "members write transcripts" on public.transcript_segments
  for insert with check (
    church_id = public.my_church_id()
    and exists (select 1 from public.services s where s.id = transcript_segments.service_id and s.church_id = transcript_segments.church_id)
  );

create policy "members read verses shown" on public.verses_shown
  for select using (church_id = public.my_church_id());
create policy "members log verses shown" on public.verses_shown
  for insert with check (
    church_id = public.my_church_id()
    and exists (select 1 from public.services s where s.id = verses_shown.service_id and s.church_id = verses_shown.church_id)
  );

-- ---------------------------------------------------------------------------
-- RPCs

-- Creates a church with the caller as its admin, plus its output screen.
create or replace function public.create_church(p_name text)
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
  insert into churches (name, created_by) values (trim(p_name), auth.uid()) returning id into v_church;
  insert into church_members (church_id, user_id, role) values (v_church, auth.uid(), 'admin');
  insert into screens (church_id) values (v_church);
  return v_church;
end $$;

-- Joins the church that issued an invite code. Codes are single use.
create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv church_invites;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from church_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a church';
  end if;
  select * into v_inv from church_invites
    where code = upper(trim(p_code)) and used_at is null and expires_at > now()
    for update;
  if not found then
    raise exception 'That invite code is not valid or has expired';
  end if;
  insert into church_members (church_id, user_id, role) values (v_inv.church_id, auth.uid(), v_inv.role);
  update church_invites set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  return v_inv.church_id;
end $$;

-- The output page has no login. It reads the current slide by its token.
create or replace function public.get_screen(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select payload from screens where token = p_token
$$;

-- Hands out a fresh output URL if the old one leaked.
create or replace function public.rotate_screen_token()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text;
begin
  if not public.is_church_admin(public.my_church_id()) then
    raise exception 'Only a church admin can do that';
  end if;
  update screens set token = encode(gen_random_bytes(18), 'hex')
    where church_id = public.my_church_id()
    returning token into v_token;
  return v_token;
end $$;

-- Members' emails for the settings page. auth.users is not readable directly.
create or replace function public.church_member_list()
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from church_members m join auth.users u on u.id = m.user_id
  where m.church_id = public.my_church_id()
  order by m.created_at
$$;

revoke all on function public.create_church(text) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
revoke all on function public.rotate_screen_token() from public, anon;
revoke all on function public.church_member_list() from public, anon;
grant execute on function public.create_church(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.rotate_screen_token() to authenticated;
grant execute on function public.church_member_list() to authenticated;
grant execute on function public.get_screen(text) to anon, authenticated;
