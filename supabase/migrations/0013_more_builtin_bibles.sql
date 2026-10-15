-- Six more public-domain Bibles ship with the app (public/bibles). Their IDs
-- join the reserved list so an added translation can't take one of them.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.translations'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%''bbe''%';
  if c is not null then
    execute format('alter table public.translations drop constraint %I', c);
  end if;
end $$;

alter table public.translations add constraint translations_id_not_built_in
  check (id not in ('kjv', 'bsb', 'nheb', 'asv', 'bbe', 'akjv', 'ukjv', 'dby', 'ylt', 'wbt', 'acv'));
