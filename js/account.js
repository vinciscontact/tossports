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
  /* Which face the signed-out gate is showing: 'signin' | 'signup' */
  mode: 'signin'
};

/**
 * The signed-in CUSTOMER, or null.
 *
 * Firebase now, not Supabase — FB_USER is kept current by
 * onIdTokenChanged in firebase-auth.js. Normalised to { id, email,
 * phone } so nothing downstream has to know which provider signed
 * them in, or that a Firebase uid is a 28-character string where a
 * Supabase one was a uuid.
 *
 * `phone` stays in the shape even though only email sign-in is
 * offered: it costs nothing, and it is what would populate if phone
 * sign-in is ever switched back on.
 */
function acctUser() {
  if (typeof FB_USER === 'undefined' || !FB_USER) return null;
  return {
    id:    FB_USER.uid,
    email: FB_USER.email || '',
    phone: FB_USER.phoneNumber || ''
  };
}

/** What to call them on screen. Phone sign-ins have no email. */
function acctWho(u) { return (u && (u.email || u.phone)) || 'your account'; }

/* ------------------------------------------------------------
   Arriving on the page.

   Firebase keeps its own session in IndexedDB and restores it
   itself, so there is no fragment to consume and no token to pull
   out of a URL — the Supabase dance that used to live here is
   simply gone.

   Still split in two, for the same reason as before: the shop must
   render from bundled data without waiting on anything. The sync
   half runs before the first route() and does nothing but let the
   router work; the network half runs after and repaints when it
   lands.
   ------------------------------------------------------------ */
function accountBootSync() {
  /* Nothing to do synchronously any more. Kept as the seam app.js
     calls, so the boot order stays explicit and one day another
     provider can hook in here without touching init(). */
  return null;
}

async function accountBootFinish() {
  if (!fbConfigured()) return;

  let user = null;
  try {
    user = await fbReady();          // resolves once Firebase settles
  } catch (e) {
    /* The SDK could not load — offline, or blocked. The shop is
       unaffected; only the account page needs it. */
    return;
  }
  if (!user) { acctHeader(); return; }

  /* Before anything else on the page uses the network.

     supaHeaders() now attaches the Firebase token to EVERY request,
     so a token Supabase will not trust would 401 the catalogue and
     the leaderboard too — public reads that need no token at all.
     checkFirebaseWiring() asks the database what it makes of the
     token before the rest of the page depends on it. */
  const state = await checkFirebaseWiring();
  /* 'anon-role' and 'role-claim' are BOTH working states — see sql/023.
     Only a genuine refusal stops us. */
  if (state === 'not-trusted' || state === 'no-grant') {
    /* Signed in, but the database will not treat them as signed in.
       Saying so beats an empty order list that looks like they never
       bought anything — which is exactly how this fails when the role
       claim is missing, because those requests succeed and return
       nothing. */
    ACCOUNT.authError = fbWiringMessage(state);
    await fbSignOut();
    acctHeader();
    if (currentPage() === 'account') route(true);
    return;
  }

  /* No link_my_history() call here: checkFirebaseWiring() just made it
     as its probe, which is what proved the token works. Calling it twice
     would be a wasted round trip on every page load. */
  acctHeader();
  if (currentPage() === 'account') route(true);
}

/** Which page the router is showing right now. */
function currentPage() {
  return (String(location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0]) || 'home';
}

/** Sign out, drop everything cached about them, and land somewhere sensible. */
async function acctSignOut() {
  await fbSignOut();
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
  btn.title = u ? acctWho(u) : 'Sign in';
}

/* ============================================================
   THE PAGE
   ============================================================ */

