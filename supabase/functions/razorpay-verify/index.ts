/* ============================================================
   TOSS SPORTS — CONFIRM A PAYMENT, THE MOMENT IT HAPPENS

   The webhook is the system of record: Razorpay calls us, signed,
   and nothing else is trusted to say an order was paid. But it is
   Razorpay's decision when to call, and if the webhook is ever
   misconfigured — a secret that does not match, an event not
   subscribed — nothing arrives at all and real money sits against
   an order marked Unpaid until somebody notices.

   This is the second path. The page calls it as soon as Razorpay's
   sheet reports success, handing over an order id and a payment id.
   It trusts NEITHER of them: it asks Razorpay's API what that
   payment actually is, using the secret key the browser never sees.
   A forged payment id is simply not found; a real one belonging to
   someone else's order fails the notes check; a ₹1 payment against
   a ₹5,000 order fails the amount check inside mark_order_paid.

   So the claim comes from the browser and the EVIDENCE comes from
   Razorpay, which is the only arrangement worth having.

   It also captures an authorised-but-not-captured payment, so the
   money is actually taken even if the dashboard's auto-capture is
   off. Without that, Razorpay auto-refunds it hours later and the
   sale quietly disappears.

   verify_jwt is false: the shopper is anonymous. What protects it
   is that it accepts no amount, invents nothing, and every answer
   comes from Razorpay or Postgres.
   ============================================================ */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const env = (k: string) => (Deno.env.get(k) ?? '').trim();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const KEY_ID = env('RAZORPAY_KEY_ID');
  const KEY_SECRET = env('RAZORPAY_KEY_SECRET');
  if (!KEY_ID || !KEY_SECRET) return json({ error: 'not_configured' }, 503);

  let orderId = '', paymentId = '';
  try {
    const b = await req.json();
    orderId = String(b?.order_id ?? '').trim();
    paymentId = String(b?.payment_id ?? '').trim();
  } catch { /* handled below */ }

  if (!/^[A-Za-z0-9._-]{4,40}$/.test(orderId)) return json({ error: 'bad_order_id' }, 400);
  if (!/^pay_[A-Za-z0-9]{6,}$/.test(paymentId)) return json({ error: 'bad_payment_id' }, 400);

  const auth = 'Basic ' + btoa(KEY_ID + ':' + KEY_SECRET);

  /* ---- 1. what does Razorpay say this payment is? ---- */
  let pay: any;
  try {
    const r = await fetch('https://api.razorpay.com/v1/payments/' + paymentId, {
      headers: { Authorization: auth }
    });
    pay = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: 'payment_not_found', status: r.status }, 404);
  } catch (e) {
    return json({ error: 'razorpay_unreachable', detail: String(e) }, 502);
  }

  /* ---- 2. is it OUR order? The note was set when the order was created. ---- */
  const noted = pay?.notes?.order_id;
  if (noted && noted !== orderId) {
    console.error('payment belongs to another order', { paymentId, noted, orderId });
    return json({ error: 'order_mismatch' }, 409);
  }

  /* ---- 3. take the money if it is only held ---- */
  if (pay.status === 'authorized') {
    try {
      const cap = await fetch(
        'https://api.razorpay.com/v1/payments/' + paymentId + '/capture',
        {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: pay.amount, currency: pay.currency || 'INR' })
        }
      );
      const out = await cap.json().catch(() => ({}));
      if (cap.ok) pay = out;
      else console.error('capture refused', cap.status, JSON.stringify(out));
    } catch (e) {
      console.error('capture failed', String(e));
    }
  }

  if (pay.status !== 'captured') {
    return json({ error: 'not_captured', status: pay.status ?? null }, 409);
  }

  /* ---- 4. let the database decide; the amount check lives there ---- */
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/mark_order_paid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY
      },
      body: JSON.stringify({
        p_order_id: orderId,
        p_payment_id: paymentId,
        p_amount_paise: pay.amount
      })
    });
    const out = await r.json();
    if (!r.ok || out?.ok !== true) {
      console.error('not applied', { orderId, paymentId, status: r.status, out });
      return json({ ok: false, reason: out?.reason ?? 'not applied' }, 409);
    }
    console.log('order marked paid by verify', { orderId, paymentId });
    return json({ ok: true, order: orderId, payment: paymentId });
  } catch (e) {
    return json({ error: 'database_unreachable', detail: String(e) }, 503);
  }
});
