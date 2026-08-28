/* ============================================================
   TOSS — CUSTOMER ACCOUNTS

   Sign in with Google, see what you have bought, buy it again,
   keep your addresses, follow a delivery.

   Two rules shape everything here.

   1. THE ACCOUNT IS A CONVENIENCE, NEVER A GATE. Nothing that
      could be done signed out stops working signed in, and
      nothing here is required to buy a bat. Anonymous checkout
      still takes most of this shop's money and #/track still
      answers "where is my bat" with no account at all.

   2. THE DATABASE DECIDES WHAT IS VISIBLE. Every read below is
      an ordinary select that Row Level Security narrows to the
      caller's own rows (sql/018-customer-accounts.sql). Nothing
      is hidden by leaving it off the screen — asking for someone
      else's orders returns an empty list, not a refusal, because
      to Postgres those rows are not there.
   ============================================================ */

const ACCOUNT = {
  orders: [], requests: [], profile: null,
  loaded: false, loading: false, tab: 'orders',
  /* Which face the signed-out gate is showing: 'signin' | 'signup' | 'reset' */
  mode: 'signin'
};

/** The signed-in user, or null. Read live — SESSION is replaced on refresh. */
function acctUser() { return (SESSION && SESSION.user) || null; }

/* ------------------------------------------------------------
   Arriving back from Google.

   Split in two, and the order matters.

   Google sends the tokens back in the URL fragment — the same
   place this app keeps its route. If route() ran first it would
   read '#access_token=…' as a path and show a 404 on the way in
   from a successful sign-in. So the synchronous half runs BEFORE
   the first route(): it consumes the fragment, wipes it, and
   restores the stored session, leaving a clean hash behind.

   The half that needs the network runs after, and re-routes when
   it lands. Nothing on the page waits for it — the shop renders
   from bundled data exactly as it does for a signed-out visitor.
   ------------------------------------------------------------ */
function accountBootSync() {
  const arrived = consumeAuthFragment();

  if (arrived === 'error') {
    /* The fragment carried a refusal rather than a token — a cancelled
       consent screen, or a redirect URL the project does not allow. */
    ACCOUNT.authError = lastAuthFragmentError || 'Sign-in did not complete.';
    takeAuthReturn();
    location.hash = '#/account';
    return null;
  }

  loadSession();

  /* A reset link carries type=recovery and a one-time token that
     consumeAuthFragment() has just adopted as a session. The customer is
     signed in at this point, but only so they can set a password — so
     the gate is put into reset mode and the account page shown, rather
     than dropping them into their orders with no idea what happened. */
  if (arrived === 'recovery') {
    ACCOUNT.mode = 'reset';
    takeAuthReturn();
    location.hash = '#/account';
    return arrived;
  }

  /* Put them back where they started before the first paint, so the
     account page is the first thing they see rather than a flash of
     the home page followed by a jump. */
  if (arrived) {
    const back = takeAuthReturn();
    if (back) location.hash = back;
  }
  return arrived;
}

async function accountBootFinish(arrived) {
  if (!SESSION) return;

  /* Before anything else on the page uses the network.

     supaHeaders() sends whatever session exists on EVERY request, so a
     token left in localStorage from last week would attach itself to the
     catalogue sync and the leaderboard — public reads that need no token
     — and 401 them. checkToken() asks the database what it makes of the
     token we are holding and clears it if the answer is "nothing", which
     drops those reads back to the publishable key.

     Signed out this costs nothing: the guard above already returned. */
  const state = await checkToken();
  if (state === 'rejected' || !SESSION) {
    acctHeader();
    if (currentPage() === 'account') route(true);
    return;
  }

  /* The fragment gives a token but no user, and a stored session may be
     stale, so confirm with the server rather than trusting either. */
  if (!SESSION.user) await fetchUser();

  if (arrived) {
    /* Anything carrying our Google-verified address attaches itself —
       service requests always, and orders where the customer filled in
       checkout's optional email. Orders placed without one still need
       the claim form, which is what it is there for. */
    try { await supaRpc('link_my_history', {}); } catch (e) { /* not fatal */ }
  }

  acctHeader();
  if (currentPage() === 'account') route(true);
}

