-- The Free plan (decided 2026-10-23): up to 4 pictures in a presentation,
-- counting every picture on its slides (still up to 2 on one slide), and 2
-- presentations per church (0033). Paid: no limit. Pictures already
-- uploaded stay; the limit applies to what's added.
--
-- Run after 0033. Paste into the Supabase SQL editor and run once. Safe to
-- run again.

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
                  when 'slide_images' then 2 when 'video_slide' then 0 when 'deck' then 2 when 'deck_slides' then 10
                  when 'deck_images' then 4 end
  end;
$$;
grant execute on function public.plan_limit(uuid, text) to authenticated;

create or replace function public.deck_picture_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  others integer;
  mine integer;
begin
  if new.kind <> 'image' or new.deck_id is null then return new; end if;
  mine := jsonb_array_length(coalesce(new.images, '[]'::jsonb));
  -- Only when pictures are added (or the slide moves presentation): taking some off is always fine.
  if tg_op = 'UPDATE' and new.deck_id is not distinct from old.deck_id and mine <= jsonb_array_length(coalesce(old.images, '[]'::jsonb)) then
    return new;
  end if;
  cap := public.plan_limit(new.church_id, 'deck_images');
  if cap is null then return new; end if;
  select coalesce(sum(jsonb_array_length(images)), 0) into others
  from slides where deck_id = new.deck_id and kind = 'image' and id <> new.id;
  if others + mine > cap then
    raise exception 'A presentation on the Free plan has up to % pictures. Take one off, or upgrade.', cap using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists slides_deck_pictures on public.slides;
create trigger slides_deck_pictures before insert or update of images, deck_id, kind on public.slides
  for each row execute function public.deck_picture_rules();
