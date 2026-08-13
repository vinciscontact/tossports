-- ============================================================
--  TOSS SPORTS — product categories
--
--  Bats stop being the only thing the store can sell. Categories are a
--  flat list managed in the Maze Room; every product belongs to exactly
--  one. The storefront reads the same table, so a category created in
--  the Maze Room appears on the shop page automatically.
--
--  Deleting a category that still has products is blocked BY THE
--  DATABASE (restrict FK), not just by the UI — stock can never
--  silently vanish with its category.
--
--  Run after 006-stock-and-photos.sql. Safe to re-run.
-- ============================================================

create table if not exists public.categories (
  id         text primary key,                 -- slug: 'bats', 'rare-balls'
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

-- everyone can see categories (the shop needs them); only admins write
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select using (true);

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- the founding category — every existing product is a bat
insert into public.categories (id, name, sort)
values ('bats', 'Bats', 0)
on conflict (id) do nothing;

-- products point at their category; existing rows backfill to 'bats'
alter table public.products
  add column if not exists category text not null default 'bats';

update public.products set category = 'bats'
 where category is null or category = '';

-- restrict: a category with products in it cannot be deleted
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_category_fkey'
  ) then
    alter table public.products
      add constraint products_category_fkey
      foreign key (category) references public.categories(id)
      on update cascade on delete restrict;
  end if;
end $$;

-- self-test: the founding state must hold
do $$
declare n int;
begin
  select count(*) into n from public.categories where id = 'bats';
  if n <> 1 then raise exception 'categories seed failed'; end if;
  select count(*) into n from public.products where category not in
    (select id from public.categories);
  if n <> 0 then raise exception '% products have an unknown category', n; end if;
end $$;