/** Which page the router is showing right now. */
function currentPage() {
  return (String(location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0]) || 'home';
}

/** Sign out, drop everything cached about them, and land somewhere sensible. */
async function acctSignOut() {
  await signOut();
  ACCOUNT.orders = []; ACCOUNT.requests = [];
  ACCOUNT.profile = null; ACCOUNT.loaded = false;
  ACCOUNT.tab = 'orders';
  toast('Signed out');
  acctHeader();
  route(true);
}

/* ------------------------------------------------------------
   The header button.

   One control with two states rather than a Sign in link that
   swaps for an avatar: it goes to the same place either way, so
   muscle memory keeps working after signing in. The label is for
   screen readers only — the header has room for an icon and the
   bag already sets that precedent.
   ------------------------------------------------------------ */
function acctHeader() {
  const btn = $('#acctBtn');
  if (!btn) return;
  const u = acctUser();
  btn.innerHTML = ICON.user;
  btn.classList.toggle('on', !!u);
  btn.setAttribute('aria-label', u ? 'Your account' : 'Sign in');
  btn.title = u ? (u.email || 'Your account') : 'Sign in';
}

/* ============================================================
   THE PAGE
   ============================================================ */

function viewAccount() {
  const u = acctUser();
  return `
  <section class="svc-top dark">
    <div class="wrap">
      <nav class="crumbs"><a href="#/">Home</a> / <span>Account</span></nav>
      <p class="eyebrow">${u ? 'Signed in' : 'Your orders'}</p>
      <h1 class="d1">${u ? 'Your account' : 'Sign in'}</h1>
      <p class="lede">${u
        ? 'Everything you have ordered, and the details that make the next one quicker.'
        : 'Sign in to keep your orders, addresses and repairs in one place. You never needed an account to buy — and you still do not.'}</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap svc-wrap" id="acctRoot">
      ${u ? acctShellHTML(u) : acctGateHTML()}
    </div>
  </section>`;
}

/* ---------------- signed out ---------------- */

function acctGateHTML() {
  const err = ACCOUNT.authError;
  ACCOUNT.authError = null;                     // shown once, not on every render

  /* Arriving from a reset email. consumeAuthFragment() has already adopted
     the one-time token as a session, so this screen only has to set the
     new password — the customer is technically signed in the whole time,
     which is why it is shown here rather than behind the sign-in form. */
  if (ACCOUNT.mode === 'reset') return `
    <div class="acct-gate">
      <h2 class="acct-h3" style="margin-top:0">Choose a new password</h2>
      <form class="acct-form" id="acctReset" novalidate>
        <div class="svc-f">
          <label for="rsPw">New password</label>
          <input id="rsPw" type="password" autocomplete="new-password" minlength="8">
        </div>
        <div class="svc-f">
          <label for="rsPw2">Again</label>
          <input id="rsPw2" type="password" autocomplete="new-password" minlength="8">
        </div>
        <button class="btn btn-primary btn-block" type="submit">Save password</button>
        <p class="svc-stat" id="rsStat" role="status"></p>
      </form>
    </div>`;

  const signup = ACCOUNT.mode === 'signup';
  return `
  <div class="acct-gate">
    ${err ? `<p class="svc-stat bad">${esc(err)}</p>` : ''}

    <button class="btn btn-google" id="acctGoogle" type="button">
      ${ICON.google} Continue with Google
    </button>
    <p class="acct-gate-note">
      One tap, no password to remember. We only ever see your name and email.
    </p>

    <div class="acct-or"><span>or</span></div>

    <form class="acct-form" id="acctPw" novalidate>
      <div class="svc-f">
        <label for="pwEmail">Email</label>
        <input id="pwEmail" type="email" autocomplete="email" placeholder="you@example.com">
      </div>
      <div class="svc-f">
        <label for="pwPass">Password</label>
        <input id="pwPass" type="password" minlength="8"
               autocomplete="${signup ? 'new-password' : 'current-password'}"
               placeholder="${signup ? 'At least 8 characters' : ''}">
      </div>
      <button class="btn btn-dark btn-block" type="submit">
        ${signup ? 'Create account' : 'Sign in'}
      </button>
      <p class="svc-stat" id="pwStat" role="status"></p>
    </form>

    <div class="acct-gate-links">
      <button type="button" class="acct-link" id="acctToggle">
        ${signup ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
      ${signup ? '' : `<button type="button" class="acct-link" id="acctForgot">
        Forgot your password?</button>`}
    </div>

    <div class="acct-gate-alt">
      <p><b>Just want to find an order?</b></p>
      <p>You do not need an account for that — the order number and the phone
         you ordered with is enough.</p>
      <a href="#/track" class="link-arrow">Track an order ${ICON.arrow}</a>
    </div>
  </div>`;
}

