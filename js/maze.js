/* ============================================================
   MAZE ROOM — Toss Sports admin

   Auth is Firebase; data is Supabase. The Firebase ID token is
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
           categories: [{ id: 'bats', name: 'Bats', sort: 0 }], catSynced: false };
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

/* ---------------- auth ---------------- */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('#loginBtn'), err = $('#loginErr');
  btn.disabled = true; btn.textContent = 'Signing in…';
  err.classList.add('hide');
  try {
    await auth.signInWithEmailAndPassword($('#email').value.trim(), $('#password').value);
  } catch (ex) {
    err.textContent = friendlyAuthError(ex);
    err.classList.remove('hide');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
};

function friendlyAuthError(ex) {
  const c = ex && ex.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'That email and password combination is not recognised.';
  if (c.includes('too-many-requests'))
    return 'Too many attempts. Wait a minute and try again.';
  if (c.includes('operation-not-allowed'))
    return 'Email/password sign-in is not enabled yet in the Firebase console. See sql/SETUP.md step 2.';
  if (c.includes('network'))
    return 'Cannot reach Firebase. Check your connection.';
  return ex.message || 'Sign-in failed.';
}

$('#logout').onclick = () => auth.signOut();

auth.onAuthStateChanged(async user => {
  USER = user;
  if (!user) {
    setFirebaseToken(null);
    $('#gate').classList.remove('hide');
    $('#shell').classList.add('hide');
    return;
  }
  setFirebaseToken(await user.getIdToken());
  AUTH = await checkToken();
  /* bind this Firebase login to the staff record the owner added by email */
  if (AUTH === 'ok') { try { await supaRpc('claim_staff'); } catch (e) { console.warn('claim_staff', e.message); } }
  /* refresh the token before it expires so long sessions keep working */
  setInterval(async () => setFirebaseToken(await user.getIdToken(true)), 45 * 60 * 1000);

  $('#gate').classList.add('hide');
  $('#shell').classList.remove('hide');
  $('#who').textContent = user.email;
  await loadAll();
  render();
});

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
  const [products, orders, coupons, scores, settings, invoices, categories] = await Promise.all([
    get('products?select=*&order=sort.asc', []),
    get('orders?select=*&order=created_at.desc&limit=200', []),
    get('coupons?select=*&order=unlock_runs.asc', []),
    get('scores?select=*&order=runs.desc&limit=50', []),
    get('settings?select=*', []),
    get('invoices?select=*&order=issued_at.desc&limit=300', []),
    get('categories?select=*&order=sort.asc', null)   /* null = table missing */
  ]);
  DB.products = products || [];
  DB.orders   = orders   || [];
  DB.coupons  = coupons  || [];
  DB.scores   = scores   || [];
  DB.catSynced = Array.isArray(categories);
  DB.categories = DB.catSynced && categories.length
    ? categories : [{ id: 'bats', name: 'Bats', sort: 0 }];
  DB.settings = {};
  (settings || []).forEach(s => DB.settings[s.key] = s.value);
  BILL.invoices = invoices || []; BILL.loaded = true;

  await loadOps();
  buildNav();
  checkSetup();
}

/* Dock icons — 24×24 stroke, one per section. Monochrome so the dock
   reads as one object; the label lives in the tooltip. */
