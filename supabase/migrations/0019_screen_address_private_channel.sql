-- Custom, permanent output addresses (reedark.com/screen/hope-nation) and
-- the change that makes them safe.
--
-- Until now the output's random token was also the only thing stopping
-- someone sending to a church's screen: the realtime channel was public, so
-- anyone who knew the token (and the site's public key) could broadcast
-- their own slide to the projector and livestream. A readable address would
-- be easy to guess. So the screen channels become private: anyone may
-- receive (the projector and vMix aren't signed in), but only signed-in
-- members of the church may send.
--
-- After running this: Supabase -> Realtime -> Settings -> turn OFF "Allow
-- public access", so no public channel can be used to get around it.

-- A church admin chooses the address. Lower case letters, numbers and
-- hyphens, 3 to 40 long. Returns the new address.
create or replace function public.set_screen_address(p_address text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := lower(trim(coalesce(p_address, '')));
begin
  if not public.is_church_admin(public.my_church_id()) then
    raise exception 'Only a church admin can change the output address';
  end if;
  if v !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'Use 3 to 40 lower-case letters, numbers or hyphens, starting and ending with a letter or number.' using errcode = 'P0001';
  end if;
  if exists (select 1 from screens where token = v and church_id <> public.my_church_id()) then
    raise exception 'That address is taken. Try another.' using errcode = 'P0001';
  end if;
  update screens set token = v where church_id = public.my_church_id();
  return v;
end;
$$;
revoke all on function public.set_screen_address(text) from public, anon;
grant execute on function public.set_screen_address(text) to authenticated;

-- Realtime authorization for the private screen channels ("screen:<token>").
drop policy if exists "anyone receives screen updates" on realtime.messages;
drop policy if exists "members send to their screen" on realtime.messages;

create policy "anyone receives screen updates" on realtime.messages
  for select to anon, authenticated
  using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'screen:%');

create policy "members send to their screen" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'screen:' || (select token from public.screens where church_id = public.my_church_id())
  );