/* ---------------- signed in ---------------- */

function acctShellHTML(u) {
  const tabs = [
    ['orders',   'Orders'],
    ['requests', 'Repairs & requests'],
    ['profile',  'Details']
  ];
  /* Plain buttons with aria-pressed rather than role="tab". A real
     tablist promises arrow-key navigation between the tabs, and
     announcing a contract this does not implement is worse for a
     screen-reader user than not claiming it. */
  return `
  <div class="acct-head">
    <div>
      <p class="eyebrow">Signed in as</p>
      <b class="acct-who">${esc(u.email || 'your account')}</b>
    </div>
    <button class="btn btn-ghost sm" id="acctOut" type="button">Sign out</button>
  </div>
  <div class="acct-tabs">
    ${tabs.map(([k, label]) => `
      <button class="acct-tab${ACCOUNT.tab === k ? ' on' : ''}" type="button"
              aria-pressed="${ACCOUNT.tab === k}" data-tab="${k}">${label}</button>`).join('')}
  </div>
  <div id="acctBody" aria-live="polite">${acctBodyHTML()}</div>`;
}

function acctBodyHTML() {
  if (ACCOUNT.loading) return `<p class="svc-stat">Loading…</p>`;
  if (ACCOUNT.error)   return `<p class="svc-stat bad">${esc(ACCOUNT.error)}</p>`;
  if (ACCOUNT.tab === 'requests') return acctRequestsHTML();
  if (ACCOUNT.tab === 'profile')  return acctProfileHTML();
  return acctOrdersHTML();
}

/* ---------------- orders ---------------- */

function acctOrdersHTML() {
  const list = ACCOUNT.orders;
  return `
  ${list.length ? list.map(acctOrderHTML).join('') : `
    <div class="acct-empty">
      <p><b>No orders on this account yet.</b></p>
      <p>If you have ordered before — over WhatsApp, or without signing in —
         claim it below and it will appear here.</p>
    </div>`}
  ${acctClaimHTML()}`;
}

