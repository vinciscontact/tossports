-- ============================================================
-- 026 — PROVING A WEB ORDER WAS PAID
-- Run once in: Supabase → SQL editor.
--
-- A web order arrives saying "unpaid" no matter what happened at
-- the checkout, and that is correct. orders_sanitise() overwrites
-- `paid` and `payment_id` on every anonymous insert, because a
-- Razorpay checkout that runs entirely in the customer's browser
-- proves nothing — anyone can open devtools and post an order
-- claiming it was paid for.
--
-- So the browser is not trusted, and until now nothing else was
-- asked. An order stayed unpaid forever: there is no way in the
-- Maze Room to mark a web order paid, and the Razorpay reference
-- was thrown away too, leaving staff to match payments by amount
-- and timestamp in a dashboard.
--
-- This adds the two halves of an answer.
--
--   payment_ref_claimed — what the browser SAYS the payment was.
--     Proves nothing, which is why it is named that way and why it
--     is separate from payment_id. It exists so a human can paste
--     it into Razorpay's search instead of hunting by amount.
--
--   paid_at / paid_source — how the claim was settled, and by
--     what. A webhook that Razorpay signed is a different kind of
--     fact from a person ticking a box, and a shop that takes
--     money should be able to tell them apart a year later.
--
-- payment_id stays what it always was: the VERIFIED reference,
-- written only by something that checked. The webhook in
-- firebase-functions/ is what writes it.
--
-- Nothing here changes the sanitiser. It still refuses everything
-- the browser asserts on insert. These columns are filled in
-- afterwards, by an UPDATE, and orders_sanitise_ins is a BEFORE
-- INSERT trigger — so the update path was already free.
-- ============================================================

alter table public.orders
  add column if not exists payment_ref_claimed text,
  add column if not exists paid_at             timestamptz,
  add column if not exists paid_source         text;

comment on column public.orders.payment_ref_claimed is
  'What the browser reported as the Razorpay payment id. UNVERIFIED — a lookup hint for staff, never evidence of payment.';
comment on column public.orders.payment_id is
  'The VERIFIED Razorpay payment id. Written only by the signed webhook, or by staff who checked the dashboard.';
comment on column public.orders.paid_source is
  'What settled the payment: razorpay-webhook, or staff:<name>.';

-- Finding an order from a webhook, and finding unsettled ones in the
-- Maze Room, are the two lookups this adds.
create index if not exists orders_paid_idx on public.orders (paid, created_at desc);

-- ------------------------------------------------------------
-- What the webhook calls.
--
-- security definer so it can write past the admin-only policy while
-- running as the service role, and narrow enough that it cannot do
-- anything else: it marks one order paid, and only if the money
-- actually covers it.
--
-- The amount check is the point. Without it a real ₹1 payment could
-- be pointed at a ₹5,000 order and Razorpay's signature would still
-- be perfectly valid — the signature proves the message came from
-- Razorpay, not that it pays for this bat.
-- ------------------------------------------------------------
create or replace function public.mark_order_paid(
  p_order_id   text,
  p_payment_id text,
  p_amount_paise integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no such order', 'order', p_order_id);
  end if;

  if o.paid then
    -- Razorpay retries a webhook until it is acknowledged, so the same
    -- payment arrives more than once as a matter of course. Saying "yes,
    -- already done" is the correct answer to the second delivery.
    return jsonb_build_object('ok', true, 'reason', 'already paid', 'order', p_order_id);
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
         paid_source = 'razorpay-webhook'
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'order', p_order_id, 'payment', p_payment_id);
end;
$$;

revoke all on function public.mark_order_paid(text, text, integer) from public, anon, authenticated;
grant execute on function public.mark_order_paid(text, text, integer) to service_role;

-- ------------------------------------------------------------
-- The manual fallback, for a payment that never produced a webhook —
-- a customer who paid by UPI directly, or an event Razorpay dropped.
-- Founder and owner only, and it records who said so.
-- ------------------------------------------------------------
create or replace function public.mark_order_paid_by_staff(p_order_id text, p_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me text;
begin
  if coalesce(public.my_role(), '') not in ('founder', 'owner') then
    raise exception 'Only a founder can confirm a payment by hand.';
  end if;

  select name into me from public.staff where uid = auth.jwt() ->> 'sub';

  update public.orders
     set paid        = true,
         payment_id  = coalesce(p_ref, payment_id, payment_ref_claimed),
         paid_at     = now(),
         paid_source = 'staff:' || coalesce(me, 'unknown')
   where id = p_order_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no such order');
  end if;
  return jsonb_build_object('ok', true, 'order', p_order_id, 'by', me);
end;
$$;

grant execute on function public.mark_order_paid_by_staff(text, text) to authenticated;

-- Proof: this should list your ₹100 test order as unpaid, with whatever
-- reference the browser claimed for it once the storefront starts sending one.
select id, total, paid, paid_source, payment_id, payment_ref_claimed, created_at
  from public.orders
 order by created_at desc
 limit 10;
