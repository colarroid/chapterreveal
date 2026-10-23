-- How a picture slide fills the screen (decided 2026-10-23): 'height' (the
-- default) shows each picture's full height, 'width' its full width. Set
-- per slide from the console's preview.
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

alter table public.slides add column if not exists fit text not null default 'height';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'slides_fit_check') then
    alter table public.slides add constraint slides_fit_check check (fit in ('height', 'width'));
  end if;
end $$;