function acctOrderHTML(o) {
  const at = Math.max(0, TRACK_STEPS.findIndex(s => s.k === o.status));
  const done  = o.status === 'delivered';
  const items = Array.isArray(o.items) ? o.items : [];
  const cour  = DELIVERY.couriers[o.courier] || {};
  const href  = o.tracking_url || cour.url || '';

  return `
  <article class="acct-order">
    <header class="acct-order-top">
      <div>
        <p class="eyebrow">${esc(o.id)}</p>
        <b>${new Date(o.created_at).toLocaleDateString('en-IN',
          { day: 'numeric', month: 'short', year: 'numeric' })}</b>
      </div>
      <b class="trk-total">${fmt(o.total)}</b>
    </header>

    <ol class="trk-steps compact">
      ${TRACK_STEPS.map((s, i) => `
        <li class="trk-step${i < at ? ' past' : ''}${i === at ? ' now' : ''}">
          <span class="trk-dot">${i < at || done ? ICON.check : ''}</span>
          <div><b>${esc(s.label)}</b></div>
        </li>`).join('')}
    </ol>

    ${o.tracking_no ? `
      <div class="trk-courier">
        <div>
          <p class="eyebrow">${esc(cour.label || 'Courier')}</p>
          <b>${esc(o.tracking_no)}</b>
        </div>
        ${href ? `<a class="btn btn-ghost sm" target="_blank" rel="noopener"
                     href="${esc(href)}">Track ${ICON.arrow}</a>` : ''}
      </div>
      <p class="acct-note">Copy the number above into the courier's page —
        they do not accept a direct link.</p>` : ''}

    ${items.length ? `<ul class="trk-items">${items.map(i => `
      <li><span>${esc(i.name || i.id)}${i.engrave
        ? ` <i class="acct-eng">“${esc(i.engrave)}”</i>` : ''}</span>
          <b>× ${i.qty || 1}</b></li>`).join('')}</ul>` : ''}

    <footer class="acct-order-foot">
      <span class="acct-method">${esc(String(o.method || '').toUpperCase())}</span>
      ${items.length ? `<button class="btn btn-ghost sm" data-reorder="${esc(o.id)}"
        type="button">Order this again</button>` : ''}
    </footer>
  </article>`;
}

/* ------------------------------------------------------------
   Claiming what came before.

   Almost every order this shop has taken was placed without an
   account, over WhatsApp or straight through checkout, and none
   of them carry an email — so there is nothing to match a Google
   account against. The customer supplies the missing link: one
   order number and the phone it was placed with. The check runs
   in the database (claim_orders), because the order book is not
   readable from here and must stay that way.
   ------------------------------------------------------------ */
function acctClaimHTML() {
  return `
  <form class="svc-form acct-claim" id="acctClaim" novalidate>
    <h3 class="acct-h3">Ordered before?</h3>
    <p class="acct-note">Bought from us over WhatsApp, or without signing in?
      Enter one order number and the phone you used, and every order on that
      number joins this account.</p>
    <div class="svc-grid">
      <div class="svc-f">
        <label for="clId">Order number</label>
        <input id="clId" type="text" placeholder="TOSS-1234" autocomplete="off">
      </div>
      <div class="svc-f">
        <label for="clPh">Phone used to order</label>
        <input id="clPh" type="tel" inputmode="numeric" placeholder="10 digits">
      </div>
    </div>
    <div class="svc-actions">
      <button class="btn btn-primary" type="submit">Find my orders</button>
    </div>
    <p class="svc-stat" id="clStat" role="status"></p>
  </form>`;
}

/* ---------------- requests ---------------- */

const REQ_KIND = {
  bat_doctor: 'Bat Doctor repair', custom_bat: 'Custom bat',
  jersey: 'Team jersey', wholesale: 'Wholesale enquiry',
  trade_in: 'Trade-in', video: 'Customer video',
  corporate: 'Corporate order'
};

function acctRequestsHTML() {
  if (!ACCOUNT.requests.length) return `
    <div class="acct-empty">
      <p><b>Nothing here yet.</b></p>
      <p>Repairs, custom bats, trade-ins and wholesale enquiries you send us
         will show up here with whatever we have quoted.</p>
      <a href="#/service/bat-doctor" class="link-arrow">See what we can do ${ICON.arrow}</a>
    </div>`;

  return ACCOUNT.requests.map(r => `
    <article class="acct-req">
      <header class="acct-order-top">
        <div>
          <p class="eyebrow">${esc(REQ_KIND[r.kind] || r.kind)}</p>
          <b>${new Date(r.created_at).toLocaleDateString('en-IN',
            { day: 'numeric', month: 'short', year: 'numeric' })}</b>
        </div>
        <span class="acct-pill acct-pill--${esc(r.status)}">${esc(r.status)}</span>
      </header>
      ${r.quote != null ? `<p class="acct-quote">Quoted <b>${fmt(r.quote)}</b></p>` : ''}
      ${r.staff_note ? `<p class="acct-note">${esc(r.staff_note)}</p>` : ''}
    </article>`).join('');
}

