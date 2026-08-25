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


/* ============================================================
   AUTH — Supabase, and only Supabase

   This used to sign in through Firebase and hand the Firebase ID
   token to Supabase as a third-party JWT. That handoff has one
   failure mode and it is a bad one: if Firebase is not registered
   as a Third Party Auth provider, Supabase answers 401 to EVERY
   request — including ones that would have succeeded anonymously
   — and the panel degrades to a signed-in-looking shell where
   every write is refused with an opaque 403.

   Supabase mints the token its own RLS checks, so that entire
   class of failure does not exist any more. my_role() already
   reads auth.jwt()->>'sub' and matches it against staff.uid,
   which never cared which provider issued the token — only that
   the subject matches. So the database side is a data migration,
   not a rewrite. See sql/013-supabase-auth.sql.

   The session lives in localStorage. That is what supabase-js
   does too, and it is the honest trade for an admin panel with no
   server to hold an httpOnly cookie: a refresh token in
   localStorage is readable by any script that gets onto the page,
   so nothing else third-party should ever be loaded into the Maze
   Room.
   ============================================================ */

const SESS_KEY = 'toss_maze_session';
let SESSION = null;          // { access_token, refresh_token, expires_at, user }
let refreshTimer = null;

function loadSession() {
  try {
    const raw = localStorage.getItem(SESS_KEY);
    SESSION = raw ? JSON.parse(raw) : null;
  } catch (e) { SESSION = null; }
  return SESSION;
}

function saveSession(s) {
  SESSION = s;
  try {
    if (s) localStorage.setItem(SESS_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESS_KEY);
  } catch (e) { /* private mode — the session simply will not persist */ }
  scheduleRefresh();
}

/** Seconds until the access token expires. Negative once it has. */
function tokenLife() {
  if (!SESSION || !SESSION.expires_at) return -1;
  return SESSION.expires_at - Math.floor(Date.now() / 1000);
}

/* Refresh a minute before expiry rather than after a request has already
   failed, so a long session never shows the user an error it could have
   avoided. Clamped to at least 10s so a clock skew cannot spin this. */
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!SESSION || !SESSION.refresh_token) return;
  const wait = Math.max(10, tokenLife() - 60) * 1000;
  refreshTimer = setTimeout(refreshSession, Math.min(wait, 2147483000));
}

async function authFetch(path, body) {
  const r = await fetch(SUPA_URL + '/auth/v1/' + path, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error_description || j.msg || j.message || r.statusText);
    e.status = r.status; e.code = j.error_code || j.error;
    throw e;
  }
  return j;
}

function adopt(j) {
  saveSession({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)),
    user: j.user ? { id: j.user.id, email: j.user.email } : (SESSION && SESSION.user) || null
  });
  return SESSION;
}

async function signIn(email, password) {
  return adopt(await authFetch('token?grant_type=password',
    { email: String(email).trim(), password: password }));
}

async function refreshSession() {
  if (!SESSION || !SESSION.refresh_token) return null;
  try {
    return adopt(await authFetch('token?grant_type=refresh_token',
      { refresh_token: SESSION.refresh_token }));
  } catch (e) {
    /* A refresh token is single-use and can be revoked. If it is refused the
       session is genuinely over — clearing it sends the user back to the
       login screen rather than leaving them in a shell that cannot write. */
    saveSession(null);
    if (typeof onSessionLost === 'function') onSessionLost();
    return null;
  }
}

async function signOut() {
  const tok = SESSION && SESSION.access_token;
  saveSession(null);
  if (!tok) return;
  try {
    await fetch(SUPA_URL + '/auth/v1/logout', { method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + tok } });
  } catch (e) { /* the local session is already gone, which is what matters */ }
}

/** Confirms the token the database will actually accept, not the one we hold. */
async function checkToken() {
  if (!SESSION || !SESSION.access_token) return 'anon';
  if (tokenLife() < 30) await refreshSession();
  if (!SESSION) return 'anon';
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/products?select=id&limit=1', { headers: supaHeaders() });
    if (r.status === 401) { saveSession(null); return 'rejected'; }
    return r.ok ? 'ok' : 'error';
  } catch (e) { return 'offline'; }
}

function supaHeaders(extra) {
  return Object.assign({
    apikey: SUPA_KEY,
    /* Falls back to the publishable key so the storefront — which has no
       session and never will — keeps reading public data normally. */
    Authorization: 'Bearer ' + ((SESSION && SESSION.access_token) || SUPA_KEY),
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
