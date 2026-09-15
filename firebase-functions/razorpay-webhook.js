/**
 * TOSS SPORTS — THE RAZORPAY WEBHOOK
 *
 * The one thing in this system that is allowed to say an order was paid.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT HAS TO EXIST
 *
 * The checkout runs entirely in the customer's browser. When Razorpay's
 * sheet succeeds it hands the page a payment id, and the page cheerfully
 * posts an order saying "paid: true". Nothing about that is evidence:
 * anyone can open devtools and post the same thing without paying a
 * rupee. So orders_sanitise() throws the claim away and every web order
 * lands unpaid — correctly, and until now, permanently.
 *
 * Razorpay will also tell us directly, server to server, signed with a
 * secret only the two of us know. That is evidence. This function is
 * where it arrives.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IT CHECKS, AND WHY EACH ONE MATTERS
 *
 *   1. The signature, over the RAW body.
 *      Computed on req.rawBody, never on a re-serialised object —
 *      JSON.stringify does not promise to reproduce the exact bytes
 *      Razorpay signed, and a single reordered key breaks the HMAC.
 *
 *   2. Compared in constant time.
 *      A plain === leaks, through timing, how much of a forged
 *      signature was right. timingSafeEqual does not.
 *
 *   3. The amount, against the order total.
 *      This is the one people forget. A valid signature proves the
 *      message came from Razorpay. It says nothing about whether the
 *      money covers THIS bat. Without the check, a genuine ₹1 payment
 *      could be pointed at a ₹5,000 order and every signature would
 *      still verify. The check lives in mark_order_paid() in sql/026,
 *      so it holds even if something other than this function calls it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOW THE PAYMENT FINDS ITS ORDER
 *
 * The storefront already puts the order id into the Razorpay notes when
 * it opens the sheet (see payOnline in js/app.js), so it comes back to
 * us in payload.payment.entity.notes.order_id. That is the whole link,
 * and it is why no Razorpay Orders API is needed for this to work.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ALWAYS ANSWER 200
 *
 * Except for a bad signature. Razorpay retries anything that is not a
 * 2xx, for hours, and a retry cannot fix an order that does not exist
 * or an amount that does not match — it just buries the real failures
 * in noise. Those are logged and acknowledged. Only an unsigned or
 * wrongly-signed request is refused, because that one is not Razorpay.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECRETS — set these yourself, never in this file
 *
 *   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
 *   firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY
 *
 * The service role key bypasses row-level security completely. It
 * belongs in a server and nowhere else — never in js/config.js, never
 * in anything the browser downloads.
 *
 * DEPLOY
 *
 *   cd firebase-functions && npm install
 *   firebase deploy --only functions:razorpaywebhook --project toss-cb8c0
 *
 * Then in the Razorpay dashboard → Settings → Webhooks:
 *   URL     the https URL the deploy prints
 *   Secret  the same value you set as RAZORPAY_WEBHOOK_SECRET
 *   Events  payment.captured
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('crypto');

const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
const SUPABASE_SERVICE_ROLE_KEY = defineSecret('SUPABASE_SERVICE_ROLE_KEY');

/* The project's REST endpoint. Public knowledge — it is in js/config.js
   and every visitor's browser already has it. The key is the secret. */
const SUPABASE_URL = 'https://rbrokxstbzewdjdfhiwk.supabase.co';

exports.razorpaywebhook = onRequest(
  { secrets: [RAZORPAY_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY], cors: false, region: 'asia-south1' },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('POST only');

    const signature = req.get('x-razorpay-signature') || '';
    const raw = req.rawBody;

    if (!raw || !signature) {
      console.error('webhook: missing body or signature');
      return res.status(400).send('unsigned');
    }

    /* 1 — is this actually Razorpay? */
    const expected = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET.value())
      .update(raw)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.error('webhook: signature did not verify');
      return res.status(400).send('bad signature');
    }

    /* 2 — what happened? */
    let body;
    try { body = JSON.parse(raw.toString('utf8')); }
    catch (e) {
      console.error('webhook: body was not json', e.message);
      return res.status(200).send('ignored: unparseable');
    }

    if (body.event !== 'payment.captured') {
      return res.status(200).send('ignored: ' + body.event);
    }

    const pay = (body.payload && body.payload.payment && body.payload.payment.entity) || {};
    const orderId = pay.notes && pay.notes.order_id;
    const paymentId = pay.id;
    const amount = pay.amount;          /* paise */

    if (!orderId || !paymentId) {
      console.error('webhook: captured payment carried no order_id', paymentId);
      return res.status(200).send('ignored: no order reference');
    }

    /* 3 — let the database decide, because the amount check lives there. */
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/mark_order_paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY.value(),
          Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY.value()
        },
        body: JSON.stringify({
          p_order_id: orderId,
          p_payment_id: paymentId,
          p_amount_paise: amount
        })
      });

      const out = await r.json();
      if (!r.ok || !out || out.ok !== true) {
        /* Acknowledged on purpose: a mismatch or a missing order is not
           something a retry will mend, and it needs a person, not another
           delivery. The log line is the alert. */
        console.error('webhook: not applied', { orderId, paymentId, amount, status: r.status, out });
        return res.status(200).send('acknowledged, not applied');
      }

      console.log('webhook: order marked paid', { orderId, paymentId });
      return res.status(200).send('ok');
    } catch (e) {
      /* A network fault between us and Supabase IS worth retrying, so this
         one asks Razorpay to come back. */
      console.error('webhook: supabase unreachable', e.message);
      return res.status(503).send('retry');
    }
  }
);