/* ---------------- profile ---------------- */

function acctProfileHTML() {
  const p = ACCOUNT.profile || {};
  const addrs = Array.isArray(p.addresses) ? p.addresses : [];
  return `
  <form class="svc-form" id="acctProfile" novalidate>
    <h3 class="acct-h3">Your details</h3>
    <p class="acct-note">Filled in for you at checkout, so you type it once
      rather than every time.</p>
    <div class="svc-grid">
      <div class="svc-f">
        <label for="pfName">Name</label>
        <input id="pfName" type="text" value="${esc(p.name || '')}" autocomplete="name">
      </div>
      <div class="svc-f">
        <label for="pfPhone">Phone</label>
        <input id="pfPhone" type="tel" inputmode="numeric" value="${esc(p.phone || '')}"
               autocomplete="tel" placeholder="10 digits">
      </div>
    </div>
    <div class="svc-actions">
      <button class="btn btn-primary" type="submit">Save</button>
    </div>
    <p class="svc-stat" id="pfStat" role="status"></p>
  </form>

  <h3 class="acct-h3">Delivery addresses</h3>
  ${addrs.length ? `<ul class="acct-addrs">${addrs.map((a, i) => `
    <li>
      <div>
        <b>${esc(a.label || a.city || 'Address')}</b>
        <span>${esc([a.address, a.city, a.state, a.pin].filter(Boolean).join(', '))}</span>
      </div>
      <button class="btn btn-ghost sm" data-addr-del="${i}" type="button">Remove</button>
    </li>`).join('')}</ul>`
    : `<p class="acct-note">No saved addresses yet.</p>`}

  <form class="svc-form acct-addr-new" id="acctAddr" novalidate>
    <div class="svc-grid">
      <div class="svc-f">
        <label for="adLabel">Label</label>
        <input id="adLabel" type="text" placeholder="Home, ground, office">
      </div>
      <div class="svc-f">
        <label for="adPin">PIN code</label>
        <input id="adPin" type="text" inputmode="numeric" placeholder="600001">
      </div>
    </div>
    <div class="svc-f">
      <label for="adAddr">Address</label>
      <input id="adAddr" type="text" placeholder="Door number, street, area">
    </div>
    <div class="svc-grid">
      <div class="svc-f">
        <label for="adCity">City</label>
        <input id="adCity" type="text">
      </div>
      <div class="svc-f">
        <label for="adState">State</label>
        <input id="adState" type="text">
      </div>
    </div>
    <div class="svc-actions">
      <button class="btn btn-ghost" type="submit">Add address</button>
    </div>
    <p class="svc-stat" id="adStat" role="status"></p>
  </form>`;
}

/* ============================================================
   WIRING
   ============================================================ */

function wireAccount() {
  const root = $('#acctRoot');
  if (!root) return;

  const gBtn = $('#acctGoogle');
  if (gBtn) gBtn.onclick = () => signInWithGoogle('#/account');

  wireGate();

  const out = $('#acctOut');
  if (out) out.onclick = acctSignOut;

  /* Repaint just the panel rather than re-routing: the tabs are a view
     of data already in hand, and a full route() would scroll the page. */
  $$('.acct-tab').forEach(b => b.onclick = () => {
    ACCOUNT.tab = b.dataset.tab;
    $$('.acct-tab').forEach(x => {
      const on = x.dataset.tab === ACCOUNT.tab;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', String(on));
    });
    paintAccountBody();
  });

  if (acctUser() && !ACCOUNT.loaded && !ACCOUNT.loading) loadAccount();

  wireAccountBody();
}

