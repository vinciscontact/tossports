/* ============================================================
   TOSS — shared config

   Everything in this file is PUBLIC by design and safe to ship
   to the browser:
     · the Supabase project URL and publishable key are protected
       by Row Level Security, not by secrecy

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

const SERVICES = {
  /* Engraving. Priced as an add-on and carried onto the invoice.
     The character limit is a real constraint from the bench, not a
     UI preference: past roughly 18 characters the text has to shrink
     enough that it stops reading cleanly on the blade. */
  /* Engraving. price / maxChars / enabled are editable in the Maze Room
     (settings.engraving); fonts and positions are code-defined because each
     maps to specific CSS and preview geometry — an admin cannot add a font
     that has no styling. The character limit is a real bench constraint:
     past ~18 characters the text shrinks enough to stop reading cleanly. */
  engraving: {
    price: 199, maxChars: 18, enabled: true,
    fonts: [
      { id: 'classic',   label: 'Classic serif' },
      { id: 'block',     label: 'Bold block' },
      { id: 'signature', label: 'Signature script' }
    ],
    positions: [
      { id: 'front', label: 'Front of blade' },
      { id: 'back',  label: 'Back of blade' },
      { id: 'toe',   label: 'Toe' }
    ]
  },

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

/* ============================================================
   Maze Room auth — Supabase Auth, no third party.

   The admin signs in with Supabase's own email+password, so the
   access token is minted by the same system that enforces RLS:
   no cross-system JWT handoff exists to silently break. The
   token's `sub` claim is the Supabase user UUID, which is what
   `staff.uid` binds to (via claim_staff, matched by email).
   ============================================================ */
let authToken = null;           // the signed-in admin's access token
let tokenRejected = false;      // true when Supabase refuses the token
const setAuthToken = t => { authToken = t; tokenRejected = false; };

/* A token can still be refused (expired, revoked, project key rotated).
   Detect that once at sign-in, fall back to the publishable key so the
   app still loads read-only, and let the UI say precisely what is wrong. */
async function checkToken() {
  if (!authToken) return 'anon';
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/products?select=id&limit=1', { headers: supaHeaders() });
    if (r.status === 401) {
      const j = await r.json().catch(() => ({}));
      if (j.code === 'PGRST301' || /jwt/i.test(j.message || '')) {
        tokenRejected = true;
        authToken = null;              // degrade to anonymous reads
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
    Authorization: 'Bearer ' + (authToken || SUPA_KEY),
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

/* ============================================================
   Announcement marquee — shared shape

   The `announcement` setting is edited in the Maze Room and read by
   the storefront, so both must agree on its shape. Canonical form is
   { on: boolean, items: [string, …] }. This normaliser also accepts
   the two older shapes the row may still hold — a bare string, or a
   plain array — so nothing has to be migrated by hand.

   Lives in config.js because it is the one file loaded by BOTH the
   shop (index.html) and the Maze Room (maze.html).
   ============================================================ */
function normalizeMarquee(v) {
  if (v == null) return { on: true, items: [] };
  if (typeof v === 'string') { const t = v.trim(); return { on: !!t, items: t ? [t] : [] }; }
  if (Array.isArray(v)) return { on: v.length > 0, items: v.map(String) };
  if (typeof v === 'object') {
    const items = Array.isArray(v.items) ? v.items.map(String) : [];
    return { on: v.on !== false, items };   // default to visible unless explicitly off
  }
  return { on: true, items: [] };
}
