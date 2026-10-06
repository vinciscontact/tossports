-- 033 — the out-of-stock switch (2026-09-25)
--
-- A plain on/off flag the Maze Room sets per product, separate from the stock
-- COUNT. The two answer different questions: stock is how many are on the
-- shelf right now, `sold_out` is "do not sell this at the moment", which is
-- the one the shop needs when bats are cut to order and the count is often 0
-- on purpose.
--
-- The storefront greys the product and refuses to add it to a bag, and this
-- guard is the same rule on the database side — because a page left open in a
-- tab still holds the old answer, and the only place that cannot be stale is
-- here.

alter table public.products
  add column if not exists sold_out boolean not null default false;

comment on column public.products.sold_out is
  'Set from the Maze Room. true = shown as Out of stock and cannot be ordered.';

create or replace function public.orders_block_sold_out()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare item jsonb; pid text; nm text;
begin
  for item in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    pid := item->>'id';
    if pid is null then continue; end if;
    select name into nm from public.products where id = pid and sold_out;
    if found then
      raise exception '% is out of stock at the moment.', coalesce(nm, pid)
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_orders_block_sold_out on public.orders;
create trigger trg_orders_block_sold_out
  before insert on public.orders
  for each row execute function public.orders_block_sold_out();
