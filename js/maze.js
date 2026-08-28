/* ============================================================
   MAZE ROOM — Toss Sports admin

   Auth and data are both Supabase. The access token Supabase
   passed to Supabase as a third-party JWT so Row Level Security
   can check the uid against the `admins` table. The UI hiding
   itself is a convenience — the database is what actually says no.
   ============================================================ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => n === null || n === undefined || n === '' ? '—' : '₹' + Number(n).toLocaleString('en-IN');
const when = t => t ? new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

let DB = { products: [], orders: [], coupons: [], scores: [], settings: {},
           categories: [{ id: 'bats', name: 'Bats', sort: 0 }], catSynced: false,
           branches: [], stock: [], brSynced: false,
           psGroups: [], playstyles: [], prodStyles: [], psSynced: false };

/* Which branch the screen is showing. '' = every branch combined, which
   only a founder may choose; a manager is pinned to their own and the
   switcher does not appear for them. */
let BRANCH = '';

/* Analysis computed by the database over every row, not just the orders
   the browser happened to download. `live` is false until 010 is run. */
let AN = { live: false, monthPL: [], perf: [], bestSeller: [], deadStock: [], loyalty: [] };

/* rows of an analysis view for the branch on screen */
const anBranch = rows => BRANCH ? rows.filter(r => r.branch_id === BRANCH) : rows;

/* month rows summed across branches when viewing all */
function anMonths() {
  const m = {};
  anBranch(AN.monthPL).forEach(r => {
    const t = m[r.month] || (m[r.month] = { month: r.month, orders: 0, revenue: 0,
      cogs: 0, expenses: 0, salaries: 0, net: 0 });
    ['orders','revenue','cogs','expenses','salaries','net'].forEach(k => t[k] += Number(r[k]) || 0);
  });
  return Object.values(m).sort((a, b) => a.month.localeCompare(b.month));
}
const monthLabel = k => {
  const [y, mo] = String(k).split('-');
  return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' }) + ' ’' + y.slice(2);
};
let TAB = 'dash';
let USER = null;
let AUTH = 'anon';        // anon | ok | rejected | unauthorised | offline

/* ---------------- toast ---------------- */
let toastT;
function toast(msg, bad) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.className = 'toast', 2600);
}

/* ---------------- auth ----------------

   Supabase Auth, directly. No Firebase SDK, no third-party token
   handoff, nothing to configure in a second console — the token
   Supabase issues is the token its own RLS reads.

   The panel is only shown once the database has actually accepted
   the token. Showing the shell first and discovering the token is
   refused afterwards is how this used to leave someone stranded on
   "Loading store…" looking signed in, with every write refused. */

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('#loginBtn'), err = $('#loginErr');
  btn.disabled = true; btn.textContent = 'Signing in…';
  err.classList.add('hide');
  try {
    await signIn($('#email').value, $('#password').value);
    await enterPanel();
  } catch (ex) {
    err.innerHTML = friendlyAuthError(ex);
    err.classList.remove('hide');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
};

function friendlyAuthError(ex) {
  const c = String((ex && (ex.code || '')) || '');
  const m = String((ex && ex.message) || '');
  if (/invalid_credentials|invalid_grant/i.test(c + m) || /Invalid login/i.test(m))
    return 'That email and password combination is not recognised.';
  if (/email_not_confirmed/i.test(c + m))
    return 'That account exists but its email has not been confirmed. ' +
           'In Supabase → Authentication → Users, open the user and confirm it.';
  if (/over_request_rate_limit|too many/i.test(c + m))
    return 'Too many attempts. Wait a minute and try again.';
  if (/signup.*disabled|not enabled/i.test(m))
    return 'Email sign-in is disabled for this project. Supabase → Authentication → ' +
           'Providers → Email.';
  if (/Failed to fetch|NetworkError/i.test(m))
    return 'Cannot reach Supabase. Check your connection.';
  return esc(m) || 'Sign-in failed.';
}

$('#logout').onclick = async () => { await signOut(); showGate(); };

function showGate() {
  USER = null; ME = null; AUTH = 'anon';
  gateCard('login');
  const p = $('#password'); if (p) p.value = '';
}

/* Called by config.js when a refresh token is refused mid-session, so an
   expired session lands on the login screen instead of a dead panel. */
function onSessionLost() {
  showGate();
  const err = $('#loginErr');
  if (err) { err.textContent = 'Your session expired. Sign in again.'; err.classList.remove('hide'); }
}

async function enterPanel() {
  USER = SESSION && SESSION.user;
  AUTH = await checkToken();

  if (AUTH !== 'ok') {
    /* Do not open the shell on a token the database will not accept. */
    await signOut();
    const err = $('#loginErr');
    err.innerHTML = AUTH === 'offline'
      ? 'Signed in, but the database is unreachable. Check your connection.'
      : 'Signed in, but the database refused the session. ' +
        'If this persists, the project URL or publishable key in config.js is wrong.';
    err.classList.remove('hide');
    return;
  }

  /* Bind this login to the staff row an owner added by email. Runs on every
     sign-in, not just the first: it is idempotent, and a staff row added
     after someone's account exists still needs claiming. */
  try { await supaRpc('claim_staff'); }
  catch (e) { console.warn('claim_staff:', e.message); }

  $('#gate').classList.add('hide');
  $('#shell').classList.remove('hide');
  $('#who').textContent = (USER && USER.email) || '';
  await loadAll();
  render();
}

/* ============================================================
   FORGOTTEN PASSWORDS
   ============================================================ */

function gateCard(which) {
  [['#loginForm','login'],['#forgotForm','forgot'],['#resetForm','reset']]
    .forEach(([sel, name]) => {
      const el = $(sel); if (el) el.classList.toggle('hide', name !== which);
    });
  $('#gate').classList.remove('hide');
  $('#shell').classList.add('hide');
}

$('#forgotLink').onclick = () => {
  $('#fpEmail').value = $('#email').value.trim();
  $('#fpMsg').classList.add('hide');
  gateCard('forgot');
  $('#fpEmail').focus();
};
$('#fpBack').onclick = () => gateCard('login');

$('#forgotForm').onsubmit = async e => {
  e.preventDefault();
  const email = $('#fpEmail').value.trim(), btn = $('#fpBtn'), msg = $('#fpMsg');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    msg.textContent = 'Enter the email you sign in with.';
    msg.classList.remove('hide'); return;
  }
  btn.disabled = true; btn.textContent = 'Sending…';
  await requestPasswordReset(email);
  btn.disabled = false; btn.textContent = 'Send the link';

  /* Deliberately the same answer whether or not that address has an
     account. Saying "no such user" would turn this box into a way to
     find out who works here. */
  msg.className = 'gate-err';
  msg.innerHTML = 'If <b>' + esc(email) + '</b> has a Maze Room login, a reset link is on ' +
    'its way. It expires in an hour, and it only works once.';
};

$('#resetForm').onsubmit = async e => {
  e.preventDefault();
  const pw = $('#rsPw').value, pw2 = $('#rsPw2').value;
  const btn = $('#rsBtn'), msg = $('#rsMsg');
  msg.classList.remove('hide'); msg.className = 'gate-err';

  if (pw.length < 8) { msg.textContent = 'At least 8 characters.'; return; }
  if (pw !== pw2)    { msg.textContent = 'Those two do not match.'; return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await updatePassword(pw);
    /* Signed out on purpose. Proving you can set the password is not the
       same as proving you meant to start a session on this machine, and
       typing the new one once immediately is a useful check that it saved. */
    await signOut();
    gateCard('login');
    const le = $('#loginErr');
    le.className = 'gate-err';
    le.innerHTML = 'Password changed. Sign in with the new one.';
  } catch (ex) {
    msg.textContent = /weak|short|password/i.test(ex.message || '')
      ? 'Supabase rejected that password — try a longer one.'
      : (ex.message || 'Could not save the password.');
  } finally {
    btn.disabled = false; btn.textContent = 'Save password';
  }
};

/* Resume a session from a previous visit. Anything wrong with it — expired,
   revoked, refused — ends on the login screen rather than a half-open panel. */
(async function resume() {
  /* An emailed link lands here with its token in the fragment. Handle that
     BEFORE resuming a stored session: whoever clicked the link is the person
     to serve, even if someone else's session is still sitting in this
     browser. */
  const arrived = consumeAuthFragment();
  if (arrived === 'error') {
    showGate();
    const le = $('#loginErr');
    le.className = 'gate-err';
    le.textContent = (lastAuthFragmentError || 'That link is no longer valid.') +
      ' Request a new one.';
    return;
  }
  if (arrived === 'recovery' || arrived === 'invite' || arrived === 'signup') {
    const u = await fetchUser();
    gateCard('reset');
    if (u && u.email) $('#rsWho').textContent = 'for ' + u.email;
    return;
  }

  loadSession();
  if (!SESSION || !SESSION.access_token) { showGate(); return; }
  if (tokenLife() < 60) await refreshSession();
  if (!SESSION) { showGate(); return; }
  try { await enterPanel(); } catch (e) { console.warn(e); showGate(); }
})();

/* ---------------- data ---------------- */
let lastLoadError = null;

async function loadAll() {
  $('#view').innerHTML = '<div class="loading">Loading store…</div>';
  lastLoadError = null;
  const get = async (q, fallback) => {
    try { return await supa(q); }
    catch (e) {
      /* keep the first real failure — swallowing these is what made the
         Maze Room blame a missing schema for an auth problem */
      if (!lastLoadError) lastLoadError = { q, message: e.message, status: e.status, code: e.code };
      console.warn(q, e.status, e.message);
      return fallback;
    }
  };
  const [products, orders, coupons, scores, settings, invoices, categories,
         branches, stock, monthPL, perf, bestSeller, deadStock, loyalty,
         psGroups, playstyles, prodStyles] = await Promise.all([
    get('products?select=*&order=sort.asc', []),
    get('orders?select=*&order=created_at.desc&limit=200', []),
    get('coupons?select=*&order=unlock_runs.asc', []),
    get('scores?select=*&order=runs.desc&limit=50', []),
    get('settings?select=*', []),
    get('invoices?select=*&order=issued_at.desc&limit=300', []),
    get('categories?select=*&order=sort.asc', null),  /* null = table missing */
    get('branches?select=*&order=sort.asc', null),
    get('product_stock?select=*', null),
    /* aggregates computed by Postgres over EVERY row — these stay correct
       no matter how many orders exist or how few the browser downloaded */
    get('v_month_pl?select=*&order=month.desc', null),
    get('v_product_performance?select=*&order=profit.desc', null),
    get('v_month_best_seller?select=*&rank=eq.1&order=month.desc', null),
    get('v_dead_stock?select=*&order=tied_up.desc', null),
    get('v_customer_loyalty?select=*&order=spend.desc&limit=200', null),
    /* play styles — null means 017 has not been run, which the Bats tab
       reports rather than showing an empty manager that saves nothing */
    get('playstyle_groups?select=*&order=sort.asc', null),
    get('playstyles?select=*&order=sort.asc', null),
    get('product_playstyles?select=*', null)
  ]);
  DB.products = products || [];
  DB.orders   = orders   || [];
  DB.coupons  = coupons  || [];
  DB.scores   = scores   || [];
  DB.catSynced = Array.isArray(categories);
  DB.categories = DB.catSynced && categories.length
    ? categories : [{ id: 'bats', name: 'Bats', sort: 0 }];

  DB.brSynced = Array.isArray(branches);
  DB.branches = DB.brSynced && branches.length ? branches : [];
  DB.stock = Array.isArray(stock) ? stock : [];

  /* All three tables arrive together or not at all — 017 creates them in one
     migration — so one flag covers the whole feature. */
  DB.psSynced   = Array.isArray(playstyles) && Array.isArray(psGroups);
  DB.psGroups   = DB.psSynced ? psGroups   : [];
  DB.playstyles = DB.psSynced ? playstyles : [];
  DB.prodStyles = Array.isArray(prodStyles) ? prodStyles : [];

  /* AN.live tells every screen whether it is showing complete figures
     from the database or falling back to whatever the browser downloaded */
  AN.live       = Array.isArray(monthPL);
  AN.monthPL    = Array.isArray(monthPL)    ? monthPL    : [];
  AN.perf       = Array.isArray(perf)       ? perf       : [];
  AN.bestSeller = Array.isArray(bestSeller) ? bestSeller : [];
  AN.deadStock  = Array.isArray(deadStock)  ? deadStock  : [];
  AN.loyalty    = Array.isArray(loyalty)    ? loyalty    : [];

  /* a manager is pinned to their branch — they never get to choose */
  if (ME && ME.branch_id && !isOwner()) BRANCH = ME.branch_id;
  DB.settings = {};
  (settings || []).forEach(s => DB.settings[s.key] = s.value);
  BILL.invoices = invoices || []; BILL.loaded = true;

  /* Each of these can fail on incomplete data, and if one throws the
     caller never calls render() — which is precisely how a recoverable
     problem turned into a permanently blank panel. checkSetup() is the
     part that TELLS the user what is wrong, so it must run even when the
     steps before it did not. */
  try { await loadOps(); } catch (e) { console.error('loadOps', e); }
  try { buildNav(); }     catch (e) { console.error('buildNav', e); }
  try { checkSetup(); }   catch (e) { console.error('checkSetup', e); }
}

