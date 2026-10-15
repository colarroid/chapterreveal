-- 0003: safe retries for the verse log, and the sign-in email check.
-- Run after 0002. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Verses shown are logged from the browser's outbox, which may send the same
-- record twice (after a request that succeeded but whose reply was lost).
-- A client-made id lets the database ignore the repeat.

alter table public.verses_shown add column if not exists client_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'verses_shown_client_id_key') then
    alter table public.verses_shown add constraint verses_shown_client_id_key unique (client_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Whether an email already has an account, so sign in can say "no account
-- for that email" and sign up can say "you already have one" before anyone
-- types a password.

create or replace function public.email_has_account(p_email text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email)) and deleted_at is null
  )
$$;

revoke all on function public.email_has_account(text) from public;
grant execute on function public.email_has_account(text) to anon, authenticated;
