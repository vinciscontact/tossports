-- ============================================================
-- 024 — ONE STOCK TRIGGER, NOT TWO
-- Run once in: Supabase → SQL editor.
--
-- Every sale was taking twice the stock.
--
-- Two migrations each added their own "take the stock" trigger to
-- public.orders and neither removed the other's:
--
--   006-stock-and-photos.sql  orders_take_stock      → apply_stock_on_order()
--   012-fulfilment.sql        orders_take_stock_ins  → orders_take_stock()
--
-- Both loop the order's items and subtract the same quantity from
-- public.product_stock, so a single order for two bats removed four.
-- Measured on the live database before this was written: stock 20,
-- one order of qty 2, stock 16.
--
-- The same collision exists on cancellation, where the pair below
-- put the stock back twice — so a cancelled order INVENTED stock
-- that was never there.
--
-- The 012 pair is the one worth keeping. It refuses an order it
-- cannot fill, with a message naming the bat and the branch, where
-- the 006 pair clamps silently at zero and lets the shop sell what
-- it does not have. Dropping 006's two leaves exactly one trigger
-- on each side.
--
-- Safe to re-run. It drops triggers only; no data is touched, and
-- the functions are left in place in case anything else calls them.
-- ============================================================

drop trigger if exists orders_take_stock    on public.orders;
drop trigger if exists orders_restore_stock on public.orders;

-- What should be left afterwards: orders_take_stock_ins (before insert)
-- and orders_return_stock_upd (before update), plus orders_sanitise_ins
-- from 016. Anything else named *stock* on this table is a third copy
-- and should be looked at.
select tgname, tgtype
  from pg_trigger
 where tgrelid = 'public.orders'::regclass
   and not tgisinternal
 order by tgname;
