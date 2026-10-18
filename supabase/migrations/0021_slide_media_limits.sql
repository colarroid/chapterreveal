-- Slides: video slides, and the Free plan's allowance for picture and video
-- slides: up to 10 at a time, each kept 7 days after upload. Paid: no limit,
-- nothing expires. Text slides are unlimited and never expire.
-- Expired slides are removed when the church next opens Slides
-- (take_expired_slides), which also deletes the files from Cloudinary.

alter table public.slides add column if not exists expires_at timestamptz;

-- Allow video slides: replace the kind and media checks from 0020.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.slides'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%kind%' and pg_get_constraintdef(oid) not like '%char_length%')
  loop
    execute format('alter table public.slides drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.slides add constraint slides_kind_check check (kind in ('text', 'image', 'video'));
alter table public.slides add constraint slides_media_check
  check ((kind = 'text' and image_url is null) or (kind in ('image', 'video') and image_url is not null));

-- The plan's allowance per kind of design; 'slide' counts picture and video slides.
create or replace function public.plan_limit(p_church uuid, p_kind text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.church_plan(p_church) = 'paid' then null
    else case p_kind when 'image' then 5 when 'video' then 2 when 'gradient' then 10 when 'slide' then 10 end
  end;
$$;
grant execute on function public.plan_limit(uuid, text) to authenticated;

-- On upload: the Free plan's 10, and its 7 days.
create or replace function public.slide_media_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare lim integer;
begin
  if new.kind = 'text' then
    new.expires_at := null;
    return new;
  end if;
  lim := public.plan_limit(new.church_id, 'slide');
  if lim is null then
    new.expires_at := null;
    return new;
  end if;
  if (select count(*) from slides where church_id = new.church_id and kind <> 'text' and (expires_at is null or expires_at > now())) >= lim then
    raise exception 'The Free plan keeps % picture and video slides at a time. Delete one, or upgrade to keep more.', lim using errcode = 'P0001';
  end if;
  new.expires_at := now() + interval '7 days';
  return new;
end;
$$;
drop trigger if exists slides_media_rules on public.slides;
create trigger slides_media_rules before insert on public.slides
  for each row execute function public.slide_media_rules();

-- Changing plan: paid keeps everything; back to free starts the 7 days now.
create or replace function public.slide_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan = 'paid' then
    update slides set expires_at = null where church_id = new.church_id;
  else
    update slides set expires_at = now() + interval '7 days'
      where church_id = new.church_id and kind <> 'text' and expires_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists church_plans_slides on public.church_plans;
create trigger church_plans_slides after insert or update of plan on public.church_plans
  for each row execute function public.slide_plan_change();

-- Removes this church's expired slides and returns their files, for the
-- server to delete from Cloudinary.
create or replace function public.take_expired_slides()
returns table (public_id text, kind text)
language sql
security definer
set search_path = public
as $$
  delete from slides
  where church_id = public.my_church_id() and expires_at is not null and expires_at <= now()
  returning slides.public_id, slides.kind;
$$;
revoke all on function public.take_expired_slides() from public, anon;
grant execute on function public.take_expired_slides() to authenticated;
