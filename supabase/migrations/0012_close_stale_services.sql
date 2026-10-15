-- Services that were never ended (power cut, laptop shut, browser crashed)
-- would otherwise look "live" for ever. This closes them as abandoned, at
-- their last activity, once they've been quiet for longer than the church's
-- own silence timer allows a running console to stay quiet (plus 10
-- minutes, and never under 30): a service that's really running is never
-- touched. Called whenever service history is read.

create or replace function public.close_stale_services(p_church uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  quiet interval;
  closed integer;
begin
  if not (p_church = public.my_church_id() or public.is_platform_admin()) then
    raise exception 'Not your church' using errcode = '42501';
  end if;

  select make_interval(mins => greatest(30, coalesce((settings->>'silence_end_minutes')::int, 20) + 10))
    into quiet
    from churches where id = p_church;

  with activity as (
    select s.id,
           greatest(
             s.started_at,
             coalesce((select max(t.created_at) from transcript_segments t where t.service_id = s.id), s.started_at),
             coalesce((select max(v.shown_at) from verses_shown v where v.service_id = s.id), s.started_at)
           ) as last_at
    from services s
    where s.church_id = p_church and s.ended_at is null
  )
  update services s
     set ended_at = a.last_at, end_reason = 'abandoned'
    from activity a
   where s.id = a.id and a.last_at < now() - quiet;

  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke all on function public.close_stale_services(uuid) from public, anon;
grant execute on function public.close_stale_services(uuid) to authenticated;