/* ------------------------------------------------------------
   Email and password.

   Everything here leans on config.js, which already carried the
   whole Supabase auth surface for the Maze Room — signIn, signUp,
   requestPasswordReset, updatePassword. None of this is new
   machinery; it simply was never offered to customers.
   ------------------------------------------------------------ */
const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));

function wireGate() {
  const toggle = $('#acctToggle');
  if (toggle) toggle.onclick = () => {
    ACCOUNT.mode = ACCOUNT.mode === 'signup' ? 'signin' : 'signup';
    route(true);
  };

  const forgot = $('#acctForgot');
  if (forgot) forgot.onclick = async () => {
    const stat = $('#pwStat');
    const email = ($('#pwEmail').value || '').trim();
    if (!looksLikeEmail(email)) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'Type your email above first, then press this.';
      $('#pwEmail').focus();
      return;
    }
    stat.className = 'svc-stat';
    stat.textContent = 'Sending…';
    await requestPasswordReset(email);
    /* The same answer whether or not that address has an account. Saying
       "no such user" would turn this box into a way of asking the site
       who its customers are. */
    stat.className = 'svc-stat good';
    stat.textContent = 'If that address has an account, a reset link is on its way.';
  };

  const form = $('#acctPw');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const stat = $('#pwStat');
    const email = ($('#pwEmail').value || '').trim();
    const pass  = $('#pwPass').value || '';

    if (!looksLikeEmail(email)) {
      stat.className = 'svc-stat bad'; stat.textContent = 'That email looks wrong.'; return;
    }
    if (pass.length < 8) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'Passwords need at least 8 characters.'; return;
    }

    stat.className = 'svc-stat';
    stat.textContent = ACCOUNT.mode === 'signup' ? 'Creating your account…' : 'Signing in…';
    try {
      if (ACCOUNT.mode === 'signup') {
        const r = await signUp(email, pass);
        if (r.needsConfirm) {
          stat.className = 'svc-stat good';
          stat.textContent = 'Account created. Check your email for the confirmation link.';
          return;
        }
      } else {
        await signIn(email, pass);
      }
      ACCOUNT.mode = 'signin';
      await accountBootFinish(true);      // links any history, then repaints
      acctHeader();
      route(true);
    } catch (err) {
      stat.className = 'svc-stat bad';
      /* Supabase answers "Invalid login credentials" for both a wrong
         password and an address with no account — deliberately. This
         keeps that property rather than helpfully leaking which it was. */
      stat.textContent = /invalid login/i.test(err.message || '')
        ? 'That email and password do not match an account.'
        : (err.message || 'Could not sign you in just now.');
    }
  };

  const reset = $('#acctReset');
  if (reset) reset.onsubmit = async e => {
    e.preventDefault();
    const stat = $('#rsStat');
    const a = $('#rsPw').value || '', b = $('#rsPw2').value || '';
    if (a.length < 8) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'Passwords need at least 8 characters.'; return;
    }
    if (a !== b) {
      stat.className = 'svc-stat bad'; stat.textContent = 'Those two do not match.'; return;
    }
    stat.className = 'svc-stat'; stat.textContent = 'Saving…';
    try {
      await updatePassword(a);
      ACCOUNT.mode = 'signin';
      toast('Password saved');
      await accountBootFinish(true);
      acctHeader();
      route(true);
    } catch (err) {
      stat.className = 'svc-stat bad';
      stat.textContent = err.message || 'Could not save that password.';
    }
  };
}

/* Re-run after every body repaint, because innerHTML replaces the
   nodes these handlers were attached to. */
function wireAccountBody() {
  const claim = $('#acctClaim');
  if (claim) claim.onsubmit = onClaimSubmit;

  $$('[data-reorder]').forEach(b => b.onclick = () => reorder(b.dataset.reorder));

  const pf = $('#acctProfile');
  if (pf) pf.onsubmit = onProfileSubmit;

  const ad = $('#acctAddr');
  if (ad) ad.onsubmit = onAddressSubmit;

  $$('[data-addr-del]').forEach(b =>
    b.onclick = () => removeAddress(Number(b.dataset.addrDel)));
}

