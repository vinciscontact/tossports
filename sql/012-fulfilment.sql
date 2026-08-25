-- ============================================================
-- 012 — FULFILMENT
--
--   · stock actually comes down when an order is placed
--   · courier and tracking number on an order
--   · a queue of customers who still need to be told
--
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Delivery fields on orders.
--
-- `notified_at` is what makes the confirmation queue work: null
-- means nobody has told this customer their order was received.
-- ------------------------------------------------------------
alter table public.orders add column if not exists courier      text;
alter table public.orders add column if not exists tracking_no  text;
alter table public.orders add column if not exists tracking_url text;
alter table public.orders add column if not exists notified_at  timestamptz;
alter table public.orders add column if not exists branch       text;

create index if not exists orders_unnotified_idx
  on public.orders (created_at desc) where notified_at is null;


-- ------------------------------------------------------------
-- Stock comes down with the order.
--
-- This is a trigger rather than a call the browser makes after
-- inserting, because the browser is not a place to enforce
-- anything. Two people buying the last bat within the same second
-- both see stock 1; whichever insert lands second must fail, and
-- only the database can decide that.
--
-- The UPDATE ... WHERE stock >= qty is the whole mechanism. Row
-- locking inside a single statement means the second transaction
-- waits for the first to commit and then re-evaluates against the
-- new value, so it cannot read a stale number. Reading the stock,
-- checking it, then writing it would leave a window between the
-- read and the write where exactly this race lives.
--
-- Orders that name no branch, or a product with no stock row, are
-- allowed through untouched: a made-to-order bat and a walk-in
-- sale are both real, and refusing them would be worse than not
-- tracking them.
-- ------------------------------------------------------------
create or replace function public.orders_take_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item     jsonb;
  pid      text;
  qty      integer;
  br       text;
  affected integer;
begin
  br := coalesce(new.branch, (select id from public.branches order by id limit 1));
  if br is null then return new; end if;

  for item in select * from jsonb_array_elements(new.items)
  loop
    pid := item->>'id';
    qty := greatest(1, coalesce((item->>'qty')::int, 1));
    if pid is null then continue; end if;

    update public.product_stock
       set stock = stock - qty, updated_at = now()
     where product_id = pid and branch_id = br and stock >= qty;

    get diagnostics affected = row_count;

    if affected = 0 then
      -- Distinguish "we do not track this one" from "there are not enough".
      -- Only the second is an error; the first is normal for made-to-order.
      if exists (select 1 from public.product_stock
                  where product_id = pid and branch_id = br) then
        raise exception
          'Not enough stock for % at %. Someone else may have just taken the last one.',
          pid, br
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists orders_take_stock_ins on public.orders;
create trigger orders_take_stock_ins
  before insert on public.orders
  for each row execute function public.orders_take_stock();


-- ------------------------------------------------------------
-- Put stock back when an order is cancelled.
--
-- Without this, every cancelled order silently loses inventory
-- and the count drifts away from the shelf until someone
-- recounts by hand.
-- ------------------------------------------------------------
create or replace function public.orders_return_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare item jsonb; pid text; qty integer; br text;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  br := coalesce(new.branch, (select id from public.branches order by id limit 1));
  if br is null then return new; end if;

  for item in select * from jsonb_array_elements(new.items)
  loop
    pid := item->>'id';
    qty := greatest(1, coalesce((item->>'qty')::int, 1));
    if pid is null then continue; end if;
    update public.product_stock
       set stock = stock + qty, updated_at = now()
     where product_id = pid and branch_id = br;
  end loop;
  return new;
end;
$$;

drop trigger if exists orders_return_stock_upd on public.orders;
create trigger orders_return_stock_upd
  before update on public.orders
  for each row execute function public.orders_return_stock();


-- ------------------------------------------------------------
-- track_order, replaced to carry the courier details.
--
-- Dropped first and not merely replaced: adding columns to the
-- RETURNS TABLE changes the signature, and CREATE OR REPLACE
-- refuses that. Without the drop this migration fails on a
-- database that already ran 011.
-- ------------------------------------------------------------
drop function if exists public.track_order(text, text);

create or replace function public.track_order(p_id text, p_phone text)
returns table (
  id text, status text, total integer, method text,
  items jsonb, created_at timestamptz, name text,
  courier text, tracking_no text, tracking_url text
)
language sql stable security definer set search_path = public as $$
  select o.id, o.status, o.total, o.method, o.items, o.created_at,
         coalesce(o.customer->>'name', ''),
         o.courier, o.tracking_no, o.tracking_url
  from public.orders o
  where lower(o.id) = lower(trim(p_id))
    and right(regexp_replace(coalesce(o.customer->>'phone',''), '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10)
    and length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 10
  limit 1;
$$;

revoke all on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- Who still needs telling.
--
-- There is no email or WhatsApp API wired up, so nothing can be
-- sent automatically. This view is the honest version of that:
-- a worklist a person clears, rather than a promise the system
-- cannot keep.
-- ------------------------------------------------------------
create or replace view public.v_orders_to_notify as
  select o.id, o.created_at, o.total, o.status, o.branch,
         o.customer->>'name'  as name,
         o.customer->>'phone' as phone,
         round(extract(epoch from (now() - o.created_at)) / 3600)::int as hours_waiting
    from public.orders o
   where o.notified_at is null
     and o.status not in ('cancelled')
   order by o.created_at;

-- ============================================================
-- After running this, confirm the race is actually closed:
--
--   1. set a product's stock to 1
--   2. insert two orders for it in two sessions
--   3. the second must fail with 'Not enough stock'
--
-- If both succeed, the trigger did not attach — check that the
-- orders being inserted carry a `branch` that exists.
-- ============================================================
