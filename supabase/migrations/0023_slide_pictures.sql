-- Picture slides can hold several pictures, shown side by side: up to 3 on
-- the Free plan, 6 on Paid. Video slides become a Paid feature. Free picture
-- slides are still kept 7 days (0021).

alter table public.slides add column if not exists images jsonb not null default '[]'::jsonb;

-- Existing picture slides: their one picture becomes the list.
update public.slides
set images = jsonb_build_array(jsonb_build_object('url', image_url, 'public_id', public_id))
where kind = 'image' and images = '[]'::jsonb and image_url is not null;

-- The plan's allowance per kind: 'slide_images' is pictures on one slide,
-- 'video_slide' is 0 when video slides aren't included.
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
                  when 'slide_images' then 3 when 'video_slide' then 0 end
  end;
$$;
grant execute on function public.plan_limit(uuid, text) to authenticated;

-- Pictures on a slide, and video slides, checked whenever a slide is saved.
create or replace function public.slide_picture_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cap integer;
begin
  if new.kind = 'video' and tg_op = 'INSERT' and public.plan_limit(new.church_id, 'video_slide') = 0 then
    raise exception 'Video slides are on the Paid plan. Upload pictures instead, or upgrade.' using errcode = 'P0001';
  end if;
  if new.kind = 'image' then
    if jsonb_typeof(new.images) <> 'array' or jsonb_array_length(new.images) = 0 then
      raise exception 'A picture slide needs at least one picture.' using errcode = 'P0001';
    end if;
    cap := public.plan_limit(new.church_id, 'slide_images');
    if cap is not null and jsonb_array_length(new.images) > cap then
      raise exception 'Your plan allows % pictures on one slide.', cap using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists slides_picture_rules on public.slides;
create trigger slides_picture_rules before insert or update of images, kind on public.slides
  for each row execute function public.slide_picture_rules();

-- Expired slides now return every picture's file, for the server to delete.
drop function if exists public.take_expired_slides();
create function public.take_expired_slides()
returns table (public_id text, kind text, images jsonb)
language sql
security definer
set search_path = public
as $$
  delete from slides
  where church_id = public.my_church_id() and expires_at is not null and expires_at <= now()
  returning slides.public_id, slides.kind, slides.images;
$$;
revoke all on function public.take_expired_slides() from public, anon;
grant execute on function public.take_expired_slides() to authenticated;
