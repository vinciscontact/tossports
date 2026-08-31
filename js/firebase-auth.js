/* ============================================================
   TOSS — FIREBASE CUSTOMER SIGN-IN

   Email and password, for CUSTOMERS ONLY.

   Staff keep using Supabase Auth in the Maze Room, so nothing here
   can lock anybody out of their own admin panel — which is what
   happened the last time these two systems were entangled (sql/013).

   Phone OTP was built and then removed at the client's request.
   Firebase caps a project without billing at 10 SMS a day, failed
   attempts count toward that cap, and it rate-limited during
   testing. The SQL side still matches a verified phone claim if one
   ever appears (sql/022), so putting it back is a UI change rather
   than a migration.

   ─────────────────────────────────────────────────────────────
   THE SDK IS LOADED LAZILY, AND THAT IS DELIBERATE

   NFR-4 says the storefront carries no external JavaScript. That
   rule exists so the shop renders and sells with nothing but its
   own files, and it still holds: nothing below is fetched until
   somebody actually opens #/account and asks to sign in. Browsing,
   the catalogue, the cart and checkout never touch Google's CDN.

   The honest statement of the deviation: the ACCOUNT PAGE has an
   external dependency now. The shop does not.

   ─────────────────────────────────────────────────────────────
   HOW THE TOKEN REACHES THE DATABASE

   Firebase proves who somebody is. Supabase decides what they can
   read, and it will only do that if the project is configured to
   trust Firebase:

     Supabase → Authentication → Third Party Auth → Firebase

   Without it Supabase rejects the token and answers 401 to EVERY
   request, including ones that would have succeeded anonymously.
   That is PRD C1 and it is the single most likely thing to be
   missed. checkFirebaseWiring() below detects exactly that state
   and says so in plain words rather than leaving a signed-in
   shell where nothing loads.

   FB_TOKEN is kept fresh by onIdTokenChanged and read
   synchronously by supaHeaders() in config.js — Firebase refreshes
   about every hour and fires that listener each time.
   ============================================================ */

/* The current Firebase ID token, or null. config.js reads this. */
let FB_TOKEN = null;
let FB_USER  = null;

/* Resolved SDK functions, once loaded. */
let FB = null;
let fbLoading = null;

/** Configured at all? Everything else checks this first. */
function fbConfigured() {
  return !!(typeof TOSS_FIREBASE !== 'undefined' && TOSS_FIREBASE.apiKey);
}

/* ------------------------------------------------------------
   Loading the SDK.

   The modular v10 build from Google's CDN, pulled with a dynamic
   import so it costs nothing until it is wanted. One promise is
   cached, so two rapid clicks do not fetch it twice.
   ------------------------------------------------------------ */
function fbLoad() {
  if (FB) return Promise.resolve(FB);
  if (fbLoading) return fbLoading;
  if (!fbConfigured()) {
    return Promise.reject(new Error('Sign-in is not configured yet.'));
  }

  const V = 'https://www.gstatic.com/firebasejs/10.12.2';
  fbLoading = Promise.all([
    import(V + '/firebase-app.js'),
    import(V + '/firebase-auth.js')
  ]).then(function (mods) {
    const app  = mods[0];
    const auth = mods[1];
    const a = auth.getAuth(app.initializeApp({
      apiKey:     TOSS_FIREBASE.apiKey,
      authDomain: TOSS_FIREBASE.authDomain,
      projectId:  TOSS_FIREBASE.projectId,
      appId:      TOSS_FIREBASE.appId
    }));

    /* Verification and reset mail follow the browser's language. */
    a.useDeviceLanguage();

    /* Fires on sign-in, sign-out AND on every hourly refresh. This is
       what keeps FB_TOKEN usable without asking for it per request. */
    auth.onIdTokenChanged(a, function (u) {
      FB_USER = u || null;
      if (!u) { FB_TOKEN = null; return; }
      u.getIdToken().then(function (t) { FB_TOKEN = t; })
                    .catch(function () { FB_TOKEN = null; });
    });

    FB = { auth: a, api: auth };
    return FB;
  }).catch(function (e) {
    fbLoading = null;                    // let a later attempt retry
    throw new Error('Could not load sign-in. Check your connection.');
  });

  return fbLoading;
}

/** Waits for the first auth state to settle, so the UI does not flash. */
function fbReady() {
  return fbLoad().then(function (f) {
    return new Promise(function (resolve) {
      const off = f.api.onAuthStateChanged(f.auth, function (u) {
        off();
        resolve(u || null);
      });
    });
  });
}


