-- The admin site's Overview: the whole platform at a glance, in one call.
-- Totals, the last 30 days against the 30 before, twelve weeks of sign-ups
-- and use, the busiest churches and the newest accounts. Platform admins
-- only (assert_platform_admin, from 0006). No new tables.
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  d30 timestamptz := now() - interval '30 days';
  d60 timestamptz := now() - interval '60 days';
  d7 timestamptz := now() - interval '7 days';
  weeks_start timestamptz := date_trunc('week', now()) - interval '11 weeks';
  result jsonb;
begin
  perform public.assert_platform_admin();

  select jsonb_build_object(
    'generated_at', now_ts,

    'totals', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'users_confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
      'churches', (select count(*) from churches),
      'paid_churches', (select count(*) from church_plans where plan = 'paid'),
      'services', (select count(*) from services),
      'audio_seconds', (select coalesce(sum(audio_seconds), 0) from services),
      'verses_shown', (select count(*) from verses_shown),
      'songs_shown', (select count(*) from songs_shown),
      'church_songs', (select count(*) from songs where church_id is not null),
      'shared_songs', (select count(*) from songs where church_id is null),
      'slides', (select count(*) from slides)
    ),

    -- The last 30 days ("now") against the 30 before ("before").
    'period', jsonb_build_object(
      'new_users', jsonb_build_object(
        'now', (select count(*) from auth.users where created_at >= d30),
        'before', (select count(*) from auth.users where created_at >= d60 and created_at < d30)),
      'new_churches', jsonb_build_object(
        'now', (select count(*) from churches where created_at >= d30),
        'before', (select count(*) from churches where created_at >= d60 and created_at < d30)),
      'active_churches', jsonb_build_object(
        'now', (select count(distinct church_id) from services where started_at >= d30),
        'before', (select count(distinct church_id) from services where started_at >= d60 and started_at < d30)),
      'services', jsonb_build_object(
        'now', (select count(*) from services where started_at >= d30),
        'before', (select count(*) from services where started_at >= d60 and started_at < d30)),
      'audio_seconds', jsonb_build_object(
        'now', (select coalesce(sum(audio_seconds), 0) from services where started_at >= d30),
        'before', (select coalesce(sum(audio_seconds), 0) from services where started_at >= d60 and started_at < d30)),
      'verses_shown', jsonb_build_object(
        'now', (select count(*) from verses_shown where shown_at >= d30),
        'before', (select count(*) from verses_shown where shown_at >= d60 and shown_at < d30)),
      'active_users_7d', (select count(*) from auth.users where last_sign_in_at >= d7)
    ),

    -- Twelve weeks, oldest first, Monday to Sunday.
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'week', to_char(w, 'YYYY-MM-DD'),
        'users', (select count(*) from auth.users u where u.created_at >= w and u.created_at < w + interval '1 week'),
        'churches', (select count(*) from churches c where c.created_at >= w and c.created_at < w + interval '1 week'),
        'services', (select count(*) from services s where s.started_at >= w and s.started_at < w + interval '1 week'),
        'audio_seconds', (select coalesce(sum(s.audio_seconds), 0) from services s where s.started_at >= w and s.started_at < w + interval '1 week'),
        'active_churches', (select count(distinct s.church_id) from services s where s.started_at >= w and s.started_at < w + interval '1 week')
      ) order by w)
      from generate_series(weeks_start, date_trunc('week', now_ts), interval '1 week') as w
    ),

    -- The busiest churches over the last 30 days.
    'top_churches', coalesce((
      select jsonb_agg(t order by t.audio_seconds desc)
      from (
        select c.id, c.name, c.country_code,
               count(s.id) as services,
               coalesce(sum(s.audio_seconds), 0) as audio_seconds,
               (select count(*) from verses_shown v where v.church_id = c.id and v.shown_at >= d30) as verses_shown,
               max(s.started_at) as last_service_at
        from churches c join services s on s.church_id = c.id and s.started_at >= d30
        group by c.id
        order by coalesce(sum(s.audio_seconds), 0) desc
        limit 8
      ) t), '[]'::jsonb),

    -- The newest accounts.
    'recent_users', coalesce((
      select jsonb_agg(r)
      from (
        select u.email::text as email, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null as confirmed,
               (select c.name from church_members m join churches c on c.id = m.church_id
                where m.user_id = u.id order by c.created_at limit 1) as church
        from auth.users u
        order by u.created_at desc
        limit 8
      ) r), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
