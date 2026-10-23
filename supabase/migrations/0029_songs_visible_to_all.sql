-- Songs a church adds are visible to every church (decided 2026-10-23), so
-- a song pasted once is there for everyone. Only the church that added a
-- song can change or delete it; the shared library stays the platform
-- admins'. The order most churches sing a song (0028) now covers every
-- song, not just the shared library's.
--
-- To make church songs private again: put back the select policy from 0008
-- ("church_id is null or church_id = public.my_church_id()").
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

drop policy if exists "read shared and own songs" on public.songs;
drop policy if exists "members read every song" on public.songs;
create policy "members read every song" on public.songs
  for select using (public.my_church_id() is not null or public.is_platform_admin());

create or replace function public.common_song_orders()
returns table (song_id uuid, slides integer[], churches integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (o.song_id) o.song_id, o.slides, count(*)::integer
  from song_orders o
  where public.my_church_id() is not null
  group by o.song_id, o.slides
  order by o.song_id, count(*) desc, max(o.updated_at) desc
$$;

revoke all on function public.common_song_orders() from public, anon;
grant execute on function public.common_song_orders() to authenticated;
