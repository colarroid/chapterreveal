-- Shared backgrounds: pictures and videos every church can pick, like the
-- built-in gradients. A row with no church_id is shared. Only platform admins
-- (the admin site) add or remove them, and they don't count toward a
-- church's plan limit.

alter table public.backgrounds alter column church_id drop not null;
alter table public.backgrounds add column if not exists name text not null default ''
  check (char_length(name) <= 60);

drop policy if exists "members see backgrounds" on public.backgrounds;
drop policy if exists "admins add backgrounds" on public.backgrounds;
drop policy if exists "admins remove backgrounds" on public.backgrounds;
drop policy if exists "platform admins add shared backgrounds" on public.backgrounds;
drop policy if exists "platform admins remove shared backgrounds" on public.backgrounds;

create policy "members see backgrounds" on public.backgrounds
  for select using (church_id is null or church_id = public.my_church_id());
create policy "admins add backgrounds" on public.backgrounds
  for insert with check (church_id is not null and church_id = public.my_church_id() and public.is_church_admin(church_id));
create policy "admins remove backgrounds" on public.backgrounds
  for delete using (church_id is not null and church_id = public.my_church_id() and public.is_church_admin(church_id));
create policy "platform admins add shared backgrounds" on public.backgrounds
  for insert to authenticated with check (church_id is null and public.is_platform_admin());
create policy "platform admins remove shared backgrounds" on public.backgrounds
  for delete to authenticated using (church_id is null and public.is_platform_admin());
create policy "platform admins rename shared backgrounds" on public.backgrounds
  for update to authenticated using (church_id is null and public.is_platform_admin()) with check (church_id is null);

-- The Free plan's limit counts the church's own uploads only.
create or replace function public.enforce_background_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.church_id is not null
     and public.church_plan(new.church_id) = 'free'
     and (select count(*) from backgrounds where church_id = new.church_id) >= 2 then
    raise exception 'The Free plan includes 2 backgrounds. Delete one, or upgrade to add more.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
