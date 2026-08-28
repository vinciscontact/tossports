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
  /* Toss Brothers. This lived hardcoded in app.js as WA_GROUP, which meant
     the community section here read an empty string and hid itself while a
     perfectly good invite sat twenty lines away in another file. One copy,
     in the place the owner was always told to edit. */
  community: 'https://chat.whatsapp.com/JxcsJgTyLHw4exbmwXYZn4?s=sw&p=i&mlu=0&amv=1',
  offers:    '',            // https://chat.whatsapp.com/…  offers & updates
  whatsapp:  '919176995707',// the number orders already go to

  /* The profile, not the broadcast channel, and without the ?igsi=
     parameter Instagram appends when you copy a link from the app — that
     token identifies the share it came from, not the account. */
  instagram: 'https://www.instagram.com/toss_sportz'
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
     courier, so the tracking page can link straight to it.

     None of these accept a consignment number as a query parameter —
     they are all search forms that POST. So the link opens the
     courier's tracking page and the number is shown next to it, big
     enough to read and copy. Pretending we can deep-link straight to
     a consignment would mean shipping a button that lands on an empty
     form, which is worse than not promising it.

     An order may also carry its own `tracking_url`, set in the Maze
     Room, and that always wins — so the day a courier does support a
     direct link, staff can paste it per order with no code change. */
  couriers: {
    professional: { label: 'The Professional Couriers', url: 'https://www.tpcindia.com/' },
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
      /* Grip replacement and knocking-in / oiling were listed here and are
         NOT services Toss offers. Removed rather than disabled, because a
         priced option on the form is a promise — somebody posts a bat in
         expecting a ₹150 re-grip and there is nobody to do it. */
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
     watched the video and approved it.

     A RANGE, not a fixed number: how good the footage is decides what it
     is worth, and staff settle the figure when they approve it.
     `rewardOff` stays the ceiling so every "up to" on the site reads from
     one place. */
  video: { enabled: true, rewardMin: 10, rewardOff: 15, minSeconds: 15 },

  /* Corporate and gifting orders. Kept apart from wholesale because the
     conversation is different — branding, invoicing and a delivery date
     against an event, rather than club rates against a quantity. */
  corporate: { enabled: true, min: 10 },

  /* Extended warranty, sold per bat at checkout the way engraving is.
     Toss Power X already ships with 3 months, so on that bat these
     EXTEND the cover rather than repeat it — see warrantyFor() in
     js/app.js, which is what stops somebody paying ₹100 for a 3-month
     warranty they already have. */
  warranty: {
    enabled: true,
    plans: [
      { id: '3',  months: 3, price: 100 },
      { id: '6',  months: 6, price: 200 }
    ]
  },

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

/* ------------------------------------------------------------
   Two surfaces, two sessions.

   This file is loaded by BOTH index.html and maze.html, so a
   single storage key would mean a customer signing in on the shop
   overwrites the staff session in the same browser — and, worse,
   that every storefront request would then carry a staff token.
   The owner testing the shop on their own laptop is not an edge
   case here; it is the most likely person to hit it.

   maze.html declares itself, in an inline script above this one.
   The first attempt at this inferred the surface from the URL
   instead, and it was wrong the moment it was tried: both `serve`
   and Vercel strip `.html`, so the page loads at /maze and a test
   for /maze.html quietly reported "this is the storefront" — the
   exact confusion the split exists to prevent, and silent.

   The path check survives as a fallback for a page opened as a
   file:// URL or from a server that does keep the extension, and
   it now accepts both spellings.
   ------------------------------------------------------------ */
const IS_MAZE = (typeof TOSS_SURFACE !== 'undefined' && TOSS_SURFACE === 'maze')
  || /(^|\/)maze(\.html)?$/i.test(location.pathname);
const SESS_KEY  = IS_MAZE ? 'toss_maze_session' : 'toss_customer_session';
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

/* ------------------------------------------------------------
   Creating a customer account.

   Returns { session, needsConfirm }. Supabase decides which:
   with "Confirm email" on (the default) the response carries a
   user but NO access token, because nothing is proven until the
   link is clicked. With it off, a session comes straight back and
   the customer is signed in.

   Both are normal, so the caller is told which happened rather
   than having to infer it from a missing field — and the "check
   your email" screen is only shown when there is actually an
   email on the way.

   Note this depends on SMTP being configured. Supabase's built-in
   mailer sends two messages an hour for the whole project, which
   is fine for testing and useless in production; without a real
   provider a customer can create an account and then never be
   able to confirm it.
   ------------------------------------------------------------ */
async function signUp(email, password) {
  const j = await authFetch('signup', {
    email: String(email).trim(),
    password: password,
    /* Where the confirmation link comes back to. Same rule as the
       password reset: absolute, no fragment, allow-listed. */
    gotrue_meta_security: {},
    options: { email_redirect_to: resetRedirectURL() }
  });
  if (j && j.access_token) return { session: adopt(j), needsConfirm: false };
  return { session: null, needsConfirm: true };
}

/* ------------------------------------------------------------
   Google sign-in.

   A full-page redirect to Supabase, which bounces to Google and
   back with the tokens in the URL fragment — the same fragment
   consumeAuthFragment() has always parsed. No SDK, no popup, and
   nothing added to the storefront's script budget, which keeps
   NFR-4 ("no external JS dependencies on the storefront") true.

   Where to come back to is stashed in localStorage rather than
   carried on the URL, because `redirect_to` has to match the
   project's allow-list exactly and must arrive with no fragment
   of its own for Supabase to append to.

   REQUIRES, in the Supabase dashboard — none of this is code:
     · Authentication → Providers → Google: enabled, with the
       Client ID and Secret from Google Cloud
     · Authentication → URL Configuration → Redirect URLs: the
       deployed origin AND whatever is used locally
   Until then this returns a 400 from Supabase and the button
   reports it rather than hanging.
   ------------------------------------------------------------ */
const RETURN_KEY = 'toss_auth_return';

function signInWithGoogle(returnTo) {
  try {
    localStorage.setItem(RETURN_KEY, returnTo || location.hash || '#/account');
  } catch (e) { /* private mode — they just land on the default page */ }
  const back = location.origin + location.pathname;   // no fragment, no query
  location.href = SUPA_URL + '/auth/v1/authorize?provider=google'
    + '&redirect_to=' + encodeURIComponent(back);
}

/** Reads and clears where sign-in was started from. */
function takeAuthReturn() {
  try {
    const v = localStorage.getItem(RETURN_KEY);
    localStorage.removeItem(RETURN_KEY);
    return v || null;
  } catch (e) { return null; }
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

/* ------------------------------------------------------------
   Forgotten passwords.

   Supabase mails a link back to this page carrying a recovery
   token in the URL FRAGMENT — everything after the #. That is not
   an accident of the design: a fragment is never sent to the
   server and never lands in server logs or a Referer header, the
   way a query string would. It also means only JavaScript on the
   page can read it, which is why this is parsed here rather than
   handled by a redirect.

   The token is consumed and the fragment wiped immediately, so a
   working password-reset link cannot survive in the address bar
   for the next person on a shared machine to press Back into.
   ------------------------------------------------------------ */

/** Where Supabase should send someone after they click the email. */
function resetRedirectURL() {
  /* Absolute, no fragment, no query — Supabase matches this against the
     project's allow-list and appends its own fragment. */
  return location.origin + location.pathname;
}

/** Always resolves. Never reveals whether an account exists. */
async function requestPasswordReset(email) {
  try {
    await fetch(SUPA_URL + '/auth/v1/recover', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email).trim(), gotrue_meta_security: {} })
    });
  } catch (e) { /* deliberately swallowed — see below */ }
  /* Reporting failure here would turn this box into an account checker:
     ask it about an address, watch which answer comes back, learn who
     works here. The caller says the same thing either way. */
  return true;
}

