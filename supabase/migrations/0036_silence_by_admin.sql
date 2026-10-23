-- 1. How long a service may stay silent before it ends on its own is now set
-- by platform admins on the admin site, not in a church's Settings
-- (decided 2026-10-23), and the default is 10 minutes for every church.
--
-- Paste into the Supabase SQL editor and run once. Safe to run again (it
-- puts every church back to 10 minutes, so run it once only if admins have
-- since set some churches differently).

update public.churches set settings = settings || '{"silence_end_minutes": 10}'::jsonb;
alter table public.churches alter column settings set default '{"translation":"kjv","silence_end_minutes":10}'::jsonb;

create or replace function public.admin_set_silence_minutes(p_church uuid, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_minutes not between 5 and 120 then
    raise exception 'Between 5 and 120 minutes.' using errcode = 'P0001';
  end if;
  update churches set settings = settings || jsonb_build_object('silence_end_minutes', p_minutes) where id = p_church;
end;
$$;
revoke all on function public.admin_set_silence_minutes(uuid, integer) from public, anon;
grant execute on function public.admin_set_silence_minutes(uuid, integer) to authenticated;

-- 2. The weekly summary goes to every church automatically (decided
-- 2026-10-23), to the email the church signed up with (whoever created it),
-- no longer an opt-in in Settings. The weekly job only sends once the AI
-- sermon summaries are set up (ANTHROPIC_API_KEY), and never for a week
-- without services. Server only.
create or replace function public.summary_recipients()
returns table (church_id uuid, church_name text, email text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, u.email::text
  from churches c
  join auth.users u on u.id = c.created_by
  where u.email is not null
  order by c.id
$$;
revoke all on function public.summary_recipients() from public, anon, authenticated;
grant execute on function public.summary_recipients() to service_role;