/* Dock icons — 24×24 stroke, one per section. Monochrome so the dock
   reads as one object; the label lives in the tooltip. */
const DOCK_ICON = (() => {
  const s = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  return {
    dash:     s('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    sales:    s('<path d="M3 20h18"/><path d="M6 20v-6M11 20V9M16 20v-9M21 20V5"/>'),
    requests: s('<path d="M4 5h16v11H8l-4 4Z"/><path d="M8 9h8M8 12.5h5"/>'),
    fulfil:   s('<rect x="1.5" y="6" width="13" height="11" rx="1.5"/><path d="M14.5 9.5H19l3.5 3.5V17h-8z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>'),
    qa:       s('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>'),
    billing:  s('<path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22Z"/><path d="M9 7h6M9 11h6"/>'),
    finance:  s('<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>'),
    products: s('<path d="M10.5 3h3v7l2 2v7a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-7l2-2Z"/><path d="M10.5 6h3"/>'),
    team:     s('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.8 15.2c2.4.2 4.2 1.7 4.7 4.8"/>'),
    tasks:    s('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12.5 2.4 2.4 4.8-5.2"/>'),
    sops:     s('<path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2Z"/><path d="M5 20V4M9 6h6"/>'),
    boards:   s('<path d="M7 4h10v4a5 5 0 0 1-10 0Z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4m-4 4h8m-4-4v4"/>'),
    coupons:  s('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2.5 2.5 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2.5 2.5 0 0 0 0-4Z"/><path d="M13 7v2m0 6v2m0-6v2"/>'),
    scores:   s('<rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M7.5 10v4M5.5 12h4"/><circle cx="16" cy="11" r=".8" fill="currentColor"/><circle cx="18.5" cy="13" r=".8" fill="currentColor"/>'),
    /* Activity had no icon and silently fell back to the dashboard's, so two
       different sections rendered the same picture in the dock with nothing
       to tell them apart. A clock with a rewind arrow — it is the audit
       trail, a record of what already happened. */
    activity: s('<path d="M3.2 10.5A9 9 0 1 1 5 16.2"/><path d="M3 5.5v5h5"/><path d="M12 7.5V12l3 1.8"/>'),
    insights: s('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .9 1.7h5.4c.1-.7.4-1.3.9-1.7A6 6 0 0 0 12 3Z"/>'),
    branches: s('<path d="M3 21h18"/><path d="M5 21V8l5-4 5 4v13"/><path d="M15 21V11l4 2v8"/><path d="M8.5 12h3M8.5 16h3"/>'),
    settings: s('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.5 6.9l2 1.2M17.5 15.9l2 1.2M2.8 12h2.4M18.8 12h2.4M4.5 17.1l2-1.2M17.5 8.1l2-1.2"/>')
  };
})();

/* Where you came from. Every tab change — dock tap or an in-page shortcut
   like the dashboard's work list — pushes the tab it left, and the dock's
   back button walks the trail. */
let NAV_HIST = [];
function navPush(prev) {
  if (prev && prev !== TAB) {
    NAV_HIST.push(prev);
    if (NAV_HIST.length > 30) NAV_HIST.shift();
  }
  updateBackBtn();
}
function updateBackBtn() {
  const b = $('#dockBack');
  if (b) b.disabled = !NAV_HIST.length;
}
function navBack() {
  if (!NAV_HIST.length) return;
  TAB = NAV_HIST.pop();
  $$('#nav [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === TAB));
  updateBackBtn();
  render();
}

/* Nav is built from the signed-in person's role. This is convenience only —
   every table is independently protected by RLS, so a hidden tab is not
   what stops a salesperson reading payroll. */
function buildNav() {
  const tabs = ROLE_NAV[ME && ME.role] || [];
  if (tabs.length && !tabs.includes(TAB)) TAB = tabs[0];

  /* String(... || '?') and not (ME && ... || '?'). With ME null the old
     expression evaluated to null — the '?' sat INSIDE the && and never
     applied — so this line threw, loadAll() died before checkSetup(), and
     the panel sat on "Loading store…" forever. The banner that would have
     explained why never got the chance to render. A missing staff row has
     to degrade into a diagnosable screen, not a blank one. */
  const initials = String((ME && (ME.name || ME.email)) || '?')
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  $('#nav').innerHTML = `
    <button class="dk" id="dockBack" aria-label="Back" ${NAV_HIST.length ? '' : 'disabled'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/></svg>
      <span class="dk-tip">Back</span>
    </button>
    <span class="dk-div" aria-hidden="true"></span>` + tabs.map((t, i) => {
      const owned = FOUNDER_ONLY.includes(t);
      /* one divider, at the moment the founder group starts */
      const opensGroup = owned && !FOUNDER_ONLY.includes(tabs[i - 1]);
      return (opensGroup ? '<span class="dk-div" aria-hidden="true"></span>' : '') + `
    <button class="dk${TAB === t ? ' on' : ''}${owned ? ' owner' : ''}" data-tab="${t}"
            aria-label="${NAV_LABEL[t]}${owned ? ' — founder only' : ''}">
      ${DOCK_ICON[t] || DOCK_ICON.dash}
      <span class="dk-tip">${NAV_LABEL[t]}${owned ? ' <i>Founder only</i>' : ''}</span>
    </button>`;
    }).join('') + `
    <span class="dk-div" aria-hidden="true"></span>
    <button class="dk me" id="dockMe" aria-label="Account">
      <b>${initials || '?'}</b>
      <span class="dk-tip">Account</span>
    </button>`;

  $('#dockBack').onclick = navBack;
  $$('#nav [data-tab]').forEach(b => b.onclick = () => {
    const prev = TAB;
    TAB = b.dataset.tab;
    navPush(prev);
    $$('#nav [data-tab]').forEach(x => x.classList.toggle('on', x === b));
    $('#dockMenu').classList.add('hide');
    render();
  });

  /* the avatar opens the little glass account menu */
  const menu = $('#dockMenu');
  $('#dockMe').onclick = e => { e.stopPropagation(); menu.classList.toggle('hide'); };
  document.addEventListener('click', e => {
    if (!menu.classList.contains('hide') && !menu.contains(e.target)) menu.classList.add('hide');
  });

  wireDockMagnify();

  const chip = $('#whoRole');
  if (ME) { chip.textContent = ROLE_LABEL[ME.role] || ME.role; chip.className = 'role-chip ' + ME.role; }
  else chip.classList.add('hide');

  /* branch switcher sits beside the identity strip */
  const bs = $('#brSwitch');
  if (bs) {
    bs.innerHTML = branchSwitcher();
    const sel = $('#brSel');
    if (sel) sel.onchange = () => { BRANCH = sel.value; render(); };
  }

  /* the always-visible identity strip */
  const sa = $('#signedAs'), saName = $('#saName'), saRole = $('#saRole');
  if (sa) {
    if (ME) {
      saName.textContent = ME.name || ME.email || '';
      saRole.textContent = ROLE_LABEL[ME.role] || ME.role;
      saRole.className = 'role-chip ' + ME.role;
      sa.classList.remove('hide');
    } else sa.classList.add('hide');
  }
}

/* macOS-style magnification: icons swell as the pointer nears. Pure
   transform, mouse-only — touch and reduced-motion users get a still dock. */
function wireDockMagnify() {
  const dock = $('#nav');
  if (!dock || !matchMedia('(pointer:fine)').matches
      || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const items = $$('.dk', dock);
  const RANGE = 110, GROW = .5;
  dock.onmousemove = e => {
    items.forEach(it => {
      const r = it.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      const k = Math.max(0, 1 - d / RANGE);
      it.style.transform = `scale(${1 + GROW * k * k}) translateY(${-8 * k * k}px)`;
    });
  };
  dock.onmouseleave = () => items.forEach(it => it.style.transform = '');
}

/* Tell the user precisely which setup step is missing, instead of
   letting them stare at an empty screen. */
function checkSetup() {
  const b = $('#banner');
  let msg = '';

  /* Order matters: a rejected token makes every read fail, which used to look
     exactly like an empty database. Diagnose the auth layer first. */
  if (AUTH === 'rejected') {
    msg = `<b>The database refused your session.</b>
      Your sign-in worked, but Supabase would not accept the token it issued. That
      normally means the project URL or publishable key in <code>js/config.js</code>
      does not match this project.
      <br><br><span style="opacity:.7">Showing public data only, read-only.</span>`;
  } else if (!DB.products.length && lastLoadError) {
    msg = `Could not read the database — <code>${esc(lastLoadError.message)}</code>
           (HTTP ${esc(lastLoadError.status)} on <code>${esc(lastLoadError.q)}</code>).`;
  } else if (!DB.products.length) {
    msg = `No products found. Run <code>sql/schema.sql</code> in the Supabase SQL Editor
           to create the tables and seed your 29 bats.`;
  } else if (!ME) {
    msg = `You are signed in, but you are not on the staff list — so the database is
           handing you nothing back. An owner adds you by email, and your login binds
           itself to that row the next time you sign in:
           <br><br><code>insert into public.staff (name, email, role)
           values ('Your Name', '${esc(USER && USER.email)}', 'owner');</code>
           <br><br>Then sign out and back in. <code>claim_staff()</code> matches on
           email and fills in the rest.`;
  }
  b.innerHTML = msg;
  b.classList.toggle('hide', !msg);
}

async function saveRow(table, row, keyCol) {
  const key = keyCol || 'id';
  await supa(table + '?' + key + '=eq.' + encodeURIComponent(row[key]), {
    method: 'PATCH', body: row, headers: { Prefer: 'return=minimal' }
  });
}
async function insertRow(table, row) {
  await supa(table, { method: 'POST', body: row, headers: { Prefer: 'return=minimal' } });
}
async function deleteRow(table, key, val) {
  await supa(table + '?' + key + '=eq.' + encodeURIComponent(val), {
    method: 'DELETE', headers: { Prefer: 'return=minimal' }
  });
}
const slugify = s => s.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/* ---------------- branches ---------------- */
const multiBranch = () => DB.branches.filter(b => b.active).length > 1;
const branchName = id => (DB.branches.find(b => b.id === id) || {}).name || id || '—';
const defaultBranch = () => (DB.branches.find(b => b.is_default) || DB.branches[0] || {}).id;

/* stock for a product: in the selected branch, or the company total when
   viewing all branches */
function stockOf(productId, branchId) {
  const b = branchId === undefined ? BRANCH : branchId;
  if (!DB.stock.length) {                       /* migration not run yet */
    const p = DB.products.find(x => x.id === productId);
    return p ? (p.stock || 0) : 0;
  }
  return DB.stock
    .filter(s => s.product_id === productId && (!b || s.branch_id === b))
    .reduce((t, s) => t + (s.stock || 0), 0);
}

/* the rows the current branch view should show */
function branchOrders(list) {
  if (!BRANCH) return list;
  return list.filter(o => (o.branch_id || defaultBranch()) === BRANCH);
}

/* The switcher. Founders only — a manager has one branch and showing them
   a chooser with one entry is noise. */
function branchSwitcher() {
  if (!multiBranch()) return '';
  if (!isOwner()) return `<span class="br-pin">${esc(branchName(BRANCH))}</span>`;
  return `<select class="br-sel" id="brSel" aria-label="Branch">
    <option value="">All branches</option>
    ${DB.branches.filter(b => b.active).map(b =>
      `<option value="${esc(b.id)}" ${BRANCH === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
  </select>`;
}

/* ---------------- render ---------------- */
function render() {
  const v = $('#view');
  if (!ME) { v.innerHTML = ''; return; }   /* banner explains what to do */

  const R = {
    dash:     [viewOpsDash,   wireDash],
    sales:    [viewSales,     wireSales],
    fulfil:   [viewFulfil,    wireFulfil],
    requests: [viewRequests,  wireRequests],
    qa:       [viewQA,        wireQAAdmin],
    finance:  [viewFinance,   wireFinance],
    products: [viewProducts,  wireProducts],
    billing:  [viewBilling,   wireBilling],
    team:     [viewTeam,      wireTeam],
    tasks:    [viewTasks,     wireTasks],
    sops:     [viewSops,      wireSops],
    boards:   [viewBoards,    wireBoards],
    coupons:  [viewCoupons,   wireCoupons],
    scores:   [viewScores,    wireScores],
    activity: [viewActivity,  wireActivity],
    insights: [viewInsights,  wireInsights],
    branches: [viewBranches,  wireBranches],
    settings: [viewSettings,  wireSettings]
  }[TAB];
  if (!R) { v.innerHTML = '<div class="empty">Nothing here.</div>'; return; }

  /* A tab that is not in this person's ROLE_NAV must not render even if
     TAB was set some other way. The database refuses the data regardless;
     this stops a half-drawn screen full of empty tables. */
  const allowed = ROLE_NAV[ME.role] || [];
  if (!allowed.includes(TAB)) {
    v.innerHTML = `<div class="head"><h2>Not your section</h2></div>
      <div class="empty">Your role doesn't have access to this. Ask a founder if you need it.</div>`;
    return;
  }
  v.innerHTML = R[0]();
  if (R[1]) R[1]();
}

/* ---------------- activity (the audit trail) ----------------
   Founder-only, append-only, straight from the database. Nothing here is
   written by the browser — Postgres triggers record it, and no policy
   allows update or delete, so it cannot be quietly rewritten. */
let AUDIT = { rows: [], loaded: false, filter: '' };

function viewActivity() {
  const rows = AUDIT.filter
    ? AUDIT.rows.filter(r => r.entity === AUDIT.filter)
    : AUDIT.rows;
  const ENTITY = { products:'Products', settings:'Settings', staff:'Team',
                   payroll:'Payroll', coupons:'Rewards', invoices:'Invoices' };

  return `
    <div class="head"><h2>Activity</h2>
      <span class="muted">${AUDIT.loaded ? rows.length + ' recorded' : 'loading…'}</span>
      <span class="sp">${exportBar('activity')}
        <button class="btn ghost sm" id="auRefresh">Refresh</button></span>
    </div>
    <p class="muted" style="margin-bottom:14px">Every change to prices, products, the team,
      payroll, rewards and settings — who did it and when. This log cannot be edited or
      deleted by anyone, including you.</p>
    <div class="cat-row">
      <button class="cat-chip${AUDIT.filter === '' ? ' on' : ''}" data-au="">All</button>
      ${Object.keys(ENTITY).map(k => `<button class="cat-chip${AUDIT.filter === k ? ' on' : ''}"
        data-au="${k}">${ENTITY[k]}</button>`).join('')}
    </div>
    ${!AUDIT.loaded
      ? '<div class="empty">Reading the log…</div>'
      : !rows.length
        ? `<div class="empty">Nothing recorded yet.${AUDIT.filter ? ' Try another filter.' : ''}
             <br><span class="muted">If you have made changes and this is empty, run
             <code>sql/008-access-control.sql</code> in Supabase.</span></div>`
        : `<div class="tbl-wrap"><table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Section</th></tr></thead>
            <tbody>${rows.slice(0, 200).map(r => `<tr>
              <td class="muted" style="white-space:nowrap">${auWhen(r.at)}</td>
              <td><div>${esc(r.actor_name || 'system')}</div>
                  <div class="pid">${esc(ROLE_LABEL[r.actor_role] || r.actor_role || '')}</div></td>
              <td>${esc(r.summary || r.action)}</td>
              <td><span class="pill ${r.action === 'delete' ? 'off' : r.action === 'insert' ? 'on' : 'low'}">
                ${esc(ENTITY[r.entity] || r.entity)}</span></td>
            </tr>`).join('')}</tbody>
          </table></div>`}`;
}

function auWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts), now = new Date();
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 1440) return Math.round(mins / 60) + ' hr ago';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

async function loadAudit(force) {
  if (AUDIT.loaded && !force) return;
  try {
    AUDIT.rows = await supa('audit_log?select=*&order=at.desc&limit=300') || [];
  } catch (e) {
    AUDIT.rows = [];                       /* table not created yet — the view says so */
    console.warn('audit log:', e.message);
  }
  AUDIT.loaded = true;
  if (TAB === 'activity') render();
}

function wireActivity() {
  $$('[data-au]').forEach(b => b.onclick = () => { AUDIT.filter = b.dataset.au; render(); });

  wireExport('activity', 'Activity log', () => [{
    name: 'Activity',
    columns: [
      { header: 'When', key: 'at', type: 'date' },
      { header: 'Who', key: 'actor_name' }, { header: 'Role', key: 'role' },
      { header: 'Section', key: 'entity' }, { header: 'Action', key: 'action' },
      { header: 'What changed', key: 'summary' }, { header: 'Record', key: 'row_id' }
    ],
    rows: AUDIT.rows.map(r => Object.assign({}, r,
      { role: ROLE_LABEL[r.actor_role] || r.actor_role || '' }))
  }], 'Append-only record of every sensitive change. Cannot be edited or deleted by anyone.');
  const r = $('#auRefresh');
  if (r) r.onclick = () => { AUDIT.loaded = false; render(); loadAudit(true); };
  loadAudit();
}

/* ---------------- products ---------------- */
let pFilter = { q: '', tier: '', state: '', cat: '' };

const catOf = p => p.category || 'bats';
const catName = id => (DB.categories.find(c => c.id === id) || {}).name || id;

function viewProducts() {
  const rows = DB.products.filter(p => {
    if (pFilter.cat && catOf(p) !== pFilter.cat) return false;
    if (pFilter.tier && p.tier !== pFilter.tier) return false;
    if (pFilter.state === 'live' && !p.active) return false;
    if (pFilter.state === 'off' && p.active) return false;
    if (pFilter.state === 'noprice' && p.price) return false;
    if (pFilter.state === 'nostock' && stockOf(p.id) > 0) return false;
    if (pFilter.q && !(p.name + ' ' + p.id).toLowerCase().includes(pFilter.q.toLowerCase())) return false;
    return true;
  });
  const count = id => DB.products.filter(p => catOf(p) === id).length;

  return `
    <div class="head">
      <h2>Products</h2>
      <span class="muted">${rows.length} of ${DB.products.length}</span>
      <span class="sp">
        ${exportBar('products')}
        <button class="btn ghost sm" id="catManage">Categories…</button>
        <button class="btn ghost sm" id="psManage">Play styles…</button>
        <button class="btn primary sm" id="pNew">+ New product</button>
      </span>
    </div>
    <div class="cat-row">
      <button class="cat-chip${pFilter.cat === '' ? ' on' : ''}" data-cat="">
        All <i>${DB.products.length}</i></button>
      ${DB.categories.map(c => `
        <button class="cat-chip${pFilter.cat === c.id ? ' on' : ''}" data-cat="${esc(c.id)}">
          ${esc(c.name)} <i>${count(c.id)}</i></button>`).join('')}
    </div>
    ${DB.catSynced ? '' : `<p class="muted" style="margin-bottom:14px">Categories are not in the
      database yet — run <code>sql/007-categories.sql</code> once in the Supabase SQL editor
      to create and manage them.</p>`}
    <div class="filters">
      <input id="pq" placeholder="Search name or id" value="${esc(pFilter.q)}">
      <select id="ptier">
        <option value="">All tiers</option>
        ${['entry', 'mid', 'premium'].map(t => `<option ${pFilter.tier === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <select id="pstate">
        <option value="">Everything</option>
        <option value="live"    ${pFilter.state === 'live' ? 'selected' : ''}>Live only</option>
        <option value="off"     ${pFilter.state === 'off' ? 'selected' : ''}>Switched off</option>
        <option value="noprice" ${pFilter.state === 'noprice' ? 'selected' : ''}>Missing a price</option>
        <option value="nostock" ${pFilter.state === 'nostock' ? 'selected' : ''}>Out of stock</option>
      </select>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th>Product</th><th>Category</th><th>Tier</th><th class="num">Price</th><th class="num">MRP</th>
        <th class="num">${multiBranch() ? (BRANCH ? esc(branchName(BRANCH)) : 'Stock (all)') : 'Stock'}</th>
        <th>Live</th><th></th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(p => `<tr>
        <td><div>${esc(p.name)}</div><div class="pid">${esc(p.id)}</div></td>
        <td class="muted">${esc(catName(catOf(p)))}</td>
        <td><span class="pill ${esc(p.tier)}">${esc(p.tier)}</span></td>
        <td class="num ${p.price ? '' : 'warn-cell'}">${p.price ? inr(p.price) : 'no price'}</td>
        <td class="num muted">${inr(p.mrp)}</td>
        <td class="num ${stockOf(p.id) <= 0 ? 'warn-cell' : ''}">${stockOf(p.id)}${
          multiBranch() && !BRANCH ? `<div class="br-split">${DB.branches.filter(b => b.active)
            .map(b => `${esc(b.code)} ${stockOf(p.id, b.id)}`).join(' · ')}</div>` : ''}</td>
        <td><span class="pill ${p.active ? 'on' : 'off'}">${p.active ? 'Live' : 'Off'}</span></td>
        <td style="text-align:right;white-space:nowrap">
          ${multiBranch() ? `<button class="btn ghost sm" data-move="${esc(p.id)}">Move</button>` : ''}
          <button class="btn ghost sm" data-edit="${esc(p.id)}">Edit</button></td>
      </tr>`).join('') : `<tr><td colspan="8"><div class="empty">Nothing matches those filters.</div></td></tr>`}
      </tbody>
    </table></div>`;
}

function wireProducts() {
  const re = () => { render(); };
  $('#pq').oninput = e => { pFilter.q = e.target.value; const p = e.target.selectionStart; re(); const n = $('#pq'); n.focus(); n.setSelectionRange(p, p); };
  $('#ptier').onchange = e => { pFilter.tier = e.target.value; re(); };
  $('#pstate').onchange = e => { pFilter.state = e.target.value; re(); };
  $$('.cat-chip').forEach(b => b.onclick = () => { pFilter.cat = b.dataset.cat; re(); });

  /* stock valuation, which is the reason to export products at all */
  wireExport('products', 'Stock report', () => {
    const rows = DB.products.map(p => {
      const st = stockOf(p.id);
      const r = {
        id: p.id, name: p.name, category: catName(catOf(p)), tier: p.tier,
        price: p.price, mrp: p.mrp, cost: p.cost, stock: st,
        value: (p.cost || 0) * st,
        margin: (p.price != null && p.cost != null) ? p.price - p.cost : null,
        live: p.active ? 'Live' : 'Off'
      };
      /* one column per branch when there is more than one shop */
      if (multiBranch() && !BRANCH)
        DB.branches.filter(b => b.active).forEach(b => r['br_' + b.id] = stockOf(p.id, b.id));
      return r;
    });
    const branchCols = (multiBranch() && !BRANCH)
      ? DB.branches.filter(b => b.active).map(b =>
          ({ header: b.name, key: 'br_' + b.id, type: 'number' }))
      : [];
    return [{
      name: 'Stock',
      summary: [
        { k: 'Products', v: rows.length },
        { k: 'Units in stock', v: rows.reduce((s, r) => s + r.stock, 0) },
        { k: 'Stock value', v: '₹' + rows.reduce((s, r) => s + r.value, 0).toLocaleString('en-IN') },
        { k: 'Out of stock', v: rows.filter(r => r.stock <= 0).length }
      ],
      columns: [
        { header: 'ID', key: 'id' }, { header: 'Product', key: 'name' },
        { header: 'Category', key: 'category' }, { header: 'Tier', key: 'tier' },
        { header: 'Price', key: 'price', type: 'money' },
        { header: 'MRP', key: 'mrp', type: 'money' },
        { header: 'Cost', key: 'cost', type: 'money' },
        { header: 'Margin', key: 'margin', type: 'money' },
        { header: BRANCH ? branchName(BRANCH) + ' stock' : 'Stock (total)', key: 'stock', type: 'number' }
      ].concat(branchCols, [
        { header: 'Stock value', key: 'value', type: 'money' },
        { header: 'Live', key: 'live' }
      ]),
      rows
    }];
  }, (BRANCH ? branchName(BRANCH) + ' only. ' : '') +
     'Stock value uses cost price. Products with no cost recorded count as zero.');
  $('#catManage').onclick = manageCategories;
  $('#psManage').onclick = managePlaystyles;
  $('#pNew').onclick = () => editProduct(null);
  $$('[data-edit]').forEach(b => b.onclick = () => editProduct(b.dataset.edit));
  $$('[data-move]').forEach(b => b.onclick = () => moveStock(b.dataset.move));
}

/* ---------------- insights (founder only) ----------------
   Four questions that change decisions, plus a health check that proves
   the numbers can be trusted. Everything here is computed by Postgres
   over every row, so it does not drift as the order book grows. */
let insTab = 'profit';

function viewInsights() {
  if (!AN.live) return `
    <div class="head"><h2>Insights</h2></div>
    <div class="empty">The analysis views are not in the database yet.<br>
      <span class="muted">Run <code>sql/010-analytics.sql</code> in the Supabase SQL editor,
      then reload.</span></div>`;

  const tabs = { profit: 'What makes money', dead: 'Stock not moving',
                 loyal: 'Repeat customers', health: 'Health check' };
  return `
    <div class="head"><h2>Insights</h2>
      <span class="muted">${BRANCH ? esc(branchName(BRANCH)) : 'all branches'}</span>
      <span class="sp">${exportBar('insights')}</span>
    </div>
    <div class="subtabs">${Object.entries(tabs).map(([k, v]) =>
      `<button data-ins="${k}" class="${insTab === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    ${insTab === 'profit' ? insProfit()
      : insTab === 'dead' ? insDead()
      : insTab === 'loyal' ? insLoyal() : insHealth()}`;
}

function insProfit() {
  const rows = AN.perf.filter(r => Number(r.units) > 0)
    .sort((a, b) => Number(b.profit) - Number(a.profit));
  if (!rows.length) return '<div class="empty">Nothing has sold yet.</div>';
  const noCost = rows.filter(r => r.cost == null).length;
  const best = Math.max(1, ...rows.map(r => Number(r.profit)));

  return `
    ${noCost ? `<div class="banner"><b>${noCost} of these have no cost price.</b>
      Their profit shows as the full selling price, which is wrong but optimistic —
      set a cost in <b>Products → Edit</b> to make this real.</div>` : ''}
    <p class="muted" style="margin-bottom:14px">Ranked by <b>profit earned</b>, not units sold.
      A ₹950 bat selling twenty times can earn less than a ₹2,999 bat selling five.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Product</th><th class="num">Units</th><th class="num">Revenue</th>
        <th class="num">Profit</th><th class="num">Per unit</th><th>Share of profit</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><div>${esc(r.name)}</div><div class="pid">${esc(r.tier || '')}</div></td>
        <td class="num">${r.units}</td>
        <td class="num muted">${money(r.revenue)}</td>
        <td class="num"><b class="${Number(r.profit) > 0 ? 'good-cell' : 'warn-cell'}">${money(r.profit)}</b></td>
        <td class="num muted">${r.cost == null ? '—' : money(Math.round(Number(r.profit) / Math.max(1, r.units)))}</td>
        <td><div class="prog sm" style="max-width:none">
          <i style="width:${Math.max(0, Number(r.profit) / best * 100)}%"></i></div></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function insDead() {
  const rows = anBranch(AN.deadStock);
  if (!rows.length) return `<div class="empty">Nothing is sitting still —
    every bat in stock has sold within the last 60 days.</div>`;
  const tied = rows.reduce((s, r) => s + Number(r.tied_up || 0), 0);
  return `
    <div class="cards tight">
      <div class="card warn"><b>${rows.length}</b><span>Lines not moving</span></div>
      <div class="card"><b>${money(tied)}</b><span>Cash tied up</span></div>
    </div>
    <p class="muted" style="margin-bottom:14px">In stock but not sold in 60 days.
      ${multiBranch() ? 'If one branch is selling it and the other is not, move it across.' : ''}</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Product</th>${multiBranch() ? '<th>Branch</th>' : ''}
        <th class="num">Stock</th><th class="num">Cash tied up</th>
        <th class="num">Days since a sale</th>${multiBranch() ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${esc(r.name)}</td>
        ${multiBranch() ? `<td class="muted">${esc(branchName(r.branch_id))}</td>` : ''}
        <td class="num">${r.stock}</td>
        <td class="num">${money(r.tied_up)}</td>
        <td class="num ${(r.days_since_sale || 999) > 120 ? 'warn-cell' : ''}">
          ${r.days_since_sale == null ? 'never sold' : r.days_since_sale}</td>
        ${multiBranch() ? `<td style="text-align:right">
          <button class="btn ghost sm" data-move="${esc(r.product_id)}">Move</button></td>` : ''}
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function insLoyal() {
  const rows = AN.loyalty;
  if (!rows.length) return '<div class="empty">No customers yet.</div>';
  const repeat = rows.filter(r => r.orders > 1);
  const pct = Math.round(repeat.length / rows.length * 100);
  const avgGap = repeat.length
    ? Math.round(repeat.reduce((s, r) => s + (r.avg_days_between || 0), 0) / repeat.length) : 0;

  return `
    <div class="cards tight">
      <div class="card"><b>${rows.length}</b><span>Customers</span></div>
      <div class="card ${pct >= 20 ? 'good' : ''}"><b>${repeat.length}</b><span>Bought again</span></div>
      <div class="card hot"><b>${pct}%</b><span>Repeat rate</span></div>
      <div class="card"><b>${avgGap || '—'}</b><span>Avg days between orders</span></div>
    </div>
    <p class="muted" style="margin-bottom:14px">A bat lasts a season, so a repeat purchase is
      a strong signal the product and service landed. Team orders count once per phone number.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th class="num">#</th><th>Customer</th><th class="num">Orders</th>
        <th class="num">Spend</th><th class="num">Days between</th><th>First</th><th>Last</th></tr></thead>
      <tbody>${rows.slice(0, 60).map((r, i) => `<tr>
        <td class="num"><b class="${i < 3 ? 'rank' : ''}">${i + 1}</b></td>
        <td><div>${esc(r.name || 'Unknown')}</div><div class="pid">${esc(r.phone)}</div></td>
        <td class="num"><b class="${r.orders > 1 ? 'good-cell' : ''}">${r.orders}</b></td>
        <td class="num">${money(r.spend)}</td>
        <td class="num muted">${r.avg_days_between ?? '—'}</td>
        <td class="muted">${when(r.first_order)}</td>
        <td class="muted">${when(r.last_order)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

let HEALTH = { rows: null, loading: false };
function insHealth() {
  if (HEALTH.rows === null) return '<div class="empty">Running the check…</div>';
  if (!HEALTH.rows.length) return `<div class="empty">
    <b>Everything checks out.</b><br>
    <span class="muted">Stock totals agree with the branches, every order has a branch,
    every product has a cost.</span></div>`;

  const icon = { error: '✕', warn: '!', info: 'i' };
  return `
    <p class="muted" style="margin-bottom:14px">Read straight from the raw tables, not from
      what this screen has loaded. Anything here can quietly make a number wrong.</p>
    ${HEALTH.rows.map(r => `
      <div class="job ${r.severity === 'error' ? 'hot' : r.severity === 'warn' ? 'warn' : ''}">
        <b>${r.severity === 'info' ? r.count : icon[r.severity] || '?'}</b>
        <span><i>${esc(r.area)} — ${esc(r.detail)}</i>
          <em>${r.severity === 'error' ? 'Needs fixing — figures may be wrong'
             : r.severity === 'warn' ? 'Worth tidying — figures are optimistic'
             : 'For information'}</em></span>
        <u>${r.severity === 'info' ? '' : r.count}</u>
      </div>`).join('')}`;
}

function wireInsights() {
  $$('[data-ins]').forEach(b => b.onclick = () => { insTab = b.dataset.ins; render(); });
  $$('[data-move]').forEach(b => b.onclick = () => moveStock(b.dataset.move));

  if (insTab === 'health' && HEALTH.rows === null && !HEALTH.loading) {
    HEALTH.loading = true;
    supaRpc('data_health').then(rows => {
      HEALTH.rows = Array.isArray(rows) ? rows : [];
      HEALTH.loading = false;
      if (TAB === 'insights' && insTab === 'health') render();
    }).catch(() => { HEALTH.rows = []; HEALTH.loading = false; });
  }

  wireExport('insights', 'Business insights', () => [
    { name: 'Product profit',
      columns: [{ header: 'Product', key: 'name' }, { header: 'Tier', key: 'tier' },
        { header: 'Units', key: 'units', type: 'number' },
        { header: 'Revenue', key: 'revenue', type: 'money' },
        { header: 'Profit', key: 'profit', type: 'money' },
        { header: 'Last sold', key: 'last_sold', type: 'date' }],
      rows: AN.perf.filter(r => Number(r.units) > 0) },
    { name: 'Stock not moving',
      columns: [{ header: 'Product', key: 'name' }, { header: 'Branch', key: 'branch' },
        { header: 'Stock', key: 'stock', type: 'number' },
        { header: 'Cash tied up', key: 'tied_up', type: 'money' },
        { header: 'Days since sale', key: 'days_since_sale', type: 'number' }],
      rows: anBranch(AN.deadStock).map(r => Object.assign({}, r, { branch: branchName(r.branch_id) })) },
    { name: 'Repeat customers',
      columns: [{ header: 'Customer', key: 'name' }, { header: 'Phone', key: 'phone' },
        { header: 'Orders', key: 'orders', type: 'number' },
        { header: 'Spend', key: 'spend', type: 'money' },
        { header: 'Days between', key: 'avg_days_between', type: 'number' },
        { header: 'First order', key: 'first_order', type: 'date' },
        { header: 'Last order', key: 'last_order', type: 'date' }],
      rows: AN.loyalty }
  ], 'Computed across every order in the database.');
}

/* ---------------- branches screen (founder only) ---------------- */
function viewBranches() {
  if (!DB.brSynced) return `
    <div class="head"><h2>Branches</h2></div>
    <div class="empty">The branches table is not in the database yet.<br>
      <span class="muted">Run <code>sql/009-branches.sql</code> in the Supabase SQL editor,
      then reload.</span></div>`;

  const stat = b => {
    const orders = DB.orders.filter(o => o.status !== 'cancelled'
      && (o.branch_id || defaultBranch()) === b.id);
    return {
      orders: orders.length,
      revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
      stock: DB.stock.filter(s => s.branch_id === b.id).reduce((t, s) => t + (s.stock || 0), 0),
      staff: OPS.staff.filter(s => s.active && s.branch_id === b.id).length
    };
  };

  return `
    <div class="head"><h2>Branches</h2>
      <span class="muted">${DB.branches.length} on record</span>
      <span class="sp"><button class="btn primary" id="brNew">+ Add branch</button></span>
    </div>
    <p class="muted" style="margin-bottom:16px">Each branch holds its own stock and its own
      bill series. Staff pinned to a branch see only that branch; founders see all of them.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Branch</th><th>Code</th><th>Address</th><th class="num">Orders</th>
        <th class="num">Revenue</th><th class="num">Stock</th><th class="num">Team</th>
        <th>Status</th><th></th></tr></thead>
      <tbody>${DB.branches.map(b => { const s = stat(b); return `<tr>
        <td><div><b>${esc(b.name)}</b>${b.is_default ? ' <span class="pill low">Main</span>' : ''}</div>
            <div class="pid">${esc(b.id)}</div></td>
        <td><span class="pill premium">${esc(b.code)}</span></td>
        <td class="muted">${esc(b.address || '—')}<div class="pid">${esc(b.phone || '')}</div></td>
        <td class="num">${s.orders}</td>
        <td class="num">${money(s.revenue)}</td>
        <td class="num">${s.stock}</td>
        <td class="num">${s.staff}</td>
        <td><span class="pill ${b.active ? 'on' : 'off'}">${b.active ? 'Open' : 'Closed'}</span></td>
        <td style="text-align:right"><button class="btn ghost sm" data-bedit="${esc(b.id)}">Edit</button></td>
      </tr>`; }).join('')}</tbody>
    </table></div>

    ${DB.branches.length > 1 ? `<div class="panel" style="margin-top:18px">
      <h3>Recent stock moves</h3>
      <div id="stMoves" class="muted">Loading…</div></div>` : ''}`;
}

function wireBranches() {
  const nb = $('#brNew'); if (nb) nb.onclick = () => branchModal(null);
  $$('[data-bedit]').forEach(b => b.onclick = () =>
    branchModal(DB.branches.find(x => x.id === b.dataset.bedit)));

  const box = $('#stMoves');
  if (box) supa('stock_transfers?select=*&order=at.desc&limit=25').then(rows => {
    if (!rows || !rows.length) { box.textContent = 'No stock has been moved between branches yet.'; return; }
    box.innerHTML = `<div class="tbl-wrap"><table>
      <thead><tr><th>When</th><th>Product</th><th class="num">Qty</th>
        <th>From</th><th>To</th><th>By</th><th>Note</th></tr></thead>
      <tbody>${rows.map(t => `<tr>
        <td class="muted">${when(t.at)}</td>
        <td>${esc((DB.products.find(p => p.id === t.product_id) || {}).name || t.product_id)}</td>
        <td class="num"><b>${t.qty}</b></td>
        <td>${esc(branchName(t.from_branch))}</td>
        <td>${esc(branchName(t.to_branch))}</td>
        <td class="muted">${esc(t.by_name || '')}</td>
        <td class="muted">${esc(t.note || '')}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }).catch(() => box.textContent = 'Could not read the transfer log.');
}

function branchModal(b) {
  const isNew = !b;
  openModal(isNew ? 'Add branch' : 'Edit — ' + esc(b.name), `
    <div class="f">
      <div class="grid2">
        <div class="row"><label>Branch name</label>
          <input id="br_name" value="${esc(b ? b.name : '')}" placeholder="e.g. Coimbatore"></div>
        <div class="row"><label>Code</label>
          <input id="br_code" value="${esc(b ? b.code : '')}" maxlength="2" placeholder="B">
          <div class="hint">One or two letters. Appears in this branch's bill numbers,
            which is what keeps them unique across the business.</div></div>
        <div class="row"><label>Phone</label><input id="br_phone" value="${esc(b ? b.phone || '' : '')}"></div>
        <div class="row"><label>Sort order</label>
          <input id="br_sort" type="number" value="${b ? b.sort : DB.branches.length}"></div>
      </div>
      <div class="row"><label>Address</label><input id="br_addr" value="${esc(b ? b.address || '' : '')}"
        placeholder="Printed on this branch's bills"></div>
      <div class="row"><label class="check"><input type="checkbox" id="br_active"
        ${!b || b.active ? 'checked' : ''}> Open for business</label>
        <div class="hint">Closing a branch hides it from the switcher. Its stock,
          bills and history stay exactly where they are.</div></div>
    </div>`, async () => {
    const name = $('#br_name').value.trim();
    const code = $('#br_code').value.trim().toUpperCase();
    if (!name) { toast('Name is required', true); return false; }
    if (!code) { toast('A code is required — it goes into the bill numbers', true); return false; }
    if (DB.branches.some(x => x.code.toUpperCase() === code && (!b || x.id !== b.id))) {
      toast('That code is already used by another branch', true); return false;
    }
    const row = { name, code, phone: $('#br_phone').value.trim(),
      address: $('#br_addr').value.trim(), sort: Number($('#br_sort').value || 0),
      active: $('#br_active').checked };
    try {
      if (isNew) {
        row.id = slugify(name);
        if (DB.branches.some(x => x.id === row.id)) row.id += '-' + Date.now().toString(36).slice(-3);
        row.is_default = !DB.branches.length;
        await insertRow('branches', row);
        DB.branches.push(row);
        toast('Branch added — its stock starts at zero');
      } else {
        await saveRow('branches', Object.assign({ id: b.id }, row));
        Object.assign(b, row);
        toast('Saved');
      }
      await loadAll();          /* stock rows for the new branch arrive from the trigger */
      render();
    } catch (e) { toast(writeError(e), true); return false; }
  });
}

/* ---------- moving stock between branches ----------
   The move happens inside one database function, so a transfer can never
   leave one branch short without the other gaining. The browser only asks
   for it; Postgres decides whether it is allowed and whether the stock is
   actually there. */
function moveStock(productId) {
  const p = DB.products.find(x => x.id === productId);
  if (!p) return;
  const live = DB.branches.filter(b => b.active);
  const from = BRANCH || (ME && ME.branch_id) || defaultBranch();

  openModal(`Move stock — ${esc(p.name)}`, `
    <div class="f">
      <div class="grid2">
        <div class="row"><label>From</label><select id="mv_from">
          ${live.map(b => `<option value="${esc(b.id)}" ${b.id === from ? 'selected' : ''}>
            ${esc(b.name)} — ${stockOf(p.id, b.id)} in stock</option>`).join('')}</select></div>
        <div class="row"><label>To</label><select id="mv_to">
          ${live.map(b => `<option value="${esc(b.id)}" ${b.id !== from ? 'selected' : ''}>
            ${esc(b.name)} — ${stockOf(p.id, b.id)} in stock</option>`).join('')}</select></div>
        <div class="row"><label>Quantity</label><input id="mv_qty" type="number" min="1" value="1"></div>
        <div class="row"><label>Note</label><input id="mv_note" placeholder="Optional"></div>
      </div>
      <div class="hint">The transfer is recorded with your name and the time.
        It will be refused if the sending branch does not have that many.</div>
    </div>`, async () => {
    const fromB = $('#mv_from').value, toB = $('#mv_to').value;
    const qty = Number($('#mv_qty').value || 0);
    if (fromB === toB) { toast('Pick two different branches', true); return false; }
    if (qty < 1) { toast('Quantity must be at least 1', true); return false; }
    try {
      await supaRpc('transfer_stock', { p_product: productId, p_from: fromB,
        p_to: toB, p_qty: qty, p_note: $('#mv_note').value.trim() || null });
      const bump = (b, d) => {
        const row = DB.stock.find(s => s.product_id === productId && s.branch_id === b);
        if (row) row.stock += d;
      };
      bump(fromB, -qty); bump(toB, qty);
      toast(`Moved ${qty} to ${branchName(toB)}`);
      render();
    } catch (e) {
      toast((e.message || 'Transfer failed').replace(/^.*?:\s*/, ''), true);
      return false;
    }
  });
}

/* ============================================================
   PLAY STYLES — marketing bats by the player, not the timber

   A category says what a product IS and a product has one. A
   play style says who it is FOR, and a bat has several: the
   Toss Power X is an attacker's bat that happens to pick up
   light. So this is a separate axis with its own join table,
   not a second use of products.category.

   Two groups ship with it — "Best for" and "Weight feel" — and
   the owner can add styles to either.
   ============================================================ */

const stylesOf   = pid => DB.prodStyles.filter(r => r.product_id === pid).map(r => r.playstyle_id);
const styleById  = id => DB.playstyles.find(s => s.id === id);
const styleName  = id => (styleById(id) || {}).name || id;
const stylesIn   = gid => DB.playstyles.filter(s => s.group_id === gid)
                                       .sort((a, b) => a.sort - b.sort);
const batCount   = sid => DB.prodStyles.filter(r => r.playstyle_id === sid).length;
/* A bat nobody has confirmed still carries the suggester's rows. Showing
   that in the manager is the difference between "the owner agreed" and
   "nobody has looked yet". */
const autoCount  = sid => DB.prodStyles.filter(r => r.playstyle_id === sid && r.auto).length;

function managePlaystyles() {
  if (!DB.psSynced) {
    openModal('Play styles', `<div class="f"><div class="hint">The play-style tables are not
      in the database yet. Run <code>sql/017-playstyles.sql</code> once in the Supabase SQL
      editor, reload this page, and this screen goes live with every bat already
      suggested.</div></div>`);
    return;
  }

  const group = g => `
    <div class="ps-group">
      <h4>${esc(g.name)}</h4>
      <p class="hint">${esc(g.hint || '')}</p>
      ${stylesIn(g.id).map(s => {
        const n = batCount(s.id), a = autoCount(s.id);
        return `<div class="att-row${s.active ? '' : ' off'}">
          <span style="flex:1">
            <b>${esc(s.emoji || '')} ${esc(s.name)}</b>
            <span class="pid">${esc(s.id)}</span>
            ${s.tagline ? `<br><span class="muted">${esc(s.tagline)}</span>` : ''}
          </span>
          <span class="muted" style="flex:none">${n} bat${n === 1 ? '' : 's'}${
            a ? ` · <span title="Suggested, not yet confirmed by you">${a} auto</span>` : ''}</span>
          <button class="btn ghost sm" data-psedit="${esc(s.id)}">Edit</button>
          <button class="btn danger sm" data-psdel="${esc(s.id)}"
            ${n ? 'disabled title="Remove it from every bat first"' : ''}>Delete</button>
        </div>`;
      }).join('') || '<p class="muted">Nothing in this group yet.</p>'}
      <div class="row" style="margin-top:10px">
        <input class="ps-new" data-psadd="${esc(g.id)}" placeholder="Add a style to ${esc(g.name)} — e.g. Finisher">
      </div>
    </div>`;

  openModal('Play styles', `
    <div class="f">
      <p class="hint">These are the chips a customer filters by on the shop, and the
        landing pages search engines see. A bat can carry several.</p>
      ${DB.psGroups.sort((a, b) => a.sort - b.sort).map(group).join('')}
      <div class="row" style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
        <button type="button" class="btn ghost sm" id="psAuto">Suggest tags for every bat</button>
        <div class="hint">Reads each bat's profile, edge and weight and fills in what it can.
          It never changes a bat you have edited yourself — those stay exactly as you set them.</div>
        <span class="up-stat" id="psAutoStat"></span>
      </div>
    </div>`, async () => {
    /* Save = whatever was typed into the "add" boxes. Empty ones are ignored,
       so closing without typing is not an error. */
    const added = [];
    for (const inp of $$('.ps-new')) {
      const name = inp.value.trim();
      if (!name) continue;
      const gid = inp.dataset.psadd, id = slugify(name);
      if (!id) { toast('That name needs letters or numbers', true); return false; }
      if (DB.playstyles.some(s => s.id === id)) { toast(`"${name}" already exists`, true); return false; }
      added.push({ id, group_id: gid, name,
                   sort: stylesIn(gid).length, active: true });
    }
    if (!added.length) return;
    try {
      for (const row of added) { await insertRow('playstyles', row); DB.playstyles.push(row); }
      toast(added.length === 1 ? 'Style added' : added.length + ' styles added');
      render();
    } catch (e) { toast(writeError(e), true); return false; }
  });

  /* The modal body is built before it is in the DOM, so wire after a tick —
     the same pattern manageCategories() uses for its delete buttons. */
  setTimeout(() => {
    $$('[data-psedit]').forEach(b => b.onclick = () => editPlaystyle(b.dataset.psedit));

    $$('[data-psdel]').forEach(b => b.onclick = async () => {
      const id = b.dataset.psdel;
      if (!confirm(`Delete the style "${styleName(id)}"?`)) return;
      try {
        await deleteRow('playstyles', 'id', id);
        DB.playstyles = DB.playstyles.filter(s => s.id !== id);
        toast('Style deleted');
        const m = document.querySelector('.modal'); if (m) m.remove();
        render();
      } catch (e) { toast(writeError(e), true); }
    });

    const auto = $('#psAuto');
    if (auto) auto.onclick = async () => {
      const stat = $('#psAutoStat');
      auto.disabled = true; stat.textContent = 'Reading the catalogue…';
      try {
        const n = await supaRpc('suggest_playstyles');
        DB.prodStyles = await supa('product_playstyles?select=*') || [];
        stat.textContent = `Done — ${n} suggestions across the catalogue.`;
        toast('Tags suggested');
        const m = document.querySelector('.modal'); if (m) m.remove();
        managePlaystyles();
      } catch (e) {
        stat.textContent = '';
        toast(writeError(e), true);
      } finally { auto.disabled = false; }
    };
  }, 20);
}

/**
 * Write the ticked chips back for one bat.
 *
 * Everything this writes is auto = false, and that is the whole point: the
 * moment a person has looked at a bat and decided, the suggester must stop
 * having an opinion about it. Re-running "Suggest tags" only clears rows
 * still marked auto, so a bat edited here is never quietly re-tagged.
 *
 * Replace-then-insert rather than a diff. Seven rows per bat is not worth
 * reconciling, and a delete followed by an insert cannot leave a half-applied
 * state the way three separate patches could.
 */
async function savePlaystyles(pid) {
  const want = $$('.f_ps').filter(c => c.checked).map(c => c.value);
  await deleteRow('product_playstyles', 'product_id', pid);
  if (want.length) {
    await insertRow('product_playstyles',
      want.map(sid => ({ product_id: pid, playstyle_id: sid, auto: false })));
  }
  DB.prodStyles = DB.prodStyles.filter(r => r.product_id !== pid)
    .concat(want.map(sid => ({ product_id: pid, playstyle_id: sid, auto: false })));
}

/* Rename, re-word, reorder, retire. The id never changes — it is the URL of
   the landing page and the value sitting in customers' bookmarked filters. */
function editPlaystyle(id) {
  const s = styleById(id);
  if (!s) return;
  openModal(`Edit — ${esc(s.name)}`, `
    <div class="f">
      <div class="grid2">
        <div class="row"><label>Name</label><input id="ps_name" value="${esc(s.name)}"></div>
        <div class="row"><label>Emoji</label><input id="ps_emoji" value="${esc(s.emoji || '')}" maxlength="4">
          <div class="hint">Shown on this screen only, to make the list quicker to scan.
            The shop draws its own line icons.</div></div>
      </div>
      <div class="row"><label>Tagline</label><input id="ps_tag" value="${esc(s.tagline || '')}"
        placeholder="Built to clear the rope">
        <div class="hint">One line. It sits under the heading on the shop and on the
          landing page for this style.</div></div>
      <div class="row"><label>Sort order</label><input id="ps_sort" type="number" value="${s.sort ?? 0}"></div>
      <div class="row"><label class="check"><input type="checkbox" id="ps_active"
        ${s.active ? 'checked' : ''}> Show it on the storefront</label>
        <div class="hint">Turning this off hides the chip and the landing page but keeps
          every bat you have assigned to it.</div></div>
      <div class="row"><label>Web address</label>
        <div class="hint"><code>${esc(s.id)}</code> — fixed, because links and search
          results already point at it. Renaming above changes only what people read.</div></div>
    </div>`, async () => {
    const row = {
      id: s.id,
      name: $('#ps_name').value.trim(),
      emoji: $('#ps_emoji').value.trim() || null,
      tagline: $('#ps_tag').value.trim() || null,
      sort: Number($('#ps_sort').value || 0),
      active: $('#ps_active').checked
    };
    if (!row.name) { toast('Name cannot be empty', true); return false; }
    try {
      await saveRow('playstyles', row, 'id');
      Object.assign(s, row);
      toast('Saved');
      const m = document.querySelector('.modal'); if (m) m.remove();
      managePlaystyles();
    } catch (e) { toast(writeError(e), true); return false; }
  });
}

/* ---------- category manager ----------
   Create freely; delete only when empty. The database enforces the same
   rule with a restrict foreign key, so even a raced delete cannot orphan
   products. */
function manageCategories() {
  const rows = DB.categories.map(c => {
    const n = DB.products.filter(p => catOf(p) === c.id).length;
    return `<div class="att-row">
      <span><b>${esc(c.name)}</b> <span class="pid">${esc(c.id)}</span></span>
      <span class="muted" style="flex:none">${n} product${n === 1 ? '' : 's'}</span>
      <button class="btn danger sm" data-delcat="${esc(c.id)}"
        ${n ? 'disabled title="Move or delete its products first"' : ''}>Delete</button>
    </div>`;
  }).join('');

  openModal('Categories', `
    <div class="f">
      ${DB.catSynced ? '' : `<div class="hint" style="margin-bottom:12px">The categories table
        is not in the database yet. Run <code>sql/007-categories.sql</code> once in the
        Supabase SQL editor, reload, and this screen goes live.</div>`}
      ${rows}
      <div class="row" style="margin-top:16px"><label>New category name</label>
        <input id="catName" placeholder="e.g. Rare Ball Collection">
        <div class="hint">Appears on the storefront shop page as soon as it has live products.
          A category can only be deleted while it is empty.</div></div>
    </div>`, async () => {
    const name = $('#catName').value.trim();
    if (!name) return;                       /* nothing typed — just close */
    const id = slugify(name);
    if (!id) { toast('The name needs letters or numbers', true); return false; }
    if (DB.categories.some(c => c.id === id)) { toast('That category already exists', true); return false; }
    try {
      const row = { id, name, sort: DB.categories.length };
      await insertRow('categories', row);
      DB.categories.push(row);
      toast('Category added');
      render();
    } catch (e) { toast(writeError(e), true); return false; }
  });

  setTimeout(() => $$('[data-delcat]').forEach(b => b.onclick = async () => {
    const id = b.dataset.delcat;
    if (!confirm(`Delete the category "${catName(id)}"?`)) return;
    try {
      await deleteRow('categories', 'id', id);
      DB.categories = DB.categories.filter(c => c.id !== id);
      if (pFilter.cat === id) pFilter.cat = '';
      toast('Category deleted');
      const m = document.querySelector('.modal'); if (m) m.remove();
      render();
    } catch (e) { toast(writeError(e), true); }
  }), 20);
}

function editProduct(id) {
  const isNew = !id;
  const p = isNew
    ? { id: '', name: '', price: null, mrp: null, cost: null, stock: 0, tier: 'mid',
        sort: (DB.products.length + 1) * 10, active: false, images: [], data: {},
        category: pFilter.cat || 'bats' }
    : DB.products.find(x => x.id === id);
  if (!p) return;
  openModal(isNew ? 'New product' : `Edit — ${esc(p.name)}`, `
    <div class="f">
      <div class="row"><label>Name</label><input id="f_name" value="${esc(p.name)}"></div>
      <div class="row"><label>Category</label><select id="f_cat">
        ${DB.categories.map(c => `<option value="${esc(c.id)}"
          ${catOf(p) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
        <div class="hint">Products outside Bats need at least one photo before they can go live —
          there is no generated artwork for them.</div></div>
      <div class="grid2">
        <div class="row"><label>Price (₹)</label><input id="f_price" type="number" min="0" value="${p.price ?? ''}">
          <div class="hint">Leave empty for "price on request".</div></div>
        <div class="row"><label>MRP (₹)</label><input id="f_mrp" type="number" min="0" value="${p.mrp ?? ''}"></div>
        <div class="row"><label>Cost to make (₹)</label><input id="f_cost" type="number" min="0" value="${p.cost ?? ''}">
          <div class="hint">Wood, labour, finishing. Needed for real profit on the Finance page.</div></div>
        <div class="row"><label>Stock${multiBranch()
            ? ' — ' + esc(branchName(BRANCH || (ME && ME.branch_id) || defaultBranch())) : ''}</label>
          <input id="f_stock" type="number" min="0" value="${
            multiBranch() ? stockOf(p.id, BRANCH || (ME && ME.branch_id) || defaultBranch()) : (p.stock ?? 0)}">
          ${multiBranch() ? `<div class="hint">Stock is held per branch. Use <b>Move</b> on the
            product list to shift stock between branches.</div>` : ''}</div>
        <div class="row"><label>Tier</label><select id="f_tier">
          ${['entry', 'mid', 'premium'].map(t => `<option ${p.tier === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div class="row"><label>Sort order</label><input id="f_sort" type="number" value="${p.sort ?? 0}"></div>
      </div>
      <div class="row"><label class="check"><input type="checkbox" id="f_active" ${p.active ? 'checked' : ''}> Live on the storefront</label></div>
      <div class="row"><label>Photos</label>
        <div class="up" id="upZone">
          <input type="file" id="upInput" accept="image/*" multiple hidden>
          <button type="button" class="btn ghost sm" id="upPick">Choose photos</button>
          <span class="up-hint">or drop them here · JPG or PNG · face, back, edge, toe</span>
          <span class="up-stat" id="upStat"></span>
        </div>
        <!-- Photos uploaded before the background knockout existed have no
             cut-out companion, so the shop falls back to the studio original
             and shows a white block on the dark sections. This re-processes
             them in place; it only ever adds the "-cut" file and never
             touches or replaces the photo itself, so it is safe to re-run. -->
        <div class="up-fix">
          <button type="button" class="btn ghost sm" id="upRecut">Remove photo backgrounds</button>
          <span class="up-hint">For photos uploaded earlier. New uploads do this automatically.</span>
          <span class="up-stat" id="upRecutStat"></span>
        </div>
        <div class="up-grid" id="upGrid"></div>
        <textarea id="f_images" class="up-urls">${esc((p.images || []).join('\n'))}</textarea>
        <div class="hint">The first photo is the one shown on the shop and product page.
          Leave empty to keep the generated bat art.</div></div>
      ${DB.psSynced ? `<div class="row"><label>Play styles</label>
        ${DB.psGroups.sort((a, b) => a.sort - b.sort).map(g => {
          const live = stylesIn(g.id).filter(s => s.active);
          if (!live.length) return '';
          const mine = isNew ? [] : stylesOf(p.id);
          return `<div class="ps-pick">
            <span class="ps-pick-h">${esc(g.name)}</span>
            ${live.map(s => `<label class="ps-chip">
              <input type="checkbox" class="f_ps" value="${esc(s.id)}"
                ${mine.includes(s.id) ? 'checked' : ''}>
              ${esc(s.emoji || '')} ${esc(s.name)}</label>`).join('')}
          </div>`;
        }).join('')}
        <div class="hint">Who this bat is for. Drives the shop's "Best for" filter and the
          landing pages. ${isNew ? 'Save the bat first and these apply straight away.'
            : (stylesOf(p.id).length && DB.prodStyles.some(r => r.product_id === p.id && r.auto)
               ? 'These were suggested from the specs — tick or untick anything and it becomes your decision.'
               : '')}</div></div>` : ''}
      <div class="row"><label>Spec data (JSON)</label>
        <textarea id="f_data" style="min-height:190px">${esc(JSON.stringify(p.data || {}, null, 2))}</textarea>
        <div class="hint">For bats: wood, profile, weight, features and so on. For other
          categories a short {"description":"…"} is enough. Must stay valid JSON.</div></div>
      ${isNew ? '' : `<div class="row" style="text-align:right">
        <button type="button" class="btn danger sm" id="pDel">Delete this product</button></div>`}
    </div>`, async () => {
    let data;
    try { data = JSON.parse($('#f_data').value || '{}'); }
    catch (e) { toast('Spec data is not valid JSON', true); return false; }

    const priceRaw = $('#f_price').value.trim();
    const row = {
      id: p.id,
      name: $('#f_name').value.trim(),
      category: $('#f_cat').value,
      price: priceRaw === '' ? null : Number(priceRaw),
      mrp: $('#f_mrp').value.trim() === '' ? null : Number($('#f_mrp').value),
      cost: $('#f_cost').value.trim() === '' ? null : Number($('#f_cost').value),
      stock: Number($('#f_stock').value || 0),
      tier: $('#f_tier').value,
      sort: Number($('#f_sort').value || 0),
      active: $('#f_active').checked,
      images: $('#f_images').value.split('\n').map(s => s.trim()).filter(Boolean),
      data
    };
    if (!row.name) { toast('Name cannot be empty', true); return false; }

    /* photos-required rule: a non-bat product has no generated art, so it
       may not go live with an empty gallery */
    if (row.category !== 'bats' && row.active && !row.images.length) {
      toast('Add at least one photo before switching this live — non-bat products have no generated artwork', true);
      return false;
    }

    if (isNew) {
      row.id = slugify(row.name);
      if (!row.id) { toast('The name needs letters or numbers', true); return false; }
      if (DB.products.some(x => x.id === row.id))
        row.id += '-' + Date.now().toString(36).slice(-4);
    }

    try {
      if (isNew) { await insertRow('products', row); DB.products.push(row); }
      else       { await saveRow('products', row); Object.assign(p, row); }
      if (DB.psSynced) await savePlaystyles(row.id);
      toast('Saved');
      render();
    } catch (e) {
      toast(writeError(e), true);
      return false;
    }
  });
  /* the modal is in the DOM by now, so the drop zone can be wired.
     A new product has no id yet — photos land under a provisional folder. */
  setTimeout(() => {
    wirePhotoUpload(isNew ? 'new-' + Date.now().toString(36) : p.id);
    const del = $('#pDel');
    if (del) del.onclick = async () => {
      if (!confirm(`Delete "${p.name}" permanently? Past orders keep their own copy of it.`)) return;
      try {
        await deleteRow('products', 'id', p.id);
        DB.products = DB.products.filter(x => x.id !== p.id);
        toast('Product deleted');
        const m = document.querySelector('.modal'); if (m) m.remove();
        render();
      } catch (e) { toast(writeError(e), true); }
    };
  }, 20);
}

/* ---------- product photo upload ----------
   Straight to Supabase Storage. Writes are admin-only by policy, reads are
   public, so the returned URL can go on the storefront as-is. */
/* ---------- image optimisation, in the browser ----------
   A photo off a phone is 3–8MB. Uploading it raw means the customer
   downloads it raw, which is the single worst thing you can do to page
   speed — and page speed is a ranking factor, so it would quietly undo
   the SEO work. Resizing here also means the upload itself is fast on
   mobile data, which matters when someone is photographing bats in the
   workshop.

   Three sizes are produced so the storefront can pick the right one:
     1600px  the product page
      800px  cards and the shop grid
      320px  thumbnails
   WebP where the browser can encode it (every current one can), JPEG as
   the fallback. Quality 0.82 is the point where a bat photo stops
   improving visibly but keeps shrinking. */
const IMG_SIZES = [
  { w: 1600, tag: 'lg', q: 0.82 },
  { w: 800,  tag: 'md', q: 0.82 },
  { w: 320,  tag: 'sm', q: 0.80 }
];

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image the browser can read.')); };
    img.src = url;
  });
}

/** Resize to a target width, keeping the aspect ratio. Never upscales. */
function resizeToBlob(img, targetW, quality) {
  const scale = Math.min(1, targetW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  /* white matte: product shots are on white, and a JPEG cannot hold
     transparency — without this a PNG with alpha turns black */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (blob) return resolve({ blob: blob, type: 'image/webp', ext: 'webp', w: w, h: h });
      /* Safari used to refuse WebP encoding — fall back rather than fail */
      canvas.toBlob(b2 => resolve({ blob: b2, type: 'image/jpeg', ext: 'jpg', w: w, h: h }),
        'image/jpeg', quality);
    }, 'image/webp', quality);
  });
}

/* ------------------------------------------------------------
   Knock the white studio sweep out and trim to the bat.

   Every product shot comes off a seamless white backdrop, which
   leaves roughly 85-90% of the frame empty. The shop puts these
   photos on dark bands, so the raw file reads as a white card with
   a small bat stranded in the middle. The "-cut" companion is what
   the storefront actually shows; the untouched original still backs
   the product gallery, where a studio white plate is honest.

   The fill walks inward from the border and only clears backdrop it
   can reach that way. Keying on colour alone would punch holes
   through the blade — Kashmir willow is very pale and the varnish
   throws near-white highlights. This is the same algorithm as
   seo/cutout-photos.js, kept in step with it deliberately so a
   photo added today matches the 63 processed by hand.
   ------------------------------------------------------------ */
const CUT_TOL = 30;

function cutoutToBlob(img, targetW, quality) {
  const scale = Math.min(1, targetW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const near = i => d[i * 4] >= 255 - CUT_TOL && d[i * 4 + 1] >= 255 - CUT_TOL
                 && d[i * 4 + 2] >= 255 - CUT_TOL;
  const push = i => { if (!seen[i] && near(i)) { seen[i] = 1; stack.push(i); } };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0)     push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0)     push(i - w);
    if (y < h - 1) push(i + w);
  }

  let cleared = 0;
  for (let i = 0; i < seen.length; i++) if (seen[i]) cleared++;
  /* An action or lifestyle frame has no edge-connected sweep. Cutting one
     out would be wrong, so leave it whole and let the shop show it as-is. */
  if (cleared / (w * h) < 0.15) return null;

  /* bounding box of what survives, so the bat fills its box */
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (seen[i]) { d[i * 4 + 3] = 0; continue; }
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  ctx.putImageData(id, 0, 0);

  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = chh;
  out.getContext('2d').drawImage(cv, x0, y0, cw, chh, 0, 0, cw, chh);

  return new Promise(resolve => {
    /* WebP only — a JPEG fallback cannot carry the alpha that is the
       whole point here, so if WebP is unavailable we simply skip the
       cut-out and the storefront falls back to the original. */
    out.toBlob(b => resolve(b ? { blob: b, type: 'image/webp', ext: 'webp', w: cw, h: chh } : null),
      'image/webp', quality);
  });
}

async function optimiseImage(file) {
  const img = await readImage(file);
  const out = [];
  for (const s of IMG_SIZES) {
    /* skip a size the original is already smaller than — no point
       writing a 1600px file from a 900px photo */
    if (img.naturalWidth < s.w && s.tag !== 'sm' && out.length) continue;
    out.push(Object.assign({ tag: s.tag }, await resizeToBlob(img, s.w, s.q)));

    let cut = null;
    try { cut = await cutoutToBlob(img, s.w, s.q); }
    catch (e) { console.warn('cut-out skipped for ' + s.tag + ':', e.message); }
    if (cut) out.push(Object.assign({ tag: s.tag + '-cut', cut: true }, cut));
  }
  return { versions: out, original: { w: img.naturalWidth, h: img.naturalHeight } };
}

async function putObject_(path, blob, contentType) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/products/${path}`, {
    method: 'POST',
    headers: Object.assign(supaHeaders(), {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable'
    }),
    body: blob
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(res.status === 403 || res.status === 401
      ? 'Storage refused the upload — your account is not an admin.'
      : (t || res.statusText).slice(0, 120));
  }
  return `${SUPA_URL}/storage/v1/object/public/products/${path}`;
}

/**
 * Optimise, then upload every size. Returns the medium URL for the
 * gallery — the other sizes sit beside it under predictable names, so a
 * srcset can be built from the one URL without another database column.
 */
async function uploadPhoto(file, productId, onProgress) {
  const base = file.name.replace(/\.[^.]+$/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
  const stamp = Date.now();

  let opt;
  try {
    opt = await optimiseImage(file);
  } catch (e) {
    /* a file the canvas cannot read still gets uploaded rather than lost */
    console.warn('optimise failed, uploading original:', e.message);
    return uploadRaw_(file, productId);
  }

  const urls = {};
  let total = 0;
  for (const v of opt.versions) {
    const path = `${productId}/${stamp}-${base}-${v.tag}.${v.ext}`;
    urls[v.tag] = await putObject_(path, v.blob, v.type);
    total += v.blob.size;
    if (onProgress) onProgress(v.tag, v.blob.size);
  }

  const saved = Math.max(0, file.size - total);
  console.info(`${file.name}: ${Math.round(file.size / 1024)}KB → ` +
    `${Math.round(total / 1024)}KB across ${opt.versions.length} sizes ` +
    `(${Math.round(saved / file.size * 100)}% smaller)`);

  /* the medium is the one the shop shows; large exists for the product page */
  return urls.md || urls.lg || urls.sm;
}

async function uploadRaw_(file, productId) {
  const clean = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
  const path = `${productId}/${Date.now()}-${clean}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/products/${path}`, {
    method: 'POST',
    headers: Object.assign(supaHeaders(), { 'Content-Type': file.type || 'image/jpeg' }),
    body: file
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(res.status === 403 || res.status === 401
      ? 'Storage refused the upload — your account is not an admin.'
      : (t || res.statusText).slice(0, 120));
  }
  return `${SUPA_URL}/storage/v1/object/public/products/${path}`;
}

function wirePhotoUpload(productId) {
  const zone = $('#upZone'), input = $('#upInput'), pick = $('#upPick'),
        stat = $('#upStat'), grid = $('#upGrid'), urls = $('#f_images');
  if (!zone) return;

  const paint = () => {
    const list = urls.value.split('\n').map(s => s.trim()).filter(Boolean);
    grid.innerHTML = list.map((u, i) => `
      <figure class="up-th">
        <img src="${esc(u)}" alt="">
        ${i === 0 ? '<b>Main</b>' : ''}
        <button type="button" data-rm="${i}" aria-label="Remove">&times;</button>
      </figure>`).join('');
    $$('[data-rm]', grid).forEach(b => b.onclick = () => {
      const l = urls.value.split('\n').map(s => s.trim()).filter(Boolean);
      l.splice(+b.dataset.rm, 1);
      urls.value = l.join('\n');
      paint();
    });
  };

  const send = async files => {
    const list = [...files].filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    let done = 0, saved = 0, original = 0;
    for (const f of list) {
      stat.textContent = `Optimising ${done + 1} of ${list.length}…`;
      try {
        let after = 0;
        const url = await uploadPhoto(f, productId, (tag, bytes) => {
          after += bytes;
          stat.textContent = `Uploading ${done + 1} of ${list.length} — ${tag}…`;
        });
        original += f.size;
        saved += Math.max(0, f.size - after);
        urls.value = (urls.value.trim() ? urls.value.trim() + '\n' : '') + url;
        paint();
        done++;
      } catch (e) { stat.textContent = e.message; return; }
    }
    /* say what the optimisation actually achieved, so the saving is
       visible rather than a silent background nicety */
    const pct = original ? Math.round(saved / original * 100) : 0;
    stat.textContent = `${done} photo${done === 1 ? '' : 's'} uploaded` +
      (pct > 0 ? ` · ${pct}% smaller, ${Math.round(saved / 1024)}KB saved` : '') +
      ' — save to keep them.';
  };

  /* ----------------------------------------------------------
     Backfill the cut-outs for photos already in storage.

     Purely additive: it reads each photo back, knocks the sweep
     out and writes a "-cut" companion beside it. The original is
     never overwritten and the saved image list is never touched,
     so a half-finished run leaves nothing broken — the storefront
     simply keeps falling back to the original for whatever has no
     cut yet. That is also why it is safe to press twice.

     Storage is read through a canvas, so the bucket has to answer
     with CORS. If it does not we say so plainly rather than
     leaving a spinner up: this is a maintenance tool, and a
     silent no-op would be worse than an error. */
  const recut = $('#upRecut'), recutStat = $('#upRecutStat');
  if (recut) recut.onclick = async () => {
    const list = urls.value.split('\n').map(s => s.trim()).filter(Boolean)
      .filter(u => !/-cut\.webp$/i.test(u));
    if (!list.length) { recutStat.textContent = 'No photos to process.'; return; }

    recut.disabled = true;
    let made = 0, already = 0, skipped = 0;
    for (let i = 0; i < list.length; i++) {
      recutStat.textContent = `Processing ${i + 1} of ${list.length}…`;
      const src = list[i];
      const dest = src.replace(/\.(webp|png|jpe?g)$/i, '-cut.webp');
      try {
        /* already done on an earlier run — leave it alone */
        if ((await fetch(dest, { method: 'HEAD' })).ok) { already++; continue; }

        const blob = await (await fetch(src, { mode: 'cors' })).blob();
        const img = await readImage(new File([blob], 'photo', { type: blob.type }));
        const cut = await cutoutToBlob(img, img.naturalWidth, 0.88);
        if (!cut) { skipped++; continue; }

        /* rebuild the storage path from the public URL we were given */
        const key = decodeURIComponent(
          dest.split('/storage/v1/object/public/products/')[1] || '');
        if (!key) { skipped++; continue; }
        await putObject_(key, cut.blob, cut.type);
        made++;
      } catch (e) {
        recutStat.textContent = /Failed to fetch|tainted|cross-origin/i.test(e.message)
          ? 'Storage would not hand the photo back for editing (CORS). ' +
            'Re-upload the photo instead — new uploads are processed automatically.'
          : e.message;
        recut.disabled = false;
        return;
      }
    }
    recut.disabled = false;
    recutStat.textContent =
      `${made} background${made === 1 ? '' : 's'} removed` +
      (already ? `, ${already} already done` : '') +
      (skipped ? `, ${skipped} left as-is (not a studio shot)` : '') +
      (made ? ' — reload the shop to see them.' : '.');
  };

  pick.onclick = () => input.click();
  input.onchange = () => send(input.files);
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault(); zone.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault(); zone.classList.remove('over');
  }));
  zone.addEventListener('drop', e => send(e.dataTransfer.files));
  paint();
}

/* RLS rejections are opaque by default — say what actually went wrong. */
function writeError(e) {
  const m = (e && e.message || '').toLowerCase();
  if (m.includes('row-level') || m.includes('policy') || m.includes('permission'))
    return 'The database refused the write — your account is not an admin. Ask a founder to set your role, or see sql/SETUP.md.';
  if (m.includes('jwt') || m.includes('token'))
    return 'Your session expired or was refused. Sign out and back in.';
  return e.message || 'Save failed';
}

/* ---------------- coupons ---------------- */
function viewCoupons() {
  return `
    <div class="head"><h2>Rewards</h2>
      <button class="btn primary sm" id="cNew">New code</button></div>
    <p class="muted" style="margin-bottom:16px">Discount codes — game rewards, loyalty codes,
      referrals, festival offers. These are never listed publicly: the storefront validates them
      through a database function, so a code only works for someone who was given it.
      Leave <b>Unlocks at</b> empty for a code that is not earned by playing.</p>
    ${DB.coupons.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Code</th><th>Type</th><th class="num">Discount</th><th class="num">Min spend</th>
        <th class="num">Unlocks at</th><th class="num">Used</th><th>Active</th><th></th></tr></thead>
      <tbody>${DB.coupons.map(c => `<tr>
        <td><b style="font-family:ui-monospace,monospace">${esc(c.code)}</b>
          ${c.referred_by ? `<div class="pid">via ${esc(c.referred_by)}</div>` : ''}</td>
        <td><span class="tag">${esc(COUPON_KIND[c.kind || 'game'] || c.kind || 'Game')}</span></td>
        <td class="num">${inr(c.discount)}</td>
        <td class="num">${inr(c.min_spend)}</td>
        <!-- "runs" only means something for a code earned by playing -->
        <td class="num">${c.unlock_runs == null ? '—' : c.unlock_runs + ' runs'}</td>
        <td class="num">${c.uses}</td>
        <td><span class="pill ${c.active ? 'on' : 'off'}">${c.active ? 'On' : 'Off'}</span></td>
        <td style="text-align:right"><button class="btn ghost sm" data-cedit="${esc(c.code)}">Edit</button></td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">No codes yet. Use <b>New code</b> to make one.</div>`}`;
}

/* What a code is for. `game` is first because it is what every existing
   row is, and the default in the database. */
const COUPON_KIND = {
  game:     'Game reward',
  loyalty:  'Loyalty',
  referral: 'Referral',
  offer:    'Offer'
};

function wireCoupons() {
  /* Creating a code was the one thing this screen could not do — it could
     edit the two seeded by the schema and nothing else, so a loyalty or
     referral code meant opening the SQL editor. Same modal as Edit, plus
     the code itself, which is the primary key and therefore the only
     field that cannot be changed afterwards. */
  const nb = $('#cNew');
  if (nb) nb.onclick = () => {
    openModal('New reward code', `
      <div class="f">
        <div class="grid2">
          <div class="row"><label>Code</label>
            <input id="c_code" placeholder="TOSS100" autocomplete="off"
                   style="font-family:ui-monospace,monospace;text-transform:uppercase">
            <div class="hint">Letters and numbers. This is what the customer types at
              checkout, and it cannot be changed later — delete and remake instead.</div></div>
          <div class="row"><label>Type</label>
            <select id="c_kind">
              ${Object.keys(COUPON_KIND).map(k =>
                `<option value="${k}"${k === 'referral' ? ' selected' : ''}>${COUPON_KIND[k]}</option>`).join('')}
            </select>
            <div class="hint">Only <b>Game</b> codes use the runs field.</div></div>
        </div>
        <div class="grid2">
          <div class="row"><label>Discount (₹)</label>
            <input id="c_off" type="number" min="1" value="100"></div>
          <div class="row"><label>Minimum spend (₹)</label>
            <input id="c_min" type="number" min="0" value="0"></div>
          <div class="row" id="c_runs_row"><label>Unlocks at (runs)</label>
            <input id="c_runs" type="number" min="0" placeholder="Leave empty">
            <div class="hint">Only for codes earned in Gully Cricket.</div></div>
          <div class="row" id="c_ref_row"><label>Referred by</label>
            <input id="c_ref" placeholder="Name or phone of who passed it on">
            <div class="hint">So you know who to thank when it gets used.</div></div>
        </div>
        <div class="row"><label>Label</label>
          <input id="c_label" placeholder="What this code is for"></div>
        <div class="row"><label class="check">
          <input type="checkbox" id="c_active" checked> Active</label></div>
      </div>`, async () => {
      const code = ($('#c_code').value || '').trim().toUpperCase();
      if (!/^[A-Z0-9._-]{3,24}$/.test(code)) {
        toast('Code must be 3–24 letters or numbers', true); return false;
      }
      if (DB.coupons.some(c => c.code.toUpperCase() === code)) {
        toast(`"${code}" already exists`, true); return false;
      }
      const off = Number($('#c_off').value || 0);
      if (off < 1) { toast('Discount must be at least ₹1', true); return false; }

      const kind = $('#c_kind').value || 'game';
      const row = {
        code: code,
        kind: kind,
        discount: off,
        min_spend: Number($('#c_min').value || 0),
        /* A runs threshold on anything but a game code would be a rule
           nobody can satisfy — a loyalty code is handed over, not earned
           by batting — so it is discarded rather than saved. */
        unlock_runs: (kind === 'game' && $('#c_runs').value !== '')
          ? Number($('#c_runs').value) : null,
        referred_by: kind === 'referral' ? ($('#c_ref').value.trim() || null) : null,
        label: $('#c_label').value.trim(),
        active: $('#c_active').checked
      };
      try {
        await insertRow('coupons', row);
        DB.coupons.push(Object.assign({ uses: 0 }, row));
        toast(`${code} created`); render();
      } catch (e) { toast(writeError(e), true); return false; }
    });

    /* Show only the field the chosen type actually uses. */
    const kindSel = $('#c_kind');
    const sync = () => {
      const k = kindSel.value;
      const runs = $('#c_runs_row'), ref = $('#c_ref_row');
      if (runs) runs.style.display = k === 'game' ? '' : 'none';
      if (ref)  ref.style.display  = k === 'referral' ? '' : 'none';
    };
    if (kindSel) { kindSel.onchange = sync; sync(); }
  };

  $$('[data-cedit]').forEach(b => b.onclick = () => {
    const c = DB.coupons.find(x => x.code === b.dataset.cedit);
    openModal(`Edit — ${esc(c.code)}`, `
      <div class="f"><div class="grid2">
        <div class="row"><label>Discount (₹)</label><input id="c_off" type="number" min="0" value="${c.discount}"></div>
        <div class="row"><label>Minimum spend (₹)</label><input id="c_min" type="number" min="0" value="${c.min_spend}"></div>
        <div class="row"><label>Unlocks at (runs)</label><input id="c_runs" type="number" min="0" value="${c.unlock_runs ?? ''}"></div>
        <div class="row"><label>Label</label><input id="c_label" value="${esc(c.label || '')}"></div>
      </div>
      <div class="row"><label class="check"><input type="checkbox" id="c_active" ${c.active ? 'checked' : ''}> Active</label></div>
      </div>`, async () => {
      const row = {
        code: c.code,
        discount: Number($('#c_off').value || 0),
        min_spend: Number($('#c_min').value || 0),
        unlock_runs: $('#c_runs').value === '' ? null : Number($('#c_runs').value),
        label: $('#c_label').value.trim(),
        active: $('#c_active').checked
      };
      try { await saveRow('coupons', row, 'code'); Object.assign(c, row); toast('Saved'); render(); }
      catch (e) { toast(writeError(e), true); return false; }
    });
  });
}

/* ---------------- leaderboard ---------------- */
function viewScores() {
  return `
    <div class="head"><h2>Leaderboard</h2><span class="muted">${DB.scores.length} innings</span></div>
    ${DB.scores.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th class="num">#</th><th>Name</th><th class="num">Score</th><th>When</th><th></th></tr></thead>
      <tbody>${DB.scores.map((s, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(s.name)}</td>
        <td class="num"><b>${s.runs}</b><span class="pid">/${s.wickets}</span></td>
        <td class="muted">${when(s.created_at)}</td>
        <td style="text-align:right"><button class="btn danger sm" data-del="${s.id}">Remove</button></td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">Nobody has played yet.</div>`}`;
}

function wireScores() {
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Remove this score from the leaderboard?')) return;
    try {
      await supa('scores?id=eq.' + b.dataset.del, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      DB.scores = DB.scores.filter(s => String(s.id) !== b.dataset.del);
      toast('Removed'); render();
    } catch (e) { toast(writeError(e), true); }
  });
}

/* ---------------- settings ---------------- */
const SETTING_FIELDS = [
  ['whatsapp',       'WhatsApp number', 'text',   'Country code, no plus. e.g. 919176995707'],
  ['instagram',      'Instagram handle', 'text',  'Without the @'],
  ['free_ship_over', 'Free shipping over (₹)', 'number', 'Orders at or above this ship free'],
  ['ship_fee',       'Shipping fee (₹)', 'number', 'Charged below the free-shipping threshold'],
  ['razorpay_key',   'Razorpay key id', 'text',   'Starts rzp_live_ or rzp_test_. Blank disables online payment.'],
  ['gstin',            'GSTIN', 'text', 'Leave blank if not registered — bills are then issued without any tax, which is the correct document.'],
  ['legal_name',       'Registered business name', 'text', 'Exactly as registered. Printed on every bill.'],
  ['business_address', 'Business address', 'text', 'Required on a tax invoice.'],
  ['business_state',   'Your state', 'text', 'Decides CGST/SGST versus IGST for each customer.'],
  ['gst_rate',         'GST rate (%)', 'number', 'Cricket bats are usually 12%. Confirm with your accountant.'],
  ['hsn_code',         'HSN code', 'text', 'Sports goods are commonly 9506.'],
  ['invoice_prefix',   'Invoice prefix', 'text', 'e.g. TOSS gives TOSS/26-27/0001.'],
  ['announcement',   'Announcement bar', 'text',  'The scrolling line at the top of the site']
];

function viewSettings() {
  return `
    <div class="head"><h2>Settings</h2></div>
    <div class="panel"><div class="f">
      ${SETTING_FIELDS.map(([k, label, type, hint]) => `
        <div class="row">
          <label>${label}</label>
          <input id="s_${k}" type="${type}" value="${esc(DB.settings[k] ?? '')}">
          <div class="hint">${hint}</div>
        </div>`).join('')}
      <button class="btn primary" id="saveSettings">Save settings</button>
    </div></div>

    <div class="panel">
      <h3>Account</h3>
      <p class="muted">Signed in as <b>${esc(USER && USER.email)}</b><br>
        Supabase user <code>${esc(USER && USER.id)}</code></p>
    </div>`;
}

function wireSettings() {
  $('#saveSettings').onclick = async () => {
    const btn = $('#saveSettings');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      for (const [k, , type] of SETTING_FIELDS) {
        const raw = $('#s_' + k).value;
        const value = type === 'number' ? Number(raw || 0) : raw;
        await supa('settings', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: { key: k, value }
        });
        DB.settings[k] = value;
      }
      toast('Settings saved');
    } catch (e) { toast(writeError(e), true); }
    finally { btn.disabled = false; btn.textContent = 'Save settings'; }
  };
}

/* ---------------- modal ---------------- */
function openModal(title, body, onSave) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-head"><h3>${title}</h3><button class="x" data-close>&times;</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" data-save>Save changes</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  $$('[data-close]', wrap).forEach(b => b.onclick = close);
  wrap.onclick = e => { if (e.target === wrap) close(); };
  const onKey = e => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', onKey); } };
  window.addEventListener('keydown', onKey);

  $('[data-save]', wrap).onclick = async () => {
    const btn = $('[data-save]', wrap);
    btn.disabled = true; btn.textContent = 'Saving…';
    const res = await onSave();
    btn.disabled = false; btn.textContent = 'Save changes';
    if (res !== false) close();
  };
}