/**
 * Reads a recovery (or confirmation) token out of the URL fragment and
 * adopts it as the session, then clears the fragment.
 * Returns 'recovery' | 'error' | null.
 */
function consumeAuthFragment() {
  const raw = String(location.hash || '').replace(/^#/, '');
  if (!raw || raw.indexOf('=') < 0) return null;
  const q = new URLSearchParams(raw);

  const wipe = () => {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { location.hash = ''; }
  };

  if (q.get('error') || q.get('error_description')) {
    lastAuthFragmentError = q.get('error_description') || q.get('error');
    wipe();
    return 'error';
  }

  const access = q.get('access_token');
  if (!access) return null;

  saveSession({
    access_token: access,
    refresh_token: q.get('refresh_token') || null,
    expires_at: Math.floor(Date.now() / 1000) + Number(q.get('expires_in') || 3600),
    user: null                    // filled in by fetchUser() below
  });
  /* Supabase puts `type=recovery` (or invite/signup) in the fragment for
     an emailed link, and NOTHING for an OAuth callback. Defaulting the
     absent case to 'recovery' would tell the caller that a plain Google
     sign-in was a password reset — which is how maze.html came to show
     its reset-password card after an OAuth round trip. 'session' is the
     honest name for "you are simply signed in now". */
  const type = q.get('type') || 'session';
  wipe();
  return type;
}

let lastAuthFragmentError = null;

/** The recovery fragment carries no user object, so ask for one. */
async function fetchUser() {
  if (!SESSION || !SESSION.access_token) return null;
  try {
    const r = await fetch(SUPA_URL + '/auth/v1/user', { headers: supaHeaders() });
    if (!r.ok) return null;
    const u = await r.json();
    saveSession(Object.assign({}, SESSION, { user: { id: u.id, email: u.email } }));
    return SESSION.user;
  } catch (e) { return null; }
}

/** Sets a new password on the CURRENTLY signed-in session. */
async function updatePassword(password) {
  const r = await fetch(SUPA_URL + '/auth/v1/user', {
    method: 'PUT', headers: supaHeaders(),
    body: JSON.stringify({ password: password })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.msg || j.error_description || j.message || r.statusText);
    e.code = j.error_code || j.error;
    throw e;
  }
  return j;
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
    /* Falls back to the publishable key, which is what an anonymous
       visitor reads the catalogue with.

       Customer accounts made this line load-bearing in a way it was not
       when only the Maze Room could hold a session. A signed-in shopper
       now sends their own token on EVERY storefront request, so a token
       that has gone stale would 401 the catalogue and the leaderboard
       too — public data that needs no token at all. checkToken() is
       therefore run before anything else touches the network on the
       storefront, and clears a rejected session so these fall back here.
       See accountBootFinish() in js/account.js. */
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
