-- ============================================================
--  TOSS SPORTS — ORDER FIRST, THEN PAY
--
--  WHY THIS EXISTS
--  ---------------
--  Razorpay was never going to capture automatically. Checkout
--  was opened with nothing but a key and an amount — no Orders
--  API — and Razorpay's rule for that is blunt: capture settings
--  "are applicable only for payments created using the Orders
--  API", and a payment made without an order_id "cannot be
--  captured and will be automatically refunded".
--
--  So every sale had to be captured by hand in the dashboard,
--  and any that was missed refunded itself. No dashboard toggle
--  fixes that, because the payments belonged to no order.
--
--  Creating the order on the server first fixes three things at
--  once, which is why it is worth the change:
--
--    1. Razorpay can auto-capture, because the payment now
--       belongs to an order.
--    2. The amount is whatever POSTGRES says it is. The browser
--       no longer names the price it wants to pay — the total is
--       read from this table, which orders_sanitise has already
--       re-priced from the catalogue. Proven: a hand-made insert
--       claiming total 1, paid true and a fake payment id came
--       back as 2300, false and null.
--    3. An order can no longer be lost after money moves. It
--       exists before the payment sheet opens, so a failed save
--       afterwards is no longer a paid customer with no order.
--
--  THE COST, STATED PLAINLY
--  ------------------------
--  orders_take_stock fires BEFORE INSERT, so a pending order
--  holds its bats. Somebody who opens the payment sheet and
--  wanders off would keep stock off the shelf forever. That is
--  what release_stale_orders() is for: after 30 minutes an
--  unpaid pending order is cancelled, and the existing
--  orders_return_stock trigger puts the bats back.
--
--  Run after 029-enquiries.sql. Safe to re-run.
-- ============================================================

-- ---------- 1. a web order may be born pending ----------
-- orders_sanitise forced every anonymous web order to status 'new'. Left
-- alone it would have quietly rewritten 'pending' to 'new' and the whole
-- flow would have looked like it worked while doing nothing at all.
--
-- Only the status line changes here; the re-pricing below it is untouched
-- and is still what makes the browser's numbers irrelevant.
create or replace function public.orders_sanitise()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  it      jsonb;
  v_sub   integer := 0;
  v_qty   integer;
  v_price integer;
  v_eng   integer;
  v_w3    integer;
  v_w6    integer;
  v_wadd  integer;
  v_disc  integer := 0;
  v_free  integer;
  v_fee   integer;
  v_cp    record;
