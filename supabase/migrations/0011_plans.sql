-- Plans: each church is on Free or Paid. Free churches can upload 2
-- projector backgrounds; paid churches have no limit. The plan lives in its
-- own table (not churches.settings) because church admins can edit their
-- church: only platform admins may change a plan.

create table if not exists public.church_plans (
  church_id uuid primary key references public.churches(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'paid')),
  updated_at timestamptz not null default now()
);
alter table public.church_plans enable row level security;
drop policy if exists "members see their plan" on public.church_plans;
create policy "members see their plan" on public.church_plans
  for select using (church_id = public.my_church_id());
-- No insert/update policies: only the functions below change plans.

/** A church's plan; no row means Free. */
create or replace function public.church_plan(p_church uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select plan from church_plans where church_id = p_church), 'free');
$$;
grant execute on function public.church_plan(uuid) to authenticated;

-- The background limit, enforced where it can't be skipped.
create or replace function public.enforce_background_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.church_plan(new.church_id) = 'free'
     and (select count(*) from backgrounds where church_id = new.church_id) >= 2 then
    raise exception 'The Free plan includes 2 backgrounds. Delete one, or upgrade to add more.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists backgrounds_limit on public.backgrounds;
create trigger backgrounds_limit before insert on public.backgrounds
  for each row execute function public.enforce_background_limit();

-- Platform admins set a church's plan (admin site → Churches).
create or replace function public.admin_set_church_plan(p_church uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_plan not in ('free', 'paid') then
    raise exception 'Unknown plan %', p_plan;
  end if;
  insert into church_plans (church_id, plan, updated_at) values (p_church, p_plan, now())
  on conflict (church_id) do update set plan = excluded.plan, updated_at = now();
end;
$$;
revoke all on function public.admin_set_church_plan(uuid, text) from public, anon;
grant execute on function public.admin_set_church_plan(uuid, text) to authenticated;
