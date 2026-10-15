-- Read access for the admin site (Users and Churches). Church data is
-- otherwise only visible to that church's members, so these run as the
-- owner and refuse anyone who isn't a platform admin.

create or replace function public.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
end;
$$;

-- Everyone with an account, and the church they belong to.
create or replace function public.admin_users()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  church_id uuid,
  church_name text,
  role text,
  is_platform_admin boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  return query
    select u.id, u.email::text, coalesce(p.first_name, ''), coalesce(p.last_name, ''), p.phone,
           u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
           c.id, c.name, m.role, pa.user_id is not null
    from auth.users u
    left join profiles p on p.id = u.id
    left join church_members m on m.user_id = u.id
    left join churches c on c.id = m.church_id
    left join platform_admins pa on pa.user_id = u.id
    order by u.created_at desc;
end;
$$;

-- Every church, with how much it uses the app.
create or replace function public.admin_churches()
returns table (
  id uuid,
  name text,
  country_code text,
  region text,
  street_address text,
  created_at timestamptz,
  created_by_email text,
  member_count bigint,
  service_count bigint,
  last_service_at timestamptz,
  audio_seconds bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  return query
    select c.id, c.name, c.country_code, c.region, c.street_address, c.created_at, u.email::text,
           (select count(*) from church_members m where m.church_id = c.id),
           (select count(*) from services s where s.church_id = c.id),
           (select max(s.started_at) from services s where s.church_id = c.id),
           (select coalesce(sum(s.audio_seconds), 0)::bigint from services s where s.church_id = c.id)
    from churches c
    left join auth.users u on u.id = c.created_by
    order by c.created_at desc;
end;
$$;

-- One church: its members and its last 50 services.
create or replace function public.admin_church(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object(
    'church', jsonb_build_object(
      'id', c.id, 'name', c.name, 'country_code', c.country_code, 'region', c.region,
      'street_address', c.street_address, 'created_at', c.created_at, 'settings', c.settings,
      'created_by_email', (select email from auth.users where id = c.created_by)
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'email', u.email, 'first_name', coalesce(p.first_name, ''),
        'last_name', coalesce(p.last_name, ''), 'phone', p.phone, 'role', m.role,
        'joined_at', m.created_at, 'last_sign_in_at', u.last_sign_in_at
      ) order by m.created_at)
      from church_members m
      join auth.users u on u.id = m.user_id
      left join profiles p on p.id = m.user_id
      where m.church_id = c.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(row_to_json(s)::jsonb order by s.started_at desc)
      from (
        select sv.id, sv.started_at, sv.ended_at, sv.end_reason, sv.audio_seconds,
               (select count(*) from verses_shown v where v.service_id = sv.id) as verses
        from services sv
        where sv.church_id = c.id
        order by sv.started_at desc
        limit 50
      ) s
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'services', (select count(*) from services where church_id = c.id),
      'audio_seconds', (select coalesce(sum(audio_seconds), 0) from services where church_id = c.id),
      'verses', (select count(*) from verses_shown where church_id = c.id)
    )
  ) into result
  from churches c
  where c.id = p_id;
  return result;
end;
$$;

-- Grant or remove platform admin. You can't remove yourself, so the
-- platform is never left without an admin by accident.
create or replace function public.admin_set_platform_admin(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_on then
    insert into platform_admins (user_id) values (p_user) on conflict do nothing;
  else
    if p_user = (select auth.uid()) then
      raise exception 'You can''t remove your own admin access' using errcode = '42501';
    end if;
    delete from platform_admins where user_id = p_user;
  end if;
end;
$$;

revoke all on function public.assert_platform_admin() from public, anon;
revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_churches() from public, anon;
revoke all on function public.admin_church(uuid) from public, anon;
revoke all on function public.admin_set_platform_admin(uuid, boolean) from public, anon;
grant execute on function public.assert_platform_admin() to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_churches() to authenticated;
grant execute on function public.admin_church(uuid) to authenticated;
grant execute on function public.admin_set_platform_admin(uuid, boolean) to authenticated;