/* ------------------------------------------------------------
   Signed out, this is an AUTH SCREEN and is laid out like one.

   It used to reuse the service-page header: a 6.5rem display
   headline reading SIGN IN over a near-empty dark band, with the
   form floating in white space below it and the password box
   pushed off the bottom of the screen. That is a marketing
   layout, and an auth page has the opposite job — one card, one
   decision, everything visible without scrolling.

   Split in two on desktop. The left panel answers "why would I",
   which is the only question a sign-in screen has to sell; the
   right holds the form. On a phone the panel collapses to a
   single line above the card, because 400px of value proposition
   in front of the thing somebody came to do is an obstacle.

   Signed IN it is a dashboard, and is laid out like one.

   It used to reuse the marketing header too: YOUR ACCOUNT in
   display caps over a near-empty navy band, then a 720px column
   floating in the middle of a 1440px screen with unframed form
   fields on bare white. Two thirds of the viewport carried
   nothing, and the largest thing on the page was the customer's
   own email address — which is the one fact they already know.

   Now the band earns its height: identity on the left, and a row
   of counts straddling the navy/white seam, so the first thing
   read is the state of their orders rather than a headline. Below
   it, a rail of sections on the left and the panel on the right —
   the shape every account page worth using has, because it shows
   where you are and what else there is at the same time.

   On a phone the rail becomes the scrolling pill row it always
   was, since a sidebar on a 375px screen is just a stack.
   ------------------------------------------------------------ */
function viewAccount() {
  const u = acctUser();

  if (u) return `
  <section class="svc-top dark dash-top">
    <div class="wrap">
      <nav class="crumbs"><a href="#/">Home</a> / <span>Account</span></nav>
      <div class="dash-id">
        <span class="dash-av" aria-hidden="true">${esc(acctInitial(u))}</span>
        <div class="dash-idm">
          <p class="eyebrow">Signed in as</p>
          <b class="dash-mail">${esc(acctWho(u))}</b>
        </div>
        <button class="btn btn-ghost sm dash-out" id="acctOut" type="button">Sign out</button>
      </div>
      <div class="dash-stats" id="acctStats">${acctStatsHTML()}</div>
    </div>
  </section>
  <section class="sec dash-body">
    <div class="wrap dash-grid" id="acctRoot">${acctShellHTML(u)}</div>
  </section>`;

  return `
  <section class="auth">
    <div class="auth-grid">

      <aside class="auth-side">
        <a class="auth-back" href="#/">${ICON.arrow} Back to the shop</a>
        <p class="eyebrow">Your orders</p>
        <h1 class="d2">Everything you have<span class="hl-2">bought, in one place.</span></h1>
        <ul class="auth-points">
          <li>${ICON.truck}<div><b>Track every order</b>
            <span>Status, courier and tracking number as it moves</span></div></li>
          <li>${ICON.cart}<div><b>Reorder in one tap</b>
            <span>Your last bag, refilled from today's catalogue</span></div></li>
          <li>${ICON.hammer}<div><b>Repairs and requests</b>
            <span>Bat Doctor jobs and quotes, kept with your orders</span></div></li>
        </ul>
        <p class="hv-proof">36.9K on Instagram · 4M reel reach · played by 170-player clubs</p>
      </aside>

      <div class="auth-col">
        <div class="auth-card" id="acctRoot">${acctGateHTML()}</div>
        <p class="auth-alt">Just finding an order?
          <a href="#/track">Track it without an account ${ICON.arrow}</a></p>
      </div>

    </div>
  </section>`;
}

/* ---------------- signed out ---------------- */

function acctGateHTML() {
  const err = ACCOUNT.authError;
  ACCOUNT.authError = null;                     // shown once, not on every render

  /* Nothing is configured yet — say so and offer the route that still
     works, rather than showing a form whose buttons cannot do anything. */
  if (!fbConfigured()) return `
    <div class="acct-gate">
      <p class="svc-stat bad">Sign-in is not switched on yet.</p>
      <p class="acct-gate-note">Accounts are being set up. In the meantime you
        do not need one to find an order.</p>
      <div class="acct-gate-alt">
        <a href="#/track" class="link-arrow">Track an order ${ICON.arrow}</a>
      </div>
    </div>`;

  const signup = ACCOUNT.mode === 'signup';

  return `
  <div class="acct-gate">
    <h2 class="auth-h">${signup ? 'Create your account' : 'Sign in'}</h2>
    ${err ? `<p class="svc-stat bad">${esc(err)}</p>` : ''}


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
      <button class="btn btn-primary btn-block" type="submit">
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

  </div>`;
}

/* ---------------- signed in ---------------- */