begin
  -- Staff keep the numbers they typed. Only anonymous web orders are
  -- recomputed, because only those were priced by a browser.
  if public.my_role() is not null then
    return new;
  end if;

  -- A web order may be born in exactly two states and no others.
  --
  --   'pending' - money is about to be asked for. The row exists BEFORE the
  --               Razorpay sheet opens so the amount can be read from here
  --               rather than named by the browser, and so a payment can
  --               never end up with no order behind it. It holds stock, and
  --               release_stale_orders() cancels it if nobody pays.
  --   'new'     - a WhatsApp order, where no money moves on the site.
  --
  -- Anything else a browser sends collapses to 'new'.
  new.status     := case when new.status = 'pending' then 'pending' else 'new' end;
  new.paid       := false;
  new.channel    := 'web';
  new.staff_id   := null;
  new.payment_id := null;
  new.created_at := now();

  select coalesce((value #>> '{}')::int, 199) into v_eng
    from public.settings where key = 'engraving_price';
  v_eng := coalesce(v_eng, 199);

  select coalesce((value #>> '{}')::int, 100) into v_w3
    from public.settings where key = 'warranty_3_price';
  v_w3 := coalesce(v_w3, 100);

  select coalesce((value #>> '{}')::int, 200) into v_w6
    from public.settings where key = 'warranty_6_price';
  v_w6 := coalesce(v_w6, 200);

  for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    select coalesce(p.price, 0) into v_price
      from public.products p
     where p.id = it->>'id' and p.active;

    if not found then
      raise exception 'Unknown or inactive product in order: %', it->>'id'
        using errcode = 'check_violation';
    end if;

    v_qty := greatest(1, least(20, coalesce((it->>'qty')::int, 1)));

    if coalesce(it->>'engrave', '') <> '' then
      v_price := v_price + v_eng;
    end if;

    -- Per bat, exactly like engraving: two bats with cover cost two covers.
    -- The browser sends only the plan id; the price comes from settings.
    v_wadd := case coalesce(it->>'warranty', '')
                when '3' then v_w3
                when '6' then v_w6
                else 0
              end;
    v_price := v_price + v_wadd;

    v_sub := v_sub + v_price * v_qty;
  end loop;

  if new.coupon is not null then
    select * into v_cp from public.validate_coupon(new.coupon, v_sub);
    v_disc := case when v_cp.valid then coalesce(v_cp.discount, 0) else 0 end;
    if v_disc = 0 then new.coupon := null; end if;
  end if;

  select coalesce((value #>> '{}')::int, 1500) into v_free
    from public.settings where key = 'free_ship_over';
  select coalesce((value #>> '{}')::int, 99) into v_fee
    from public.settings where key = 'ship_fee';

  new.subtotal := v_sub;
  new.discount := least(v_disc, v_sub);
  new.shipping := case
                    when v_sub = 0 or v_sub >= coalesce(v_free, 1500) then 0
                    else coalesce(v_fee, 99)
                  end;
  new.total    := greatest(0, new.subtotal - new.discount + new.shipping);
  return new;
end;
$function$;


-- ---------- 2. a paid order rejoins the normal flow ----------
-- A pending order is not a real order yet; it is a held basket. The moment
-- the webhook confirms the money it becomes 'new' and appears in Fulfilment
-- like every other order. Without this it would stay 'pending' and nobody
-- would ever pack it.
create or replace function public.mark_order_paid(
  p_order_id text, p_payment_id text, p_amount_paise integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  o record;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no such order', 'order', p_order_id);
  end if;

  if o.paid then
    return jsonb_build_object('ok', true, 'reason', 'already paid', 'order', p_order_id);
  end if;

  -- A cancelled order has had its stock returned. Marking it paid now would
  -- mean shipping a bat the shop has already put back on the shelf, so this
  -- refuses and leaves a human to sort it out — which is the right outcome:
  -- the money is real and needs refunding or the order re-placing.
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason',
      'order was cancelled before payment arrived - refund or re-place it',
      'order', p_order_id);
  end if;

  if p_amount_paise is distinct from (o.total * 100) then
    return jsonb_build_object('ok', false, 'reason', 'amount does not match order total',
                              'order', p_order_id,
                              'expected_paise', o.total * 100,
                              'got_paise', p_amount_paise);
  end if;

  update public.orders
     set paid        = true,
         payment_id  = p_payment_id,
         paid_at     = now(),
         paid_source = 'razorpay-webhook',
         status      = case when status = 'pending' then 'new' else status end
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'order', p_order_id, 'payment', p_payment_id);
end;
$function$;


-- ---------- 3. release stock from abandoned checkouts ----------
-- Cancelling is all this does; orders_return_stock (012) already puts the
-- bats back when a row moves to 'cancelled'. Deliberately narrow: only web
-- orders, only pending, only unpaid, only past the grace period. A staff
-- order typed in the Maze Room is never 'pending' and is never touched.
create or replace function public.release_stale_orders(p_minutes integer default 30)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  n integer;
begin
  with stale as (
    update public.orders
       set status = 'cancelled'
     where status = 'pending'
       and paid = false
       and channel = 'web'
       -- Floored at one minute on purpose. Passing 0 must not cancel an order
       -- that is mid-payment: the customer is looking at the Razorpay sheet.
       and created_at < now() - make_interval(mins => greatest(1, p_minutes))
    returning 1
  )
  select count(*) into n from stale;
  return n;
end;
$$;

-- Anyone may run it. It can only ever cancel an unpaid pending web order
-- already past its grace period, so the worst an anonymous caller can do is
-- the housekeeping we wanted done anyway — and there is no pg_cron on this
-- project, so the storefront calls it opportunistically at checkout.
grant execute on function public.release_stale_orders(integer) to anon, authenticated;


-- ---------- 4. keep pending baskets out of the books ----------
-- A pending order is not a sale. Every sales view filters on "not cancelled",
-- so a pending basket would be counted as revenue nobody paid. The Maze Room
-- and the customer's account both query status=neq.pending; this index keeps
-- the sweep cheap as the table grows.
create index if not exists orders_pending_idx
  on public.orders (created_at) where status = 'pending' and paid = false;


-- ============================================================
--  VERIFY
-- ============================================================
--
--  The browser cannot name its own price. Insert as an ANONYMOUS
--  caller claiming a total of 1, paid, with a payment id:
--
--    {"id":"X","status":"pending","total":1,"paid":true,
--     "payment_id":"FAKE","items":[{"id":"black-mamba","qty":1}], ...}
--
--    select status, paid, payment_id, total from public.orders where id='X';
--    -- pending | false | null | 2300
--
--  An abandoned basket gives its stock back. Note that a fresh
--  order is never stale — the floor is one minute — so backdate it
--  rather than passing 0:
--
--    update public.orders set created_at = now() - interval '31 minutes'
--     where id = 'X';
--    select public.release_stale_orders(30);        -- 1
--    -- then, in a SEPARATE statement (the same one reads a stale
--    -- snapshot and will look like nothing happened):
--    select status from public.orders where id='X';                  -- cancelled
--    select stock from public.product_stock where product_id='black-mamba';
--
--  Payment against a cancelled order is refused rather than shipped:
--
--    select public.mark_order_paid('X', 'pay_LATE', 230000);
--    -- ok:false, "order was cancelled before payment arrived"
--
--  Wrong amount refused; right amount pays and enters Fulfilment:
--
--    select public.mark_order_paid('Y', 'pay_WRONG', 100);   -- ok:false
--    select public.mark_order_paid('Y', 'pay_GOOD', 230000); -- ok:true
--    select status, paid from public.orders where id='Y';    -- new | true
-- ============================================================
