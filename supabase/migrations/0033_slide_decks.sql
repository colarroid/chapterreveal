-- Presentations: slides in named sets (decided 2026-10-23), e.g. "Sunday
-- announcements", "Youth night". A church makes a presentation, then adds
-- its slides one by one, each text, picture(s) or a video.
--
-- Slides a church already has go into a presentation called "Our slides".
-- Deleting a presentation deletes its slides (the console deletes their
-- pictures and videos from storage first).
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

create table if not exists public.slide_decks (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists slide_decks_church on public.slide_decks(church_id, position, created_at);

alter table public.slide_decks enable row level security;
drop policy if exists "members read presentations" on public.slide_decks;
create policy "members read presentations" on public.slide_decks for select using (church_id = public.my_church_id());
drop policy if exists "members add presentations" on public.slide_decks;
create policy "members add presentations" on public.slide_decks for insert with check (church_id = public.my_church_id());
drop policy if exists "members change presentations" on public.slide_decks;
create policy "members change presentations" on public.slide_decks
  for update using (church_id = public.my_church_id()) with check (church_id = public.my_church_id());
drop policy if exists "members remove presentations" on public.slide_decks;
create policy "members remove presentations" on public.slide_decks for delete using (church_id = public.my_church_id());

-- From 2026-10-30 Supabase stops granting new tables automatically (see 0025).
grant select, insert, update, delete on public.slide_decks to authenticated;
grant all on public.slide_decks to service_role;

alter table public.slides add column if not exists deck_id uuid references public.slide_decks(id) on delete cascade;
create index if not exists slides_deck on public.slides(deck_id, position, created_at);

-- Slides from before presentations: into "Our slides", one per church.
do $$
declare
  c record;
  d uuid;
begin
  for c in select distinct church_id from public.slides where deck_id is null loop
    insert into public.slide_decks (church_id, name) values (c.church_id, 'Our slides') returning id into d;
    update public.slides set deck_id = d where church_id = c.church_id and deck_id is null;
  end loop;
end $$;

-- The Free plan (decided 2026-10-23): 2 presentations, 10 slides in each,
-- 2 pictures on a slide (was 3). Paid: no limit on presentations or their
-- slides, 6 pictures on a slide. Everything else as in 0023. Slides made
-- before this stay as they are; the limits apply to what's added.
create or replace function public.plan_limit(p_church uuid, p_kind text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.church_plan(p_church) = 'paid' then
      case p_kind when 'slide_images' then 6 end
    else
      case p_kind when 'image' then 5 when 'video' then 2 when 'gradient' then 10 when 'slide' then 10
                  when 'slide_images' then 2 when 'video_slide' then 0 when 'deck' then 2 when 'deck_slides' then 10 end
  end;
$$;
grant execute on function public.plan_limit(uuid, text) to authenticated;

create or replace function public.slide_deck_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cap integer;
begin
  cap := public.plan_limit(new.church_id, 'deck');
  if cap is not null and (select count(*) from slide_decks where church_id = new.church_id) >= cap then
    raise exception 'The Free plan has up to % presentations. Delete one to make another, or upgrade.', cap using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists slide_decks_rules on public.slide_decks;
create trigger slide_decks_rules before insert on public.slide_decks
  for each row execute function public.slide_deck_rules();

create or replace function public.deck_slide_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cap integer;
begin
  if new.deck_id is null or (tg_op = 'UPDATE' and new.deck_id is not distinct from old.deck_id) then return new; end if;
  cap := public.plan_limit(new.church_id, 'deck_slides');
  if cap is not null and (select count(*) from slides where deck_id = new.deck_id) >= cap then
    raise exception 'A presentation on the Free plan has up to % slides. Start another presentation, or upgrade.', cap using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists slides_deck_rules on public.slides;
create trigger slides_deck_rules before insert or update of deck_id on public.slides
  for each row execute function public.deck_slide_rules();
