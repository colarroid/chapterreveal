-- Churches keep their own designs: uploaded pictures and videos (already in
-- backgrounds) and now saved gradients. Each church sees only its own plus
-- the shared ones from the admin site, and can reuse them any time.
-- Free plan: 5 pictures, 2 videos, 10 gradients. Paid: no limit.
-- Run after 0014 and 0015.

alter table public.shared_gradients rename to gradients;
alter table public.gradients add column if not exists church_id uuid references public.churches(id) on delete cascade;
create index if not exists gradients_church_created on public.gradients(church_id, created_at);

drop policy if exists "everyone sees gradients" on public.gradients;
drop policy if exists "platform admins add gradients" on public.gradients;
drop policy if exists "platform admins change gradients" on public.gradients;
drop policy if exists "platform admins remove gradients" on public.gradients;
drop policy if exists "see shared and own gradients" on public.gradients;
drop policy if exists "add gradients" on public.gradients;
drop policy if exists "remove gradients" on public.gradients;

-- Shared rows (no church) belong to platform admins; a church's rows to its admins.
create policy "see shared and own gradients" on public.gradients
  for select using (church_id is null or church_id = public.my_church_id());
create policy "add gradients" on public.gradients
  for insert to authenticated with check (
    (church_id is null and public.is_platform_admin())
    or (church_id = public.my_church_id() and public.is_church_admin(church_id))
  );
create policy "remove gradients" on public.gradients
  for delete to authenticated using (
    (church_id is null and public.is_platform_admin())
    or (church_id = public.my_church_id() and public.is_church_admin(church_id))
  );

-- The plan's allowance for one kind of design. Null means no limit.
create or replace function public.plan_limit(p_church uuid, p_kind text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.church_plan(p_church) = 'paid' then null
    else case p_kind when 'image' then 5 when 'video' then 2 when 'gradient' then 10 end
  end;
$$;
grant execute on function public.plan_limit(uuid, text) to authenticated;

create or replace function public.enforce_background_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare lim integer;
begin
  if new.church_id is null then return new; end if;
  lim := public.plan_limit(new.church_id, new.kind);
  if lim is not null and (select count(*) from backgrounds where church_id = new.church_id and kind = new.kind) >= lim then
    raise exception 'The Free plan includes % %. Delete one, or upgrade to add more.',
      lim, case new.kind when 'image' then 'pictures' else 'videos' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_gradient_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare lim integer;
begin
  if new.church_id is null then return new; end if;
  lim := public.plan_limit(new.church_id, 'gradient');
  if lim is not null and (select count(*) from gradients where church_id = new.church_id) >= lim then
    raise exception 'The Free plan includes % saved gradients. Delete one, or upgrade to add more.', lim using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists gradients_limit on public.gradients;
create trigger gradients_limit before insert on public.gradients
  for each row execute function public.enforce_gradient_limit();
