/* ============================================================
   TOSS SPORTS - CREATE A RAZORPAY ORDER

   The browser is not allowed to say what a bat costs.

   This takes an order id and nothing else. It reads that order's
   total out of Postgres - where orders_sanitise has already
   re-priced it from the catalogue - and asks Razorpay for an
   order of exactly that many paise. Whatever the page believed
   the price was never enters the conversation.

   It also fixes the reason it was written. Checkout used to open
   with a bare key and amount, no order_id, and Razorpay's rule
   for that is that capture settings do not apply and the payment
   is auto-refunded if never captured. Payments that belong to an
   order obey the dashboard's capture setting, so turning on
   automatic capture there now actually does something.

   verify_jwt is false because a shopper is anonymous. What
   protects this is that it accepts no amount, refuses anything
   that is not an unpaid pending web order, and refuses an order
   older than its grace period.

   Secrets (set in Supabase - Edge Functions - Secrets):
     RAZORPAY_KEY_ID       rzp_live_... or rzp_test_...
     RAZORPAY_KEY_SECRET   the matching secret, server-side only
   ============================================================ */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

/* How long a pending order may hold its stock. Matches
   release_stale_orders() in sql/030 - if they ever disagree, a customer
   could pay for an order that has just been cancelled underneath them. */
const GRACE_MINUTES = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  if (!KEY_ID || !KEY_SECRET) {
    /* Said plainly, because the storefront falls back to the old flow when
       this happens and somebody needs to know why capture stopped working. */
    return json({ error: 'not_configured',
      message: 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set on this function.' }, 503);
  }

  let orderId = '';
  try {
    const body = await req.json();
    orderId = String(body?.order_id ?? '').trim();
  } catch { /* falls through to the check below */ }

  if (!/^[A-Za-z0-9._-]{4,40}$/.test(orderId)) {
    return json({ error: 'bad_order_id' }, 400);
  }

  /* ---- read the order, as the server sees it ---- */
  const q = new URL(SUPABASE_URL + '/rest/v1/orders');
  q.searchParams.set('id', 'eq.' + orderId);
  q.searchParams.set('select', 'id,total,status,paid,channel,created_at,customer');

  const res = await fetch(q, {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
  });
  if (!res.ok) return json({ error: 'lookup_failed' }, 502);

  const rows = await res.json();
  const o = Array.isArray(rows) ? rows[0] : null;
  if (!o) return json({ error: 'no_such_order' }, 404);

  /* Every one of these is a reason not to take money. */
  if (o.paid) return json({ error: 'already_paid' }, 409);
  if (o.status !== 'pending') return json({ error: 'not_pending', status: o.status }, 409);
  if (o.channel !== 'web') return json({ error: 'not_a_web_order' }, 409);

  const ageMin = (Date.now() - new Date(o.created_at).getTime()) / 60000;
  if (ageMin > GRACE_MINUTES) return json({ error: 'expired', age_minutes: Math.round(ageMin) }, 409);

  const paise = Math.round(Number(o.total) * 100);
  if (!Number.isFinite(paise) || paise < 100) {
    /* Razorpay's own floor is 100 paise. A total below it means the order is
       wrong, not that the customer found a bargain. */
    return json({ error: 'bad_amount', total: o.total }, 409);
  }

  /* ---- ask Razorpay for an order of exactly that ---- */
  const auth = 'Basic ' + btoa(KEY_ID + ':' + KEY_SECRET);
  const rzp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: paise,
      currency: 'INR',
      receipt: orderId,
      /* The webhook finds our order by this note, exactly as before. */
      notes: { order_id: orderId },
      /* Legacy on newer accounts, where the dashboard setting rules, but
         harmless there and decisive on accounts that still honour it. */
      payment_capture: 1
    })
  });

  const out = await rzp.json().catch(() => ({}));
  if (!rzp.ok) {
    console.error('razorpay order failed', rzp.status, JSON.stringify(out));
    return json({ error: 'razorpay_rejected', status: rzp.status,
                  detail: out?.error?.description ?? null }, 502);
  }

  /* Housekeeping, done on the way past: no pg_cron on this project, and a
     checkout is exactly when somebody wants the shelves accurate. Failure
     here must never block a sale, so it is fire-and-forget. */
  fetch(SUPABASE_URL + '/rest/v1/rpc/release_stale_orders', {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ p_minutes: GRACE_MINUTES })
  }).catch(() => {});

  return json({
    razorpay_order_id: out.id,
    amount: out.amount,
    currency: out.currency,
    key_id: KEY_ID          /* publishable half, so the page need not hold it twice */
  });
});
