/* ============================================================
   TOSS — shared config

   Everything in this file is PUBLIC by design and safe to ship
   to the browser:
     · the Supabase project URL and publishable key are protected
       by Row Level Security, not by secrecy
     · Firebase web API keys are identifiers, not credentials

   NEVER put the Postgres password or a Supabase service_role key
   in here — those grant full database access and would bypass
   every policy in sql/schema.sql.
   ============================================================ */

const SUPA_URL = 'https://rbrokxstbzewdjdfhiwk.supabase.co';
const SUPA_KEY = 'sb_publishable_RsGkbtn8GloAZxGFKWz-Ew_m6KGKyJn';

/* ============================================================
   THINGS TOSS FILLS IN

   Everything below is a business decision, not a technical one,
   and it is gathered here so none of it has to be hunted for in
   the application code.

   The two group links are empty on purpose. An empty link hides
   its own join card rather than shipping a button that goes
   nowhere — so this file is safe to deploy before the groups
   exist, and the cards appear the moment the links are pasted in.
   ============================================================ */
const TOSS_LINKS = {
  community: '',            // https://chat.whatsapp.com/…  Toss Brothers
  offers:    '',            // https://chat.whatsapp.com/…  offers & updates
  whatsapp:  '919176995707' // the number orders already go to
};

/* ------------------------------------------------------------
   Delivery.

   `unserved` holds pin-code prefixes our couriers will not reach.
   Prefix rather than full pin code because Indian pin codes are
   geographic: the first three digits are the sorting district, so
   one entry covers a region instead of hundreds of individual
   codes.

   It is EMPTY by default, and an empty list means "we deliver
   everywhere". Guessing which districts a courier refuses would
   be worse than not checking — it would turn away real orders
   from places we can actually reach. Fill it from the courier's
   own serviceability list.

   `zones` drives the delivery estimate shown at checkout. Matched
   longest-prefix-first, so '600' (Chennai) wins over '6'.
   ------------------------------------------------------------ */
const DELIVERY = {
  unserved: [],
  zones: [
    { prefix: '600', label: 'Chennai',        days: '1–3 working days' },
    { prefix: '6',   label: 'Tamil Nadu',     days: '2–4 working days' },
    { prefix: '5',   label: 'South India',    days: '3–5 working days' },
    { prefix: '',    label: 'Rest of India',  days: '4–7 working days' }
  ],
  /* Where a tracking number can be followed. The order stores which
     courier, so the tracking page can link straight to it. */
  couriers: {
    dtdc:     { label: 'DTDC',        url: 'https://www.dtdc.in/tracking.asp' },
    delhivery:{ label: 'Delhivery',   url: 'https://www.delhivery.com/track/package/' },
    bluedart: { label: 'Blue Dart',   url: 'https://www.bluedart.com/tracking' },
    indiapost:{ label: 'India Post',  url: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx' },
    other:    { label: 'Courier',     url: '' }
  }
};

/* ------------------------------------------------------------
   Analytics.

   Both IDs are empty, and nothing loads while they are. That is
   deliberate: an analytics tag that fires before anyone has
   decided to have analytics is a third party reading your
   visitors for no benefit. Paste an ID and only then does the
   script get injected.
   ------------------------------------------------------------ */
const ANALYTICS = {
  ga4:  '',   // G-XXXXXXXXXX
  meta: ''    // Meta pixel id
};

const SERVICES = {
  /* Engraving. Priced as an add-on and carried onto the invoice.
     The character limit is a real constraint from the bench, not a
     UI preference: past roughly 18 characters the text has to shrink
     enough that it stops reading cleanly on the blade. */
  engraving: { price: 199, maxChars: 18, enabled: true },

  /* Bat Doctor. Bands rather than fixed prices, because the real
     price depends on what the bat looks like when it arrives. */
  batDoctor: {
    enabled: true,
    issues: [
      { id: 'crack',   label: 'Crack in the blade',      from: 300, to: 700 },
      { id: 'toe',     label: 'Toe damage or swelling',  from: 250, to: 500 },
      { id: 'handle',  label: 'Handle loose or broken',  from: 400, to: 900 },
      { id: 'grip',    label: 'Grip replacement',        from: 100, to: 200 },
      { id: 'knock',   label: 'Knocking in / oiling',    from: 300, to: 600 },
      { id: 'other',   label: 'Something else',          from: null, to: null }
    ],
    turnaround: '3–7 days once it reaches the workshop'
  },

  /* Wholesale. `min` is the quantity below which the form points
     people at the normal shop instead. */
  wholesale: {
    enabled: true, min: 10,
    slabs: [
      { from: 10, to: 24,   off: 10 },
      { from: 25, to: 49,   off: 15 },
      { from: 50, to: 99,   off: 20 },
      { from: 100, to: null, off: 25 }
    ]
  },

  /* Trade-in. Bands are what staff quote against; nothing is
     promised to the customer until a person has seen the photos. */
  tradeIn: {
    enabled: true,
    bands: [
      { id: 'good',  label: 'Barely used, no damage',        from: 400, to: 800 },
      { id: 'fair',  label: 'Played with, sound structure',  from: 200, to: 400 },
      { id: 'worn',  label: 'Heavily used or repaired',      from: 100, to: 200 }
    ]
  },

  /* Customer video. The reward is issued only after a person has
     watched the video and approved it. */
  video: { enabled: true, rewardOff: 15, minSeconds: 15 },

  /* Jersey. Sizes are the supplier's, so they live here. */
  jersey: {
    enabled: true, min: 11,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    price: null            // per unit — set once the supplier is fixed
  },

  customBat: { enabled: true }
};

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBsqvLa_V_XCi189P3Qd61-zd4c4i_E0G8',
  authDomain: 'toss-cb8c0.firebaseapp.com',
  projectId: 'toss-cb8c0',
  storageBucket: 'toss-cb8c0.firebasestorage.app',
  messagingSenderId: '844825622558',
  appId: '1:844825622558:web:af838b8d0f707e351e160f',
  measurementId: 'G-VX9GZ9YREG'
};

