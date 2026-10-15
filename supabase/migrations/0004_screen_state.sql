-- 0004: the output page can tell "nothing on screen" apart from "this link
-- was replaced". Run after 0003. Safe to re-run.

-- Returns null when the token no longer exists (the admin made a new link),
-- otherwise {"payload": ...}, where payload is null when the screen is clear.
create or replace function public.screen_state(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('payload', payload) from screens where token = p_token
$$;

grant execute on function public.screen_state(text) to anon, authenticated;