/* ============================================================
   EMAIL AND PASSWORD

   Firebase sends its own verification and reset mail, so this
   path needs no SMTP provider at all — which is the one thing
   the Supabase equivalent could not do without Resend.
   ============================================================ */

function fbSignUpEmail(email, pass) {
  return fbLoad()
    .then(function (f) { return f.api.createUserWithEmailAndPassword(f.auth, email, pass); })
    .then(function (r) { return r.user; })
    .catch(function (e) { throw fbError(e); });
}

function fbSignInEmail(email, pass) {
  return fbLoad()
    .then(function (f) { return f.api.signInWithEmailAndPassword(f.auth, email, pass); })
    .then(function (r) { return r.user; })
    .catch(function (e) { throw fbError(e); });
}

function fbResetEmail(email) {
  return fbLoad()
    .then(function (f) { return f.api.sendPasswordResetEmail(f.auth, email); })
    /* Resolves either way. Reporting "no such user" would turn the
       reset box into a way of asking the site who its customers are. */
    .then(function () { return true; })
    .catch(function () { return true; });
}

function fbSignOut() {
  FB_TOKEN = null; FB_USER = null;
  if (!FB) return Promise.resolve();
  return FB.api.signOut(FB.auth).catch(function () { /* local state is already gone */ });
}


/* ============================================================
   IS THIS ACTUALLY WIRED UP?

   The failure this codebase has already lived through: Firebase
   signs somebody in perfectly, Supabase refuses the token because
   the project was never told to trust it, and every request comes
   back 401 — leaving a signed-in-looking screen where nothing
   loads and nothing saves.

   Better to detect it and say so.
   ============================================================ */
/**
 * Reads a JWT payload without verifying it. Safe: this only decides what
 * to TELL the user. Nothing is trusted on the strength of it — Supabase
 * verifies the signature itself, which is the check that matters.
 */
function fbClaims(token) {
  try {
    const p = String(token).split('.')[1];
    const j = atob(p.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(j)));
  } catch (e) { return null; }
}

async function checkFirebaseWiring() {
  if (!FB_TOKEN) return 'signed-out';

  /* A missing `role` claim is NOT a failure any more.
     sql/023 grants the customer functions and reads to `anon` as well as
     `authenticated`, because PostgREST populates auth.jwt() from the
     verified token whichever role it resolves to. So access is decided
     by the `sub` claim, not by the role, and a token without one works.
     The claim is read only to report which mode is in play. */
  const c = fbClaims(FB_TOKEN) || {};
  const mode = c.role === 'authenticated' ? 'role-claim' : 'anon-role';

  /* What actually matters: can this token call the thing the account
     page depends on? A plain select cannot tell "denied" from "no orders
     yet" — both come back empty — so the probe is the RPC, which
     answers with a number or a permission error. */
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/rpc/link_my_history', {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: 'Bearer ' + FB_TOKEN,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    if (r.status === 401) return 'not-trusted';
    if (r.status === 403 || r.status === 404) return 'no-grant';
    return r.ok ? mode : 'error';
  } catch (e) { return 'offline'; }
}

/** Firebase error codes are not sentences. These are. */
function fbError(e) {
  const c = (e && e.code) || '';
  const say = {
    'auth/too-many-requests':
      'Too many attempts. Firebase has paused this for a while — try again shortly.',
    'auth/email-already-in-use':    'That email already has an account. Sign in instead.',
    'auth/invalid-credential':      'That email and password do not match an account.',
    'auth/wrong-password':          'That email and password do not match an account.',
    'auth/user-not-found':          'That email and password do not match an account.',
    'auth/weak-password':           'Passwords need at least 6 characters.',
    'auth/invalid-email':           'That email looks wrong.',
    'auth/network-request-failed':  'Could not reach the sign-in service. Check your connection.',
    /* Genuinely means the provider is off in the console. Worth saying
       precisely, because it was previously shown for rate limiting too
       and sent us checking a setting that was already correct. */
    'auth/operation-not-allowed':
      'Email sign-in is switched off for this project. Firebase Console → ' +
      'Authentication → Sign-in method.',
    'auth/quota-exceeded':
      'This project has hit a Firebase usage limit. Try again shortly.'
  }[c];
  const out = new Error(say || (e && e.message) || 'Could not sign you in just now.');
  out.code = c;
  return out;
}