function paintAccountBody() {
  const body = $('#acctBody');
  if (!body) return;
  body.innerHTML = acctBodyHTML();
  wireAccountBody();
}

/* ------------------------------------------------------------
   Loading.

   Three independent reads, so allSettled rather than all: a
   failure on any one of them should cost that section, not the
   whole page. Someone whose profile row does not exist yet still
   gets their orders.
   ------------------------------------------------------------ */
async function loadAccount() {
  const u = acctUser();
  if (!u) return;

  ACCOUNT.loading = true; ACCOUNT.error = null;
  paintAccountBody();

  const uid = encodeURIComponent(u.id);
  const [orders, reqs, prof] = await Promise.allSettled([
    supa(`orders?user_id=eq.${uid}&order=created_at.desc&limit=100`),
    supa(`requests?user_id=eq.${uid}&order=created_at.desc&limit=50`),
    supa(`customer_profiles?user_id=eq.${uid}&limit=1`)
  ]);

  ACCOUNT.orders   = orders.status === 'fulfilled' ? (orders.value || []) : [];
  ACCOUNT.requests = reqs.status   === 'fulfilled' ? (reqs.value   || []) : [];
  ACCOUNT.profile  = prof.status   === 'fulfilled' ? ((prof.value || [])[0] || null) : null;

  if (orders.status === 'rejected' && reqs.status === 'rejected') {
    ACCOUNT.error = 'Could not reach your account just now. Try again in a moment.';
  }

  ACCOUNT.loading = false; ACCOUNT.loaded = true;
  paintAccountBody();
}

/* ------------------------------------------------------------
   Claiming.
   ------------------------------------------------------------ */
async function onClaimSubmit(e) {
  e.preventDefault();
  const stat = $('#clStat');
  const id = $('#clId').value.trim();
  const phone = $('#clPh').value.trim();

  if (!id || phone.replace(/\D/g, '').length < 10) {
    stat.className = 'svc-stat bad';
    stat.textContent = 'Both the order number and the phone number, please.';
    return;
  }

  stat.className = 'svc-stat';
  stat.textContent = 'Checking…';
  try {
    const n = await supaRpc('claim_orders', { p_id: id, p_phone: phone });
    const count = Number(n) || 0;
    if (!count) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'No match for that pair — check the order number, ' +
        'or message us on WhatsApp and we will link it by hand.';
      return;
    }
    toast(count === 1 ? '1 order added' : count + ' items added');
    ACCOUNT.loaded = false;
    await loadAccount();
  } catch (err) {
    stat.className = 'svc-stat bad';
    stat.textContent = 'Could not check just now — ' + err.message;
  }
}

/* ------------------------------------------------------------
   Reorder.

   Rebuilt from the live catalogue rather than from the stored
   line, because a past order is a record of what something cost
   then, not an offer to sell it at that price now. Anything
   discontinued is skipped and said out loud — quietly dropping a
   bat and showing a smaller bag would be worse than the gap.
   ------------------------------------------------------------ */
function reorder(id) {
  const o = ACCOUNT.orders.find(x => x.id === id);
  if (!o) return;

  let added = 0, gone = 0;
  (o.items || []).forEach(l => {
    const p = byId(l.id);
    if (!p || !hasPrice(p)) { gone++; return; }
    for (let i = 0; i < Math.max(1, l.qty || 1); i++) {
      addToCart(l.id, l.variant || null, l.engrave || null);
    }
    added++;
  });

  if (!added) { toast('Nothing from that order is available right now'); return; }
  if (gone)   toast(gone === 1 ? '1 item is no longer available' : gone + ' items are no longer available');
  location.hash = '#/checkout';
}

