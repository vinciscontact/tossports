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
