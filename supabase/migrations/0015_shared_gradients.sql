-- The one-click gradients in Design, managed from the admin site (Design →
-- Gradients) instead of the code. Seeded with the gradients the app shipped.

create table if not exists public.shared_gradients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  from_color text not null check (from_color ~ '^#[0-9a-fA-F]{6}$'),
  to_color text not null check (to_color ~ '^#[0-9a-fA-F]{6}$'),
  angle integer not null default 90 check (angle between 0 and 360),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.shared_gradients enable row level security;

drop policy if exists "everyone sees gradients" on public.shared_gradients;
drop policy if exists "platform admins add gradients" on public.shared_gradients;
drop policy if exists "platform admins change gradients" on public.shared_gradients;
drop policy if exists "platform admins remove gradients" on public.shared_gradients;

create policy "everyone sees gradients" on public.shared_gradients
  for select using (true);
create policy "platform admins add gradients" on public.shared_gradients
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform admins change gradients" on public.shared_gradients
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform admins remove gradients" on public.shared_gradients
  for delete to authenticated using (public.is_platform_admin());

-- The original eight, in their original order (created_at spaced a second apart).
insert into public.shared_gradients (name, from_color, to_color, angle, created_at)
select v.name, v.from_color, v.to_color, v.angle, now() + (v.n || ' seconds')::interval
from (values
  (1, 'Sunburst', '#ffc500', '#c21500', 90),
  (2, 'Olive', '#999966', '#666600', 90),
  (3, 'Crimson', '#7a2828', '#a73737', 90),
  (4, 'Deep sea', '#182848', '#4b6cb7', 90),
  (5, 'Plum', '#480048', '#c04848', 90),
  (6, 'Midnight', '#0b1a3a', '#020617', 160),
  (7, 'Forest', '#14532d', '#03140a', 160),
  (8, 'Royal', '#4c1d95', '#0f0520', 150)
) as v(n, name, from_color, to_color, angle)
where not exists (select 1 from public.shared_gradients);