/* ------------------------------------------------------------
   Profile and addresses.

   Upserted with merge-duplicates so the first save creates the
   row and every later one updates it — the customer should not
   have to know which of those is happening.
   ------------------------------------------------------------ */
async function saveProfile(patch, statEl) {
  const u = acctUser();
  if (!u) return false;
  const body = Object.assign({
    user_id: u.id,
    name: (ACCOUNT.profile && ACCOUNT.profile.name) || null,
    phone: (ACCOUNT.profile && ACCOUNT.profile.phone) || null,
    addresses: (ACCOUNT.profile && ACCOUNT.profile.addresses) || []
  }, patch);

  try {
    await supa('customer_profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: body
    });
    ACCOUNT.profile = body;
    return true;
  } catch (err) {
    if (statEl) {
      statEl.className = 'svc-stat bad';
      statEl.textContent = 'Could not save — ' + err.message;
    }
    return false;
  }
}

async function onProfileSubmit(e) {
  e.preventDefault();
  const stat = $('#pfStat');
  const phone = $('#pfPhone').value.trim();

  if (phone && phone.replace(/\D/g, '').length < 10) {
    stat.className = 'svc-stat bad';
    stat.textContent = 'That phone number looks short.';
    return;
  }

  stat.className = 'svc-stat';
  stat.textContent = 'Saving…';
  const ok = await saveProfile({ name: $('#pfName').value.trim() || null, phone: phone || null }, stat);
  if (ok) { stat.className = 'svc-stat good'; stat.textContent = 'Saved.'; }
}

async function onAddressSubmit(e) {
  e.preventDefault();
  const stat = $('#adStat');
  const a = {
    label:   $('#adLabel').value.trim(),
    address: $('#adAddr').value.trim(),
    city:    $('#adCity').value.trim(),
    state:   $('#adState').value.trim(),
    pin:     $('#adPin').value.trim()
  };

  if (!a.address || !a.city || a.pin.replace(/\D/g, '').length !== 6) {
    stat.className = 'svc-stat bad';
    stat.textContent = 'Address, city and a six-digit PIN code, please.';
    return;
  }

  stat.className = 'svc-stat';
  stat.textContent = 'Saving…';
  const list = ((ACCOUNT.profile && ACCOUNT.profile.addresses) || []).concat([a]);
  const ok = await saveProfile({ addresses: list }, stat);
  if (ok) { toast('Address saved'); paintAccountBody(); }
}

async function removeAddress(i) {
  const list = ((ACCOUNT.profile && ACCOUNT.profile.addresses) || []).slice();
  if (i < 0 || i >= list.length) return;
  list.splice(i, 1);
  const ok = await saveProfile({ addresses: list }, null);
  if (ok) { toast('Address removed'); paintAccountBody(); }
  else toast('Could not remove that address');
}

/* ------------------------------------------------------------
   Checkout prefill.

   The reason saved details are worth storing at all. Called by
   the checkout view; returns the best guess at who this is, or
   null when signed out — in which case checkout behaves exactly
   as it always has.
   ------------------------------------------------------------ */
function acctPrefill() {
  const u = acctUser();
  if (!u) return null;

  /* The email comes from the session, not the profile: Google has verified
     it, and it is the one field we can fill before any profile is saved.
     Filling checkout's optional email for a signed-in customer is also what
     makes their NEXT order link itself if they ever sign in elsewhere. */
  const p = ACCOUNT.profile || {};
  const a = (Array.isArray(p.addresses) && p.addresses[0]) || {};
  return {
    name: p.name || '', phone: p.phone || '',
    address: a.address || '', city: a.city || '',
    state: a.state || '', pin: a.pin || '',
    email: u.email || ''
  };
}

/* Warm the cache on any page, so checkout can prefill without a
   visit to #/account first. Cheap, and only ever for a signed-in
   user — an anonymous visitor makes no extra request. */
function acctWarm() {
  if (acctUser() && !ACCOUNT.loaded && !ACCOUNT.loading) loadAccount();
}