/* Supabase accepts the Firebase ID token as a third-party JWT, so RLS
   can key off the Firebase uid. Requires Third-Party Auth to be enabled
   in the Supabase dashboard — see sql/SETUP.md. */
let firebaseToken = null;
let tokenRejected = false;      // true when Supabase refuses the Firebase JWT
const setFirebaseToken = t => { firebaseToken = t; tokenRejected = false; };

/* Supabase only accepts a Firebase ID token once Firebase is registered as a
   Third Party Auth provider. Until then it answers 401 PGRST301 to EVERY
   request — including ones that would have succeeded anonymously. Detect that
   once at sign-in, fall back to the publishable key so the app still loads,
   and let the UI say precisely what is wrong. */
async function checkToken() {
  if (!firebaseToken) return 'anon';
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/products?select=id&limit=1', { headers: supaHeaders() });
    if (r.status === 401) {
      const j = await r.json().catch(() => ({}));
      if (j.code === 'PGRST301' || /jwt/i.test(j.message || '')) {
        tokenRejected = true;
        firebaseToken = null;          // degrade to anonymous reads
        return 'rejected';
      }
      return 'unauthorised';
    }
    return r.ok ? 'ok' : 'error';
  } catch (e) { return 'offline'; }
}

function supaHeaders(extra) {
  return Object.assign({
    apikey: SUPA_KEY,
    Authorization: 'Bearer ' + (firebaseToken || SUPA_KEY),
    'Content-Type': 'application/json'
  }, extra || {});
}

/* Thin REST wrapper — avoids pulling the whole supabase-js bundle
   into a site that has no build step. */
const SUPA_TIMEOUT = 8000;

async function supa(pathAndQuery, opts) {
  opts = opts || {};
  /* A fetch with no timeout can hang for as long as the OS lets it. Every
     request gets an abort so a slow or unreachable backend degrades to the
     bundled data quickly instead of leaving callers waiting indefinitely. */
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), opts.timeout || SUPA_TIMEOUT) : null;
  let res;
  try {
    res = await fetch(SUPA_URL + '/rest/v1/' + pathAndQuery, {
      method: opts.method || 'GET',
      headers: supaHeaders(opts.headers),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ac ? ac.signal : undefined
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
  if (!res.ok) {
    const msg = (json && (json.message || json.hint || json.error)) || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.code = json && json.code;
    throw err;
  }
  return json;
}

/* call a SECURITY DEFINER function (claim_reward, validate_coupon) */
function supaRpc(fn, args) {
  return supa('rpc/' + fn, { method: 'POST', body: args || {} });
}