/** The letter in the avatar disc. Their email's first character, upper-cased. */
function acctInitial(u) {
  const s = String((u && (u.email || u.phone)) || '').trim();
  const c = s.replace(/[^a-z0-9]/i, '').charAt(0);
  return (c || '?').toUpperCase();
}

/**
 * "With us since". Firebase records when the account was created and hands
 * it over with the user, so this costs no request and no extra column.
 */
function acctSince() {
  try {
    const t = FB_USER && FB_USER.metadata && FB_USER.metadata.creationTime;
    if (!t) return '';
    const d = new Date(t);
    return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
}

/* ------------------------------------------------------------
   The counts across the seam of the navy band.

   Only ever a summary of what has ALREADY been loaded — nothing
   here makes a request of its own. Until the load lands they read
   an em dash rather than a confident zero, because "0 orders" and
   "not asked yet" are different things and only one of them is
   worth telling somebody who has bought from us.
   ------------------------------------------------------------ */
const REQ_OPEN = s => ['done', 'declined', 'closed', 'cancelled'].indexOf(String(s)) < 0;
const ORDER_MOVING = s => ['delivered', 'cancelled', 'refunded'].indexOf(String(s)) < 0;

function acctStatsHTML() {
  const ready = ACCOUNT.loaded && !ACCOUNT.loading;
  const n = v => ready ? String(v) : '—';
  const since = acctSince();

  const stats = [
    [n(ACCOUNT.orders.length),                                  'Orders placed'],
    [n(ACCOUNT.orders.filter(o => ORDER_MOVING(o.status)).length), 'On the way'],
    [n(ACCOUNT.requests.filter(r => REQ_OPEN(r.status)).length),   'Open requests'],
    [since || '—',                                              'With us since']
  ];

  return stats.map(([val, label]) => `
    <div class="dash-stat">
      <b class="num">${esc(val)}</b>
      <span>${label}</span>
    </div>`).join('');
}

/* ------------------------------------------------------------
   The rail.

   Plain buttons with aria-pressed rather than role="tab". A real
   tablist promises arrow-key navigation between the tabs, and
   announcing a contract this does not implement is worse for a
   screen-reader user than not claiming it.

   Rendered on its own so the counts can be refreshed when the
   load lands, without rebuilding the panel beside it.
   ------------------------------------------------------------ */
const ACCT_TABS = [
  ['orders',   'Orders',             'cart',   () => ACCOUNT.orders.length],
  ['requests', 'Repairs & requests', 'hammer', () => ACCOUNT.requests.length],
  ['profile',  'Details',            'user',   () => 0]
];

function acctNavHTML() {
  const ready = ACCOUNT.loaded && !ACCOUNT.loading;
  return ACCT_TABS.map(([k, label, icon, count]) => {
    const c = ready ? count() : 0;
    return `
      <button class="dash-navb${ACCOUNT.tab === k ? ' on' : ''}" type="button"
              aria-pressed="${ACCOUNT.tab === k}" data-tab="${k}">
        <span class="dash-navi">${ICON[icon] || ''}</span>
        <span class="dash-navl">${label}</span>
        ${c ? `<span class="dash-navc num">${c}</span>` : ''}
      </button>`;
  }).join('');
}

function acctShellHTML(u) {
  const wa = String((typeof TOSS_LINKS !== 'undefined' && TOSS_LINKS.whatsapp) || '');
  return `
  <aside class="dash-rail">
    <nav class="dash-nav" id="acctNav" aria-label="Account sections">${acctNavHTML()}</nav>
    <div class="dash-help">
      <p class="eyebrow">Need a hand?</p>
      <a class="link-arrow" href="#/track">Track an order ${ICON.arrow}</a>
      ${wa ? `<a class="link-arrow" target="_blank" rel="noopener"
        href="https://wa.me/${esc(wa)}">WhatsApp us ${ICON.arrow}</a>` : ''}
      <p class="dash-help-n">Both work without signing in — the account just
        keeps it all in one place.</p>
    </div>
  </aside>
  <div class="dash-main" id="acctBody" aria-live="polite">${acctBodyHTML()}</div>`;
}

/** The heading every panel opens with, so the rail is never the only label. */
function dashHead(title, sub) {
  return `<header class="dash-h">
    <h2 class="dash-h2">${title}</h2>
    <p class="dash-sub">${sub}</p>
  </header>`;
}

/**
 * An empty state that looks deliberate rather than broken: the section's
 * own icon, one sentence saying what will land here, and the one action
 * worth taking instead.
 */
function dashEmpty(icon, title, body, cta) {
  return `<div class="dash-empty">
    <span class="dash-empty-i">${ICON[icon] || ''}</span>
    <b>${title}</b>
    <p>${body}</p>
    ${cta || ''}
  </div>`;
}

function acctBodyHTML() {
  if (ACCOUNT.loading) return `<div class="dash-load"><span></span><span></span><span></span></div>`;
  if (ACCOUNT.error)   return `<p class="svc-stat bad">${esc(ACCOUNT.error)}</p>`;
  if (ACCOUNT.tab === 'requests') return acctRequestsHTML();
  if (ACCOUNT.tab === 'profile')  return acctProfileHTML();
  return acctOrdersHTML();
}

/* ---------------- orders ---------------- */

function acctOrdersHTML() {
  const list = ACCOUNT.orders;
  return `
  ${dashHead('Orders', list.length
    ? 'Every bat, ball and jersey you have bought from us, newest first.'
    : 'Everything you buy from us lands here, with its delivery.')}
  ${list.length ? list.map(acctOrderHTML).join('') : dashEmpty(
    'cart', 'No orders on this account yet.',
    'If you have ordered before — over WhatsApp, or without signing in — claim ' +
    'it below and it will appear here.')}
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
  <section class="dash-card acct-claim">
    <header class="dash-ch">
      <h3>Ordered before?</h3>
      <span class="dash-cn">One-time link</span>
    </header>
    <form class="svc-form" id="acctClaim" novalidate>
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
    </form>
  </section>`;
}

/* ---------------- requests ---------------- */

const REQ_KIND = {
  bat_doctor: 'Bat Doctor repair', custom_bat: 'Custom bat',
  jersey: 'Team jersey', wholesale: 'Wholesale enquiry',
  trade_in: 'Trade-in', video: 'Customer video',
  corporate: 'Corporate order'
};

function acctRequestsHTML() {
  const head = dashHead('Repairs &amp; requests',
    'Bat Doctor jobs, custom builds, trade-ins and enquiries — with what we quoted.');

  if (!ACCOUNT.requests.length) return head + dashEmpty(
    'hammer', 'Nothing here yet.',
    'Repairs, custom bats, trade-ins and wholesale enquiries you send us will ' +
    'show up here with whatever we have quoted.',
    `<a href="#/service/bat-doctor" class="link-arrow">See what we can do ${ICON.arrow}</a>`);

  return head + ACCOUNT.requests.map(r => `
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
  const u = acctUser() || {};
  const addrs = Array.isArray(p.addresses) ? p.addresses : [];

  return `
  ${dashHead('Details', 'Typed once here, filled in for you at every checkout.')}

  <section class="dash-card">
    <header class="dash-ch"><h3>Who you are</h3></header>

    <!-- Read-only on purpose: the email IS the account. Changing it is a
         Firebase re-authentication flow, not a text box, and offering a
         box that silently does not move the account would be a lie. -->
    <div class="dash-ro">
      <div>
        <span>Email</span>
        <b>${esc(u.email || '—')}</b>
      </div>
      <span class="dash-ro-tag">${ICON.shield} Verified sign-in</span>
    </div>

    <form class="svc-form" id="acctProfile" novalidate>
      <div class="svc-grid">
        <div class="svc-f">
          <label for="pfName">Name</label>
          <input id="pfName" type="text" value="${esc(p.name || '')}" autocomplete="name"
                 placeholder="As it should read on the parcel">
        </div>
        <div class="svc-f">
          <label for="pfPhone">Phone</label>
          <input id="pfPhone" type="tel" inputmode="numeric" value="${esc(p.phone || '')}"
                 autocomplete="tel" placeholder="10 digits">
        </div>
      </div>
      <div class="svc-actions">
        <button class="btn btn-primary" type="submit">Save details</button>
        <p class="svc-stat" id="pfStat" role="status"></p>
      </div>
    </form>
  </section>

  <section class="dash-card">
    <header class="dash-ch">
      <h3>Delivery addresses</h3>
      ${addrs.length ? `<span class="dash-cn num">${addrs.length} saved</span>` : ''}
    </header>

    ${addrs.length ? `<ul class="acct-addrs">${addrs.map((a, i) => `
      <li>
        <div>
          <b>${esc(a.label || a.city || 'Address')}</b>
          <span>${esc([a.address, a.city, a.state, a.pin].filter(Boolean).join(', '))}</span>
        </div>
        <button class="btn btn-ghost sm" data-addr-del="${i}" type="button">Remove</button>
      </li>`).join('')}</ul>`
      : `<p class="acct-note">No saved addresses yet. Add one and checkout fills
           itself in next time.</p>`}

    <form class="svc-form acct-addr-new" id="acctAddr" novalidate>
      <p class="dash-sh">Add an address</p>
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
          <input id="adCity" type="text" placeholder="Chennai">
        </div>
        <div class="svc-f">
          <label for="adState">State</label>
          <input id="adState" type="text" placeholder="Tamil Nadu">
        </div>
      </div>
      <div class="svc-actions">
        <button class="btn btn-ghost" type="submit">Add address</button>
        <p class="svc-stat" id="adStat" role="status"></p>
      </div>
    </form>
  </section>`;
}

/* ============================================================
   WIRING
   ============================================================ */

function wireAccount() {
  const root = $('#acctRoot');
  if (!root) return;

  wireGate();

  const out = $('#acctOut');
  if (out) out.onclick = acctSignOut;

  wireAccountNav();

  if (acctUser() && !ACCOUNT.loaded && !ACCOUNT.loading) loadAccount();

  wireAccountBody();
}

/* Re-run whenever the rail is rebuilt, because refreshing the counts
   replaces the buttons these handlers were attached to. */
function wireAccountNav() {
  /* Repaint just the panel rather than re-routing: the sections are a view
     of data already in hand, and a full route() would scroll the page. */
  $$('.dash-navb').forEach(b => b.onclick = () => {
    ACCOUNT.tab = b.dataset.tab;
    $$('.dash-navb').forEach(x => {
      const on = x.dataset.tab === ACCOUNT.tab;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', String(on));
    });
    paintAccountBody();
  });
}

/* ------------------------------------------------------------
   Email and password.

   All of it goes through js/firebase-auth.js. Firebase sends its
   own verification and reset mail, so unlike the Supabase version
   this path needs no SMTP provider at all.
   ------------------------------------------------------------ */
const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));

/* ------------------------------------------------------------
   The step after any successful Firebase sign-in.

   Firebase has proved who they are. Whether the DATABASE agrees
   is a separate question, and the one this codebase has been
   caught by before: if Supabase was never told to trust Firebase,
   it rejects the token and answers 401 to everything, leaving a
   signed-in screen where nothing loads and nothing saves.

   So the wiring is checked before anything is promised. A failure
   here is a setup problem, not a customer problem, and it says so
   rather than showing an empty order list as though they had
   never bought anything.
   ------------------------------------------------------------ */
/* Both of these are setup problems, not customer problems, and they look
   identical from the outside — a signed-in screen with nothing in it. The
   messages differ because the fix differs. */
function fbWiringMessage(state) {
  if (state === 'no-grant') {
    return 'Signed in, but the database is refusing to read your orders. ' +
           'sql/023-no-role-claim-needed.sql has not been run. ' +
           'Nothing is wrong with your account.';
  }
  return 'Signed in, but this site cannot read your orders yet — Firebase is ' +
         'not registered with the database. Nothing is wrong with your account.';
}

async function afterFirebaseSignIn() {
  const state = await checkFirebaseWiring();

  if (state === 'not-trusted' || state === 'no-grant') {
    await fbSignOut();
    ACCOUNT.authError = fbWiringMessage(state);
    acctHeader(); route(true);
    return false;
  }
  if (state === 'offline') {
    ACCOUNT.authError = 'Signed in, but the connection dropped. Try again shortly.';
    acctHeader(); route(true);
    return false;
  }

  /* Verified phone and verified email both link history server-side —
     for a phone sign-in that means every past order on that number is
     simply there, with no claim form. See sql/022. */
  try { await supaRpc('link_my_history', {}); } catch (e) { /* not fatal */ }

  ACCOUNT.loaded = false;
  acctHeader();
  route(true);
  return true;
}

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
    await fbResetEmail(email);
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
      /* Firebase, not Supabase. It sends its own verification and reset
         mail, which is why this path needs no SMTP provider at all. */
      if (ACCOUNT.mode === 'signup') await fbSignUpEmail(email, pass);
      else                           await fbSignInEmail(email, pass);
      ACCOUNT.mode = 'signin';
      await afterFirebaseSignIn();
    } catch (err) {
      stat.className = 'svc-stat bad';
      /* fbError() has already turned the code into a sentence, and keeps
         wrong-password and no-such-account saying the same thing so the
         form cannot be used to ask who has an account here. */
      stat.textContent = err.message || 'Could not sign you in just now.';
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
  paintAccountChrome();
}

/* ------------------------------------------------------------
   The counts, everywhere they appear.

   The stats strip sits in the navy band and the rail sits beside
   the panel, so neither is inside #acctBody — without this they
   would still read "—" and "no badge" after the orders had
   arrived and were visible two inches away.
   ------------------------------------------------------------ */
function paintAccountChrome() {
  const stats = $('#acctStats');
  if (stats) stats.innerHTML = acctStatsHTML();

  const nav = $('#acctNav');
  if (nav) { nav.innerHTML = acctNavHTML(); wireAccountNav(); }
}

/* ------------------------------------------------------------
   Loading.

   Three independent reads, so allSettled rather than all: a
   failure on any one of them should cost that section, not the
   whole page. Someone whose profile row does not exist yet still
   gets their orders.
   ------------------------------------------------------------ */
async function acctRead(uid) {
  const [orders, reqs, prof] = await Promise.allSettled([
    supa(`orders?user_id=eq.${uid}&order=created_at.desc&limit=100`),
    supa(`requests?user_id=eq.${uid}&order=created_at.desc&limit=50`),
    supa(`customer_profiles?user_id=eq.${uid}&limit=1`)
  ]);
  return {
    orders:   orders.status === 'fulfilled' ? (orders.value || []) : [],
    requests: reqs.status   === 'fulfilled' ? (reqs.value   || []) : [],
    profile:  prof.status   === 'fulfilled' ? ((prof.value || [])[0] || null) : null,
    dead:     orders.status === 'rejected' && reqs.status === 'rejected'
  };
}

async function loadAccount() {
  const u = acctUser();
  if (!u) return;

  ACCOUNT.loading = true; ACCOUNT.error = null;
  paintAccountBody();

  const uid = encodeURIComponent(u.id);
  let r = await acctRead(uid);

  /* ------------------------------------------------------------
     Nothing came back. Before believing it, ask the database to
     re-link.

     An order is stamped with the buyer's uid by a trigger, which
     only fires if they were signed in AT THE MOMENT of checkout.
     Anything bought as a guest — the WhatsApp hand-off included —
     lands with user_id null, and link_my_history() is what adopts
     it afterwards by matching the verified email on the token
     against the email on the order.

     That runs at sign-in and at page load, so it misses exactly
     the case somebody notices: order placed, Account opened, and
     the order is not there. Running it once when the list comes
     back empty costs one request in the only situation where it
     could possibly help, and none at all for a customer who
     already has orders.
     ------------------------------------------------------------ */
  if (!r.dead && !r.orders.length && !r.requests.length) {
    let linked = 0;
    try { linked = Number(await supaRpc('link_my_history', {})) || 0; }
    catch (e) { /* the empty list stands */ }
    if (linked > 0) r = await acctRead(uid);
  }

  ACCOUNT.orders   = r.orders;
  ACCOUNT.requests = r.requests;
  ACCOUNT.profile  = r.profile;
  if (r.dead) {
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