const DOCK_ICON = (() => {
  const s = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  return {
    dash:     s('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    sales:    s('<path d="M3 20h18"/><path d="M6 20v-6M11 20V9M16 20v-9M21 20V5"/>'),
    billing:  s('<path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22Z"/><path d="M9 7h6M9 11h6"/>'),
    finance:  s('<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>'),
    products: s('<path d="M10.5 3h3v7l2 2v7a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-7l2-2Z"/><path d="M10.5 6h3"/>'),
    team:     s('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.8 15.2c2.4.2 4.2 1.7 4.7 4.8"/>'),
    tasks:    s('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12.5 2.4 2.4 4.8-5.2"/>'),
    sops:     s('<path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2Z"/><path d="M5 20V4M9 6h6"/>'),
    boards:   s('<path d="M7 4h10v4a5 5 0 0 1-10 0Z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4m-4 4h8m-4-4v4"/>'),
    coupons:  s('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2.5 2.5 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2.5 2.5 0 0 0 0-4Z"/><path d="M13 7v2m0 6v2m0-6v2"/>'),
    scores:   s('<rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M7.5 10v4M5.5 12h4"/><circle cx="16" cy="11" r=".8" fill="currentColor"/><circle cx="18.5" cy="13" r=".8" fill="currentColor"/>'),
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

  const initials = (ME && (ME.name || ME.email || '?'))
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  $('#nav').innerHTML = `
    <button class="dk" id="dockBack" aria-label="Back" ${NAV_HIST.length ? '' : 'disabled'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/></svg>
      <span class="dk-tip">Back</span>
    </button>
    <span class="dk-div" aria-hidden="true"></span>` + tabs.map(t => `
    <button class="dk${TAB === t ? ' on' : ''}" data-tab="${t}" aria-label="${NAV_LABEL[t]}">
      ${DOCK_ICON[t] || DOCK_ICON.dash}
      <span class="dk-tip">${NAV_LABEL[t]}</span>
    </button>`).join('') + `
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
  if (ME) { chip.textContent = ME.role; chip.className = 'role-chip ' + ME.role; }
  else chip.classList.add('hide');
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
    msg = `<b>Supabase is rejecting your Firebase login.</b>
      Your email and password were correct — Firebase signed you in — but Supabase
      will not accept a Firebase token until you register Firebase as a third-party
      auth provider. Until then nothing here can load or save.
      <br><br><b>Fix it in one step:</b> Supabase Dashboard →
      <b>Authentication</b> → <b>Sign In / Providers</b> → <b>Third Party Auth</b> →
      <b>Add provider</b> → <b>Firebase</b>, and enter project ID
      <code>${esc(FIREBASE_CONFIG.projectId)}</code>. Then reload this page.
      <br><br><span style="opacity:.7">Showing public data only, read-only.
      Your Firebase UID is <code>${esc(USER && USER.uid)}</code> — you'll need it next.</span>`;
  } else if (!DB.products.length && lastLoadError) {
    msg = `Could not read the database — <code>${esc(lastLoadError.message)}</code>
           (HTTP ${esc(lastLoadError.status)} on <code>${esc(lastLoadError.q)}</code>).`;
  } else if (!DB.products.length) {
    msg = `No products found. Run <code>sql/schema.sql</code> in the Supabase SQL Editor
           to create the tables and seed your 29 bats.`;
  } else if (!ME) {
    msg = `You are signed in to Firebase, but you are not on the staff list — so the database
           is giving you nothing. Add yourself with this SQL, then reload:
           <br><br><code>insert into public.staff (uid, name, email, role)
           values ('${esc(USER && USER.uid)}', 'Your Name', '${esc(USER && USER.email)}', 'owner');</code>
           <br><br>If that runs but nothing changes, Firebase is not yet enabled as a
           <b>Third Party Auth</b> provider in Supabase (step 4 of <code>sql/SETUP.md</code>) —
           without it Supabase ignores your login entirely.`;
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

/* ---------------- render ---------------- */
function render() {
  const v = $('#view');
  if (!ME) { v.innerHTML = ''; return; }   /* banner explains what to do */

  const R = {
    dash:     [viewOpsDash,   wireDash],
    sales:    [viewSales,     wireSales],
    finance:  [viewFinance,   wireFinance],
    products: [viewProducts,  wireProducts],
    billing:  [viewBilling,   wireBilling],
    team:     [viewTeam,      wireTeam],
    tasks:    [viewTasks,     wireTasks],
    sops:     [viewSops,      wireSops],
    boards:   [viewBoards,    wireBoards],
    coupons:  [viewCoupons,   wireCoupons],
    scores:   [viewScores,    wireScores],
    settings: [viewSettings,  wireSettings]
  }[TAB];
  if (!R) { v.innerHTML = '<div class="empty">Nothing here.</div>'; return; }
  v.innerHTML = R[0]();
  if (R[1]) R[1]();
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
    if (pFilter.state === 'nostock' && p.stock > 0) return false;
    if (pFilter.q && !(p.name + ' ' + p.id).toLowerCase().includes(pFilter.q.toLowerCase())) return false;
    return true;
  });
  const count = id => DB.products.filter(p => catOf(p) === id).length;

  return `
    <div class="head">
      <h2>Products</h2>
      <span class="muted">${rows.length} of ${DB.products.length}</span>
      <span class="sp">
        <button class="btn ghost sm" id="catManage">Categories…</button>
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
        <th class="num">Stock</th><th>Live</th><th></th>
      </tr></thead>
      <tbody>${rows.length ? rows.map(p => `<tr>
        <td><div>${esc(p.name)}</div><div class="pid">${esc(p.id)}</div></td>
        <td class="muted">${esc(catName(catOf(p)))}</td>
        <td><span class="pill ${esc(p.tier)}">${esc(p.tier)}</span></td>
        <td class="num ${p.price ? '' : 'warn-cell'}">${p.price ? inr(p.price) : 'no price'}</td>
        <td class="num muted">${inr(p.mrp)}</td>
        <td class="num ${p.stock <= 0 ? 'warn-cell' : ''}">${p.stock}</td>
        <td><span class="pill ${p.active ? 'on' : 'off'}">${p.active ? 'Live' : 'Off'}</span></td>
        <td style="text-align:right"><button class="btn ghost sm" data-edit="${esc(p.id)}">Edit</button></td>
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
  $('#catManage').onclick = manageCategories;
  $('#pNew').onclick = () => editProduct(null);
  $$('[data-edit]').forEach(b => b.onclick = () => editProduct(b.dataset.edit));
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
        <div class="row"><label>Stock</label><input id="f_stock" type="number" min="0" value="${p.stock ?? 0}"></div>
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
        <div class="up-grid" id="upGrid"></div>
        <textarea id="f_images" class="up-urls">${esc((p.images || []).join('\n'))}</textarea>
        <div class="hint">The first photo is the one shown on the shop and product page.
          Leave empty to keep the generated bat art.</div></div>
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
async function uploadPhoto(file, productId) {
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
    let done = 0;
    for (const f of list) {
      stat.textContent = `Uploading ${done + 1} of ${list.length}…`;
      try {
        const url = await uploadPhoto(f, productId);
        urls.value = (urls.value.trim() ? urls.value.trim() + '\n' : '') + url;
        paint();
        done++;
      } catch (e) { stat.textContent = e.message; return; }
    }
    stat.textContent = `${done} photo${done === 1 ? '' : 's'} uploaded — save to keep them.`;
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
    return 'The database refused the write — your Firebase UID is not an admin. See SETUP.md steps 4–5.';
  if (m.includes('jwt') || m.includes('token'))
    return 'Login token rejected by Supabase. Enable Firebase Third Party Auth (SETUP.md step 4).';
  return e.message || 'Save failed';
}

/* ---------------- coupons ---------------- */
function viewCoupons() {
  return `
    <div class="head"><h2>Rewards</h2></div>
    <p class="muted" style="margin-bottom:16px">Codes players unlock by scoring in Gully Cricket.
      These are never listed publicly — the storefront validates them through a database function,
      so the codes stay a surprise until they're earned.</p>
    ${DB.coupons.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Code</th><th class="num">Discount</th><th class="num">Min spend</th>
        <th class="num">Unlocks at</th><th class="num">Used</th><th>Active</th><th></th></tr></thead>
      <tbody>${DB.coupons.map(c => `<tr>
        <td><b style="font-family:ui-monospace,monospace">${esc(c.code)}</b></td>
        <td class="num">${inr(c.discount)}</td>
        <td class="num">${inr(c.min_spend)}</td>
        <td class="num">${c.unlock_runs ?? '—'} runs</td>
        <td class="num">${c.uses}</td>
        <td><span class="pill ${c.active ? 'on' : 'off'}">${c.active ? 'On' : 'Off'}</span></td>
        <td style="text-align:right"><button class="btn ghost sm" data-cedit="${esc(c.code)}">Edit</button></td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">No reward codes found.</div>`}`;
}

function wireCoupons() {
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
        Firebase UID <code>${esc(USER && USER.uid)}</code></p>
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
