-- Explicit Data API grants on every table in "public".
--
-- From 30 October 2026 Supabase stops granting API access to new tables in
-- "public" automatically. The live project keeps the grants its tables
-- already have, so this changes nothing there. It matters when the schema is
-- rebuilt from these migrations (a new project, a preview branch, a local
-- reset): 0001-0024 were written when the grants came for free.
--
-- Grants only open the door; row level security still decides every row
-- (tables like church_keys and summary_emails have RLS on with no policies,
-- so the browser still can't read them).
--
-- From here on, every migration that creates a table grants on it itself:
--   grant select on public.t to anon;
--   grant select, insert, update, delete on public.t to authenticated, service_role;
--
-- Paste into the Supabase SQL editor and run once. Safe to run again.

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('grant select on public.%I to anon', t.tablename);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t.tablename);
  end loop;
end $$;

-- Identity columns (generated always as identity) draw from sequences.
grant usage, select on all sequences in schema public to authenticated, service_role;
