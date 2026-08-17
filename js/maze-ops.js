/* ============================================================
   MAZE ROOM — operations module
   Sales, finance, team, attendance, payroll, tasks, SOPs and
   both leaderboards. Loaded after maze.js and extends it.

   Every screen here is additionally protected by RLS: hiding a
   nav item is convenience, the database is the actual boundary.
   ============================================================ */

/* ---------- role model ---------- */
/* Founder is the top of the hierarchy — 'owner' is the same rank under its
   old name, kept working so an un-migrated row never locks anyone out.
   Settings and Finance are founder-only: payment keys, GST identity and
   profit are ownership decisions, not daily work. Activity (the audit
   trail) is founder-only for the same reason. */
/* Founder-only sections sit LAST in this list on purpose — the dock draws
   them in order, so they group themselves at the right behind a divider. */
const ROLE_NAV = {
  founder:  ['dash','sales','billing','products','team','tasks','sops','boards','coupons','scores','finance','insights','activity','branches','settings'],
  owner:    ['dash','sales','billing','products','team','tasks','sops','boards','coupons','scores','finance','insights','activity','branches','settings'],
  manager:  ['dash','sales','billing','products','team','tasks','sops','boards','coupons','scores'],
  sales:    ['dash','sales','tasks','sops','boards'],
  workshop: ['dash','tasks','sops']
};
const NAV_LABEL = {
  dash:'Dashboard', sales:'Sales', billing:'Billing', finance:'Finance', products:'Products',
  team:'Team', tasks:'Tasks', sops:'SOPs', boards:'Leaderboards',
  coupons:'Rewards', scores:'Game scores', insights:'Insights',
  activity:'Activity', branches:'Branches', settings:'Settings'
};

/* what each rank is called on screen */
const ROLE_LABEL = {
  founder: 'Founder', owner: 'Founder', manager: 'Manager',
  sales: 'Sales', workshop: 'Workshop'
};

/* Sections nobody below founder can open at all. These get the warm tint
   in the dock. Team is deliberately absent: a manager can open it, they
   just see less inside — so marking it would say the wrong thing. */
const FOUNDER_ONLY = ['finance', 'insights', 'activity', 'branches', 'settings'];

let ME = null;            // my staff row
let OPS = { staff: [], attendance: [], tasks: [], payroll: [], sops: [], expenses: [], targets: [], customers: [] };

const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const monthKey = d => { const x = d ? new Date(d) : new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-01'; };
const monthName = k => new Date(k).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- load ---------- */
async function loadOps() {
  const get = async (q, fb) => { try { return await supa(q); } catch (e) { return fb; } };
  const [staff, attendance, tasks, payroll, sops, expenses, targets, customers] = await Promise.all([
    get('staff?select=*&order=name.asc', []),
    get('attendance?select=*&order=on_date.desc&limit=400', []),
    get('tasks?select=*&order=created_at.desc&limit=200', []),
    get('payroll?select=*&order=month.desc', []),
    get('sops?select=*&order=category.asc,title.asc', []),
    get('expenses?select=*&order=on_date.desc&limit=300', []),
    get('targets?select=*', []),
    get('customer_stats?select=*&order=spend.desc&limit=100', [])
  ]);
  Object.assign(OPS, { staff, attendance, tasks, payroll, sops, expenses, targets, customers });
  ME = staff.find(s => s.uid === (USER && USER.uid)) || null;
}

/* ---------- tiny inline charts (no libraries) ---------- */
function barChart(data, opts) {
  opts = opts || {};
  if (!data.length) return '<div class="empty">Nothing to chart yet.</div>';
  const max = Math.max(...data.map(d => d.v), 1);
  const w = 100 / data.length;
  return `<div class="chart">
    <div class="bars">${data.map((d, i) => `
      <div class="bar-col" style="width:${w}%" title="${esc(d.k)}: ${money(d.v)}">
        <div class="bar" style="height:${Math.max(2, d.v / max * 100)}%"></div>
        <span class="bar-lbl">${esc(d.k)}</span>
      </div>`).join('')}</div>
    <div class="chart-max">${opts.money === false ? max : money(max)}</div>
  </div>`;
}

function sparkLine(values) {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const span = (max - min) || 1;
  const pts = values.map((v, i) =>
    (i / (values.length - 1) * 100).toFixed(1) + ',' + (100 - (v - min) / span * 100).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 100 100" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.5"
      vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

/* ---------- sales maths ---------- */
/* Every figure on the dashboard, finance page and charts flows through
   here, so switching branch re-cuts the whole business view at once. */
function liveOrders() {
  return branchOrders(DB.orders.filter(o => o.status !== 'cancelled'));
}

function salesByDay(days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const v = liveOrders().filter(o => (o.created_at || '').slice(0, 10) === key)
      .reduce((s, o) => s + (o.total || 0), 0);
    out.push({ k: d.getDate() + '', v, date: key });
  }
  return out;
}

/* Month-wise is the honest view for finance: at a few orders a week a
   daily chart is mostly empty columns with two lonely spikes, which reads
   as "the business is broken" rather than "this is a young business".
   Months aggregate that into a trend you can actually judge. */
function monthsBack(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    /* the year only when it changes, so the axis stays readable */
    const label = d.toLocaleDateString('en-IN', { month: 'short' }) +
      (d.getMonth() === 0 || i === n - 1 ? ' ’' + String(d.getFullYear()).slice(2) : '');
    out.push({ key, label, date: d });
  }
  return out;
}

function salesByMonth(n) {
  return monthsBack(n).map(m => ({
    k: m.label,
    key: m.key,
    v: liveOrders()
      .filter(o => (o.created_at || '').slice(0, 7) === m.key)
      .reduce((s, o) => s + (o.total || 0), 0)
  }));
}

function expensesByMonth(n) {
  return monthsBack(n).map(m => ({
    k: m.label,
    key: m.key,
    v: OPS.expenses
      .filter(e => (e.on_date || '').slice(0, 7) === m.key)
      .reduce((s, e) => s + (e.amount || 0), 0)
  }));
}

/* revenue, expenses and what is left, month by month */
function monthTable(n) {
  const rev = salesByMonth(n), exp = expensesByMonth(n);
  const pay = {};
  OPS.payroll.filter(p => p.status === 'paid').forEach(p =>
    pay[(p.month || '').slice(0, 7)] = (pay[(p.month || '').slice(0, 7)] || 0) + (p.net || 0));

  const cost = {};
  liveOrders().forEach(o => {
    const k = (o.created_at || '').slice(0, 7);
    (o.items || []).forEach(it => {
      const p = DB.products.find(x => x.id === it.id);
      if (p && p.cost != null) cost[k] = (cost[k] || 0) + p.cost * (it.qty || 1);
    });
  });

  return rev.map((r, i) => {
    const e = exp[i].v, c = cost[r.key] || 0, s = pay[r.key] || 0;
    const orders = liveOrders().filter(o => (o.created_at || '').slice(0, 7) === r.key).length;
    return { k: r.k, key: r.key, orders, revenue: r.v, cogs: c, expenses: e,
             salaries: s, net: r.v - c - e - s };
  });
}

function salesByChannel() {
  const m = {};
  liveOrders().forEach(o => { const c = o.channel || 'web'; m[c] = (m[c] || 0) + (o.total || 0); });
  return Object.entries(m).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
}

/* Staff belonging to the branch being viewed. Founders are unpinned and
   work across all of them, so they only appear in the combined view. */
function branchStaff(activeOnly) {
  let list = OPS.staff;
  if (activeOnly !== false) list = list.filter(s => s.active);
  return BRANCH ? list.filter(s => s.branch_id === BRANCH) : list;
}

/* Customers, derived from the orders on screen rather than the database's
   all-branch view — otherwise a branch dashboard reports the company's
   customer count, which is simply the wrong number for that shop. */
function branchCustomers() {
  if (!BRANCH) return OPS.customers;          /* server view: complete, all branches */
  const m = {};
  liveOrders().forEach(o => {
    const c = o.customer || {};
    const key = c.phone || c.name || 'unknown';
    const r = m[key] || (m[key] = { phone: c.phone || '', name: c.name || 'Unknown',
      city: c.city || '', order_count: 0, spend: 0, last_order: null });
    r.order_count++;
    r.spend += o.total || 0;
    if (!r.last_order || (o.created_at || '') > r.last_order) r.last_order = o.created_at;
    if (!r.city && c.city) r.city = c.city;
  });
  return Object.values(m).sort((a, b) => b.spend - a.spend);
}

function staffSales(staffId, from) {
  return liveOrders().filter(o => o.staff_id === staffId && (!from || o.created_at >= from))
    .reduce((s, o) => s + (o.total || 0), 0);
}

function cogs() {
  /* only counts products whose cost the owner has actually filled in */
  let known = 0, unknown = 0;
  liveOrders().forEach(o => (o.items || []).forEach(it => {
    const p = DB.products.find(x => x.id === it.id);
    if (p && p.cost != null) known += p.cost * (it.qty || 1);
    else unknown++;
  }));
  return { known, unknown };
}

/* ---------- dashboard ----------
   Work first, numbers second. At one order a day the useful question is
   "what do I need to do?", not "how are we trending?" — and a bar chart
   with a single bar reads as broken rather than informative, so the charts
   stay hidden until there is enough activity for them to say something. */

/* ---------- best seller, month by month ----------
   One card per month showing which bat led it, ranked by units. The
   months are ordered newest first and each card carries its position in
   the ranking of ALL months, so a founder can see at a glance whether
   this month is their best ever or a quiet one. */
function bestSellerCards() {
  const rows = anBranch(AN.bestSeller);
  if (!rows.length) return '';

  /* combine branches when viewing all: the top bat of the month overall */
  const byMonth = {};
  rows.forEach(r => {
    const m = byMonth[r.month] || (byMonth[r.month] = {});
    const k = r.product_id;
    m[k] = (m[k] || 0) + Number(r.units || 0);
  });
  const months = Object.keys(byMonth).sort().reverse().slice(0, 6).map(month => {
    const top = Object.entries(byMonth[month]).sort((a, b) => b[1] - a[1])[0];
    const p = DB.products.find(x => x.id === top[0]);
    const mp = anMonths().find(x => x.month === month) || {};
    return { month, id: top[0], name: p ? p.name : top[0], units: top[1],
             revenue: Number(mp.revenue) || 0 };
  });
  /* rank the months against each other by that month's revenue */
  const order = months.slice().sort((a, b) => b.revenue - a.revenue).map(m => m.month);

  return `
    <div class="panel">
      <h3>Best seller each month</h3>
      <p class="muted" style="margin:-4px 0 14px">The bat that led each month, and how that
        month ranks against the others${BRANCH ? ' at ' + esc(branchName(BRANCH)) : ''}.</p>
      <div class="bs-grid">
        ${months.map(m => {
          const rank = order.indexOf(m.month) + 1;
          return `<button class="bs-card${rank === 1 ? ' top' : ''}" data-go="products"
                          title="${esc(m.name)} led ${esc(monthLabel(m.month))}">
            <span class="bs-month">${esc(monthLabel(m.month))}
              <i class="bs-rank r${Math.min(rank, 4)}">#${rank}</i></span>
            <b>${esc(m.name)}</b>
            <span class="bs-units">${m.units} sold · ${money(m.revenue)} that month</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

/* Side by side, this month — the question a founder with two shops
   actually asks. Clicking a branch switches the whole panel to it. */
function branchCompare() {
  const m = monthKey();
  const rows = DB.branches.filter(b => b.active).map(b => {
    const orders = DB.orders.filter(o => o.status !== 'cancelled'
      && (o.branch_id || defaultBranch()) === b.id);
    const month = orders.filter(o => (o.created_at || '') >= m);
    return {
      b, orders: month.length,
      revenue: month.reduce((s, o) => s + (o.total || 0), 0),
      all: orders.reduce((s, o) => s + (o.total || 0), 0),
      stock: DB.stock.filter(s => s.branch_id === b.id).reduce((t, s) => t + (s.stock || 0), 0),
      staff: OPS.staff.filter(s => s.active && s.branch_id === b.id).length
    };
  });
  const best = Math.max(1, ...rows.map(r => r.revenue));

  return `
    <div class="panel">
      <h3>Branches this month</h3>
      <div class="br-grid">
        ${rows.map(r => `
          <button class="br-card" data-branch="${esc(r.b.id)}">
            <span class="br-nm">${esc(r.b.name)}<i>${esc(r.b.code)}</i></span>
            <b>${money(r.revenue)}</b>
            <span class="br-sub">${r.orders} order${r.orders === 1 ? '' : 's'} this month</span>
            <div class="prog sm" style="max-width:none"><i style="width:${r.revenue / best * 100}%"></i></div>
            <span class="br-meta">${r.stock} in stock · ${r.staff} on the team</span>
          </button>`).join('')}
      </div>
    </div>`;
}

function goTab(t) {
  const prev = TAB;
  TAB = t;
  if (typeof navPush === 'function') navPush(prev);   /* feeds the dock's back button */
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  render();
}

/* Everything that is actually waiting on someone, newest problem first. */
function todoList() {
  const jobs = [];
  const toPack = DB.orders.filter(o => o.status === 'new' || o.status === 'packed');
  if (toPack.length) jobs.push({ k: 'hot', n: toPack.length, tab: 'sales',
    t: toPack.length === 1 ? 'order to pack and send' : 'orders to pack and send',
    s: 'Open it for the address and what to put in the box.' });

  const unbilled = (typeof BILL !== 'undefined' ? DB.orders.filter(o =>
    o.status !== 'cancelled' && !BILL.invoices.some(i => i.order_id === o.id && !i.cancelled)) : []);
  if (unbilled.length) jobs.push({ k: '', n: unbilled.length, tab: 'billing',
    t: unbilled.length === 1 ? 'order with no bill' : 'orders with no bill',
    s: 'Issue a bill so the sale has a document.' });

  const noPrice = DB.products.filter(p => p.active && !p.price);
  if (noPrice.length) jobs.push({ k: 'warn', n: noPrice.length, tab: 'products',
    t: 'bats nobody can buy', s: 'No price set, so they fall back to a WhatsApp enquiry.' });

  const oos = DB.products.filter(p => p.active && p.stock <= 0);
  if (oos.length) jobs.push({ k: 'warn', n: oos.length, tab: 'products',
    t: 'bats live with no stock', s: 'Still on sale at zero. Make more, or switch them off.' });

  const noCost = DB.products.filter(p => p.cost == null);
  if (noCost.length) jobs.push({ k: '', n: noCost.length, tab: 'products',
    t: 'bats with no cost price', s: 'Finance shows turnover, not profit, until these are in.' });

  return jobs;
}

/* Setup items are a separate, quieter list — they are one-offs, not daily work. */
function setupList() {
  const s = [];
  const shot = DB.products.filter(p => (p.images || []).length).length;
  if (shot < DB.products.length)
    s.push({ done: shot, of: DB.products.length, t: 'bats photographed',
             s: 'The single biggest thing you can do for sales.', tab: 'products' });
  if (!String(DB.settings.razorpay_key || '').trim())
    s.push({ done: 0, of: 1, t: 'online payment', s: 'No Razorpay key, so only COD and WhatsApp work.', tab: 'settings' });
  if (typeof isRegistered === 'function' && !isRegistered())
    s.push({ done: 0, of: 1, t: 'GST details', s: 'Bills issue as a Bill of Supply until the GSTIN is set.', tab: 'settings' });
  return s;
}

/* A chart needs a spread of days to mean anything. One bar is not a trend. */
function enoughToChart() {
  const days = new Set(liveOrders().map(o => (o.created_at || '').slice(0, 10)));
  return liveOrders().length >= 5 && days.size >= 3;
}

function viewOpsDash() {
  const orders = liveOrders();
  const thisMonth = orders.filter(o => (o.created_at || '') >= monthKey());
  const revMonth = thisMonth.reduce((s, o) => s + (o.total || 0), 0);
  const revAll = orders.reduce((s, o) => s + (o.total || 0), 0);

  if (!isAdminRole()) {
    const myMonth = ME ? staffSales(ME.id, monthKey()) : 0;
    const myTarget = ME ? (OPS.targets.find(t => t.staff_id === ME.id && t.month === monthKey()) || {}).amount || 0 : 0;
    const pct = myTarget ? Math.min(100, Math.round(myMonth / myTarget * 100)) : 0;
    const mine = OPS.tasks.filter(t => t.staff_id === (ME && ME.id) && t.status !== 'done');
    return `
      <div class="head"><h2>Hello ${esc((ME && ME.name || '').split(' ')[0] || '')}</h2></div>
      <div class="cards">
        <div class="card hot"><b>${money(myMonth)}</b><span>My sales this month</span></div>
        <div class="card"><b>${myTarget ? money(myTarget) : '—'}</b><span>My target</span></div>
        <div class="card ${mine.length ? 'warn' : 'good'}"><b>${mine.length}</b><span>My open tasks</span></div>
      </div>
      ${myTarget ? `<div class="panel"><h3>Target progress</h3>
        <div class="prog"><i style="width:${pct}%"></i></div>
        <p class="muted" style="margin-top:8px">${pct}% of ${money(myTarget)}</p></div>` : ''}
      <div class="panel"><h3>My tasks</h3>${taskTable(mine)}</div>`;
  }

  const jobs = todoList();
  const setup = setupList();

  return `
    <div class="head"><h2>Dashboard</h2>
      <span class="muted">${monthName(monthKey())}${multiBranch()
        ? ' · ' + (BRANCH ? esc(branchName(BRANCH)) : 'all branches') : ''}</span></div>

    ${multiBranch() && !BRANCH ? branchCompare() : ''}
    ${bestSellerCards()}

    <div class="todo">
      <div class="todo-h"><h3>What needs doing</h3>
        ${!jobs.length ? '<span class="todo-clear">All clear</span>' : ''}</div>
      ${jobs.length ? jobs.map(j => `
        <button class="job ${j.k}" data-go="${j.tab}">
          <b>${j.n}</b>
          <span><i>${esc(j.t)}</i><em>${esc(j.s)}</em></span>
          <u>→</u>
        </button>`).join('')
        : `<p class="muted" style="margin:0">Nothing waiting. Orders are packed, every bat has a
             price and a cost, and nothing is out of stock.</p>`}
    </div>

    ${setup.length ? `
      <div class="panel setup">
        <h3>Still to set up</h3>
        <p class="gsub" style="margin-bottom:12px">One-off jobs, not daily work.</p>
        ${setup.map(s => `
          <button class="setup-row" data-go="${s.tab}">
            <div class="setup-t"><b>${esc(s.t)}</b><span>${esc(s.s)}</span></div>
            <div class="setup-n">${s.of > 1 ? s.done + ' / ' + s.of : (s.done ? 'Done' : 'Not set')}</div>
            ${s.of > 1 ? `<div class="prog sm"><i style="width:${Math.round(s.done / s.of * 100)}%"></i></div>` : ''}
          </button>`).join('')}
      </div>` : ''}

    <div class="cards tight">
      <div class="card hot"><b>${money(revMonth)}</b><span>Revenue this month</span></div>
      ${revAll !== revMonth ? `<div class="card"><b>${money(revAll)}</b><span>All time</span></div>` : ''}
      <div class="card"><b>${thisMonth.length}</b><span>Orders this month</span></div>
      <div class="card"><b>${branchCustomers().length}</b><span>Customers</span></div>
      <div class="card good"><b>${branchStaff().length}</b><span>Active staff</span></div>
    </div>

    ${enoughToChart() ? `
      <div class="panel"><h3>Last 14 days</h3>${barChart(salesByDay(14))}</div>
      <div class="grid-2">
        <div class="panel"><h3>By channel</h3>${barChart(salesByChannel())}</div>
        <div class="panel"><h3>Top sellers</h3>${topProductsTable()}</div>
      </div>`
      : `<div class="panel chart-wait">
           <h3>Trends</h3>
           <p class="gsub">Charts appear once there are a few orders across several days —
             a graph of one sale would only look broken. ${orders.length} order${orders.length === 1 ? '' : 's'} so far.</p>
         </div>`}`;
}

function wireDash() {
  $$('[data-go]').forEach(b => b.onclick = () => goTab(b.dataset.go));
  $$('[data-branch]').forEach(b => b.onclick = () => {
    BRANCH = b.dataset.branch;
    buildNav();            /* the switcher must follow the click */
    render();
  });
}


/* 'owner' and 'founder' are the same rank — the database says the same
   thing in is_founder(), so the UI and the policies can never disagree. */
function isAdminRole() { return !!ME && ['founder','owner','manager'].includes(ME.role); }
function isOwner() { return !!ME && ['founder','owner'].includes(ME.role); }

function topProductsTable() {
  const m = {};
  liveOrders().forEach(o => (o.items || []).forEach(it => {
    const k = it.name || it.id;
    m[k] = m[k] || { qty: 0, value: 0 };
    m[k].qty += it.qty || 1;
    m[k].value += (it.price || 0) * (it.qty || 1);
  }));
  const rows = Object.entries(m).sort((a, b) => b[1].value - a[1].value).slice(0, 6);
  if (!rows.length) return '<div class="empty">No sales yet.</div>';
  return `<table class="mini">${rows.map(([k, v]) => `<tr>
    <td>${esc(k)}</td><td class="num muted">${v.qty}</td>
    <td class="num"><b>${money(v.value)}</b></td></tr>`).join('')}</table>`;
}

/* ---------- sales ---------- */
function viewSales() {
  const mine = !isAdminRole();
  const list = branchOrders(mine ? DB.orders.filter(o => o.staff_id === (ME && ME.id)) : DB.orders);
  return `
    <div class="head"><h2>${mine ? 'My sales' : 'Sales'}</h2>
      <span class="muted">${list.length} orders</span>
      <div class="sp">${exportBar('sales')}
        <button class="btn primary" id="newSale">+ Log a sale</button></div>
    </div>
    <p class="muted" style="margin-bottom:16px">Website orders arrive automatically.
      Use <b>Log a sale</b> for WhatsApp, phone and walk-in orders so the dashboards
      reflect your whole business, not just online.</p>
    ${list.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Order</th><th>Customer</th>${multiBranch() ? '<th>Branch</th>' : ''}
        <th>Channel</th><th>Sold by</th>
        <th class="num">Total</th><th>Paid</th><th>Status</th><th>When</th></tr></thead>
      <tbody>${list.map(o => {
        const c = o.customer || {}, s = OPS.staff.find(x => x.id === o.staff_id);
        return `<tr>
          <td><button class="od-open pid" data-order="${esc(o.id)}">${esc(o.id)}</button></td>
          <td><div>${esc(c.name || '—')}</div><div class="pid">${esc(c.phone || '')}</div></td>
          ${multiBranch() ? `<td class="muted">${esc(branchName(o.branch_id || defaultBranch()))}</td>` : ''}
          <td><span class="pill ${esc(o.channel || 'web')}">${esc(o.channel || 'web')}</span></td>
          <td class="muted">${esc(s ? s.name : '—')}</td>
          <td class="num">${money(o.total)}</td>
          <td>${o.paid ? '<span class="pill on">Paid</span>' : '<span class="pill off">Unpaid</span>'}</td>
          <td>${isAdminRole()
            ? `<select data-status="${esc(o.id)}" class="inline-sel">
                ${['new','packed','shipped','cancelled'].map(s =>
                  `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`
            : `<span class="pill ${esc(o.status)}">${esc(o.status)}</span>`}</td>
          <td class="muted">${when(o.created_at)}</td></tr>`;
      }).join('')}</tbody></table></div>`
      : `<div class="empty">No sales recorded yet.</div>`}`;
}

/* Everything needed to actually pack and post the order, in one place.
   The Sales table only ever showed a count of items and no address, so
   dispatching meant querying the database by hand. */
function orderDetail(o) {
  const c = o.customer || {};
  const addr = [c.address, c.city, c.state, c.pin].filter(Boolean).join(', ');
  const post = [c.name, c.phone, c.address, [c.city, c.state].filter(Boolean).join(' '), c.pin]
    .filter(Boolean).join('\n');
  const seller = OPS.staff.find(s => s.id === o.staff_id);
  const inv = (typeof BILL !== 'undefined')
    ? BILL.invoices.find(i => i.order_id === o.id && !i.cancelled) : null;

  const track = `Hi ${c.name || 'there'} 👋\n\nYour Toss order *${o.id}* is on its way.\n\n` +
    (o.items || []).map(i => `${i.qty || 1} × ${i.name || i.id}`).join('\n') +
    `\n\nTotal: ${money(o.total)}\n\nAny problem, just reply here.`;

  openModal('Order ' + esc(o.id), `
    <div class="od">
      <div class="od-cols">
        <div>
          <h4>Ship to</h4>
          <p class="od-addr" id="odAddr">${esc(post) || '<i>No address captured</i>'}</p>
          <button class="btn ghost sm" id="odCopy">Copy address</button>
        </div>
        <div>
          <h4>Order</h4>
          <table class="od-meta">
            <tr><th>Placed</th><td>${when(o.created_at)}</td></tr>
            <tr><th>Channel</th><td>${esc(o.channel || 'web')}</td></tr>
            <tr><th>Payment</th><td>${esc(o.method || '—')} ${o.paid ? '· paid' : '· unpaid'}</td></tr>
            <tr><th>Status</th><td>${esc(o.status)}</td></tr>
            ${seller ? `<tr><th>Sold by</th><td>${esc(seller.name)}</td></tr>` : ''}
            <tr><th>Bill</th><td>${inv ? esc(inv.number) : '<i>not billed yet</i>'}</td></tr>
          </table>
        </div>
      </div>

      <h4>What to pack</h4>
      <table class="od-items">
        <thead><tr><th>Bat</th><th>Variant</th><th class="num">Qty</th><th class="num">Price</th></tr></thead>
        <tbody>${(o.items || []).map(i => `<tr>
          <td><b>${esc(i.name || i.id)}</b><div class="pid">${esc(i.id)}</div></td>
          <td class="muted">${esc(i.variant || '—')}</td>
          <td class="num">${i.qty || 1}</td>
          <td class="num">${money(i.price)}</td></tr>`).join('') ||
          '<tr><td colspan="4"><i>No line items recorded</i></td></tr>'}
        </tbody>
      </table>

      <div class="od-tot">
        <div><span>Subtotal</span><b>${money(o.subtotal)}</b></div>
        ${o.shipping ? `<div><span>Shipping</span><b>${money(o.shipping)}</b></div>` : ''}
        ${o.discount ? `<div><span>Discount${o.coupon ? ' (' + esc(o.coupon) + ')' : ''}</span><b>− ${money(o.discount)}</b></div>` : ''}
        <div class="od-grand"><span>Total</span><b>${money(o.total)}</b></div>
      </div>

      <div class="od-act">
        <a class="btn ghost" target="_blank" rel="noopener"
           href="https://wa.me/${esc(String(c.phone || '').replace(/\D/g, ''))}?text=${encodeURIComponent(track)}">
           Send dispatch update</a>
        ${inv ? '' : `<button class="btn primary" id="odBill">Issue bill</button>`}
      </div>
    </div>`, async () => true);

  setTimeout(() => {
    const cp = $('#odCopy');
    if (cp) cp.onclick = () => {
      navigator.clipboard.writeText(post).then(
        () => toast('Address copied'), () => toast('Could not copy', true));
    };
    const bl = $('#odBill');
    if (bl) bl.onclick = async () => {
      bl.disabled = true;
      const i = await issueInvoice(o);
      bl.disabled = false;
      if (i) { render(); showInvoice(i); }
    };
  }, 30);
}

function wireSales() {
  const b = $('#newSale'); if (b) b.onclick = logSaleModal;

  wireExport('sales', 'Sales report' + (BRANCH ? ' — ' + branchName(BRANCH) : ''), () => {
    const mine = !isAdminRole();
    const list = branchOrders(mine ? DB.orders.filter(o => o.staff_id === (ME && ME.id)) : DB.orders);
    const live = list.filter(o => o.status !== 'cancelled');
    return [{
      name: mine ? 'My sales' : 'Sales',
      summary: [
        { k: 'Orders', v: list.length },
        { k: 'Revenue', v: '₹' + live.reduce((s, o) => s + (o.total || 0), 0).toLocaleString('en-IN') },
        { k: 'Unpaid', v: live.filter(o => !o.paid).length },
        { k: 'Cancelled', v: list.filter(o => o.status === 'cancelled').length }
      ],
      columns: [
        { header: 'Order', key: 'id' },
        { header: 'Date', key: 'created_at', type: 'date' },
        { header: 'Branch', key: 'branch' },
        { header: 'Customer', key: 'customer' },
        { header: 'Phone', key: 'phone' },
        { header: 'City', key: 'city' },
        { header: 'Items', key: 'items' },
        { header: 'Channel', key: 'channel' },
        { header: 'Sold by', key: 'soldBy' },
        { header: 'Status', key: 'status' },
        { header: 'Paid', key: 'paid' },
        { header: 'Total', key: 'total', type: 'money' }
      ],
      rows: list.map(o => {
        const c = o.customer || {}, s = OPS.staff.find(x => x.id === o.staff_id);
        return {
          id: o.id, created_at: o.created_at, branch: branchName(o.branch_id || defaultBranch()),
          customer: c.name || '', phone: c.phone || '',
          city: c.city || '', channel: o.channel || 'web', soldBy: s ? s.name : '',
          status: o.status, paid: o.paid ? 'Paid' : 'Unpaid', total: o.total || 0,
          items: (o.items || []).map(i => `${i.name || i.id} x${i.qty || 1}`).join(', ')
        };
      })
    }];
  }, 'Every order recorded in the Maze Room — website, WhatsApp, phone and counter.');
  $$('[data-order]').forEach(t => t.onclick = () => {
    const o = DB.orders.find(x => x.id === t.dataset.order);
    if (o) orderDetail(o);
  });
  $$('[data-status]').forEach(sel => sel.onchange = async () => {
    const id = sel.dataset.status;
    try {
      await saveRow('orders', { id, status: sel.value });
      const o = DB.orders.find(x => x.id === id); if (o) o.status = sel.value;
      OPS.customers = await supa('customer_stats?select=*&order=spend.desc&limit=100').catch(() => OPS.customers);
      toast('Order marked ' + sel.value);
    } catch (e) { toast(writeError(e), true); }
  });
}

function logSaleModal() {
  const opts = DB.products.filter(p => p.active)
    .map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.price ? ' — ' + money(p.price) : ' (no price)'}</option>`).join('');
  openModal('Log a sale', `
    <div class="f">
      <div class="grid2">
        <div class="row"><label>Customer name</label><input id="o_name"></div>
        <div class="row"><label>Phone</label><input id="o_phone" inputmode="numeric"></div>
        <div class="row"><label>City</label><input id="o_city"></div>
        <div class="row"><label>Channel</label><select id="o_channel">
          <option value="whatsapp">WhatsApp</option><option value="walkin">Walk-in</option>
          <option value="phone">Phone</option><option value="instagram">Instagram</option>
        </select></div>
      </div>
      <div class="row"><label>Bat</label><select id="o_product">${opts}</select></div>
      <div class="grid2">
        <div class="row"><label>Quantity</label><input id="o_qty" type="number" min="1" value="1"></div>
        <div class="row"><label>Price charged (₹)</label><input id="o_price" type="number" min="0">
          <div class="hint">Defaults to list price; change it if you gave a discount.</div></div>
        ${isAdminRole() ? `<div class="row"><label>Sold by</label><select id="o_staff">
          <option value="">— nobody —</option>
          ${OPS.staff.filter(s => s.active).map(s =>
            `<option value="${s.id}" ${ME && s.id === ME.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select></div>` : ''}
      </div>
      <div class="row"><label class="check"><input type="checkbox" id="o_paid" checked> Payment received</label></div>
    </div>`, async () => {
    const p = DB.products.find(x => x.id === $('#o_product').value);
    const qty = Number($('#o_qty').value || 1);
    const price = Number($('#o_price').value || (p && p.price) || 0);
    if (!$('#o_name').value.trim()) { toast('Customer name is required', true); return false; }
    if (!price) { toast('Enter the price charged', true); return false; }

    const total = price * qty;
    const row = {
      id: 'TS-' + Date.now().toString(36).toUpperCase(),
      customer: { name: $('#o_name').value.trim(), phone: $('#o_phone').value.trim(), city: $('#o_city').value.trim() },
      items: [{ id: p.id, name: p.name, price, qty }],
      subtotal: total, shipping: 0, discount: 0, total,
      method: 'offline', channel: $('#o_channel').value,
      staff_id: (isAdminRole() ? ($('#o_staff') || {}).value : (ME && ME.id)) || null,
      paid: $('#o_paid').checked, status: 'new'
    };
    try {
      await supa('orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: row });
      DB.orders.unshift(Object.assign({ created_at: new Date().toISOString() }, row));
      OPS.customers = await supa('customer_stats?select=*&order=spend.desc&limit=100').catch(() => OPS.customers);
      toast('Sale logged'); render();
    } catch (e) { toast(writeError(e), true); return false; }
  });
  const sel = $('#o_product'), price = $('#o_price');
  const sync = () => { const p = DB.products.find(x => x.id === sel.value); price.value = p && p.price || ''; };
  sel.onchange = sync; sync();
}

/* ---------- finance ---------- */
/* The month-wise view. Revenue and expenses share one scale so their bars
   are comparable at a glance — two charts with independent scales would
   make ₹2,000 of expenses look the same height as ₹40,000 of revenue.
   Months before the first order are dropped; showing eight empty columns
   to a business that started in July is just noise. */
function monthWisePanel() {
  const rows = monthTable(12);

  const first = liveOrders().concat(OPS.expenses.map(e => ({ created_at: e.on_date })))
    .map(o => (o.created_at || '').slice(0, 7)).filter(Boolean).sort()[0];
  const shown = first ? rows.filter(r => r.key >= first) : rows.slice(-3);
  if (!shown.length) return '';

  const scale = Math.max(1, ...shown.map(r => Math.max(r.revenue, r.expenses + r.salaries)));
  const totals = shown.reduce((t, r) => ({
    revenue: t.revenue + r.revenue, cogs: t.cogs + r.cogs,
    expenses: t.expenses + r.expenses, salaries: t.salaries + r.salaries, net: t.net + r.net
  }), { revenue: 0, cogs: 0, expenses: 0, salaries: 0, net: 0 });

  return `
    <div class="panel">
      <h3>Month by month</h3>
      <p class="muted" style="margin:-4px 0 14px">Revenue against what it cost to earn it.
        ${shown.length} month${shown.length === 1 ? '' : 's'} of trading.</p>

      <div class="mw-chart">
        ${shown.map(r => `
          <div class="mw-col" title="${esc(r.k)} — revenue ${money(r.revenue)}, out ${money(r.expenses + r.salaries)}">
            <div class="mw-pair">
              <div class="mw-bar rev" style="height:${Math.max(2, r.revenue / scale * 100)}%"></div>
              <div class="mw-bar out" style="height:${Math.max(2, (r.expenses + r.salaries) / scale * 100)}%"></div>
            </div>
            <span class="mw-lbl">${esc(r.k)}</span>
          </div>`).join('')}
        <div class="mw-max">${money(scale)}</div>
      </div>
      <div class="mw-key">
        <span><i class="rev"></i>Revenue</span>
        <span><i class="out"></i>Expenses + salaries</span>
      </div>

      <div class="tbl-wrap" style="margin-top:16px"><table>
        <thead><tr><th>Month</th><th class="num">Orders</th><th class="num">Revenue</th>
          <th class="num">Cost of goods</th><th class="num">Expenses</th>
          <th class="num">Salaries</th><th class="num">Net</th></tr></thead>
        <tbody>${shown.slice().reverse().map(r => `<tr>
          <td><b>${esc(r.k)}</b></td>
          <td class="num">${r.orders}</td>
          <td class="num">${money(r.revenue)}</td>
          <td class="num muted">${money(r.cogs)}</td>
          <td class="num muted">${money(r.expenses)}</td>
          <td class="num muted">${money(r.salaries)}</td>
          <td class="num ${r.net >= 0 ? 'good-cell' : 'warn-cell'}"><b>${money(r.net)}</b></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td><b>Total</b></td><td class="num">${shown.reduce((s, r) => s + r.orders, 0)}</td>
          <td class="num"><b>${money(totals.revenue)}</b></td>
          <td class="num muted">${money(totals.cogs)}</td>
          <td class="num muted">${money(totals.expenses)}</td>
          <td class="num muted">${money(totals.salaries)}</td>
          <td class="num ${totals.net >= 0 ? 'good-cell' : 'warn-cell'}"><b>${money(totals.net)}</b></td>
        </tr></tfoot>
      </table></div>
    </div>`;
}

function viewFinance() {
  const orders = liveOrders();
  const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const exp = OPS.expenses.reduce((s, e) => s + e.amount, 0);
  const c = cogs();
  const payrollCost = OPS.payroll.filter(p => p.status === 'paid').reduce((s, p) => s + p.net, 0);
  const profit = revenue - c.known - exp - payrollCost;
  const noCost = DB.products.filter(p => p.cost == null).length;

  const byCat = {};
  OPS.expenses.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + e.amount);

  return `
    <div class="head"><h2>Finance</h2>
      <div class="sp">${exportBar('finance')}
        <button class="btn primary" id="newExpense">+ Record expense</button></div></div>

    ${noCost ? `<div class="banner">
      <b>${noCost} of ${DB.products.length} bats have no cost price.</b>
      Profit below counts only the ${DB.products.length - noCost} that do, so it is
      optimistic. Set cost per bat in <b>Products → Edit</b> to make this real.</div>` : ''}

    <div class="cards">
      <div class="card good"><b>${money(revenue)}</b><span>Revenue</span></div>
      <div class="card"><b>${money(c.known)}</b><span>Cost of goods</span></div>
      <div class="card"><b>${money(exp)}</b><span>Expenses</span></div>
      <div class="card"><b>${money(payrollCost)}</b><span>Salaries paid</span></div>
      <div class="card ${profit >= 0 ? 'good' : 'warn'}"><b>${money(profit)}</b><span>Net position</span></div>
    </div>

    ${monthWisePanel()}

    <div class="grid-2">
      <div class="panel"><h3>Expenses by category</h3>
        ${Object.keys(byCat).length
          ? barChart(Object.entries(byCat).map(([k, v]) => ({ k, v })))
          : '<div class="empty">No expenses recorded.</div>'}</div>
      <div class="panel"><h3>Revenue by channel</h3>
        ${salesByChannel().length
          ? barChart(salesByChannel())
          : '<div class="empty">No sales recorded.</div>'}</div>
    </div>

    <div class="panel"><h3>Expense log</h3>
      ${OPS.expenses.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Category</th><th>Detail</th><th class="num">Amount</th></tr></thead>
        <tbody>${OPS.expenses.map(e => `<tr><td>${e.on_date}</td><td>${esc(e.category)}</td>
          <td class="muted">${esc(e.detail || '')}</td><td class="num">${money(e.amount)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Nothing recorded yet.</div>'}</div>`;
}

function wireFinance() {
  /* Three sheets, because a finance report that is only a total cannot be
     checked. Summary shows the position; the other two show the workings. */
  wireExport('finance', 'Finance report', () => {
    const orders = liveOrders();
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const exp = OPS.expenses.reduce((s, e) => s + e.amount, 0);
    const c = cogs();
    const pay = OPS.payroll.filter(p => p.status === 'paid').reduce((s, p) => s + p.net, 0);
    const profit = revenue - c.known - exp - pay;
    const byCat = {};
    OPS.expenses.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + e.amount);

    return [
      { name: 'Summary',
        summary: [
          { k: 'Revenue', v: money(revenue) }, { k: 'Cost of goods', v: money(c.known) },
          { k: 'Expenses', v: money(exp) }, { k: 'Salaries paid', v: money(pay) },
          { k: 'Net position', v: money(profit) }
        ],
        columns: [{ header: 'Line', key: 'k' }, { header: 'Amount', key: 'v', type: 'money' }],
        rows: [
          { k: 'Revenue (excluding cancelled orders)', v: revenue },
          { k: 'Cost of goods sold', v: -c.known },
          { k: 'Operating expenses', v: -exp },
          { k: 'Salaries paid', v: -pay },
          { k: 'Net position', v: profit }
        ] },
      { name: 'Month by month',
        columns: [
          { header: 'Month', key: 'k' },
          { header: 'Orders', key: 'orders', type: 'number' },
          { header: 'Revenue', key: 'revenue', type: 'money' },
          { header: 'Cost of goods', key: 'cogs', type: 'money' },
          { header: 'Expenses', key: 'expenses', type: 'money' },
          { header: 'Salaries', key: 'salaries', type: 'money' },
          { header: 'Net', key: 'net', type: 'money' }
        ],
        rows: monthTable(12) },
      { name: 'Expenses',
        columns: [
          { header: 'Date', key: 'on_date', type: 'date' },
          { header: 'Category', key: 'category' },
          { header: 'Detail', key: 'detail' },
          { header: 'Amount', key: 'amount', type: 'money' }
        ],
        rows: OPS.expenses.slice().sort((a, b) => (b.on_date || '').localeCompare(a.on_date || '')) },
      { name: 'By category',
        columns: [{ header: 'Category', key: 'k' }, { header: 'Total', key: 'v', type: 'money' }],
        rows: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })) }
    ];
  }, cogs().unknown
      ? 'Cost of goods counts only products with a cost price filled in, so the net position is optimistic.'
      : 'Cost of goods covers every product sold.');

  $('#newExpense').onclick = () => openModal('Record expense', `
    <div class="f"><div class="grid2">
      <div class="row"><label>Date</label><input id="e_date" type="date" value="${today()}"></div>
      <div class="row"><label>Category</label><select id="e_cat">
        ${['Wood purchase','Labour','Rent','Electricity','Transport','Packaging','Marketing','Tools','Other']
          .map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="row"><label>Amount (₹)</label><input id="e_amt" type="number" min="0"></div>
    </div>
    <div class="row"><label>Detail</label><input id="e_detail" placeholder="Optional note"></div></div>`,
    async () => {
      const amt = Number($('#e_amt').value || 0);
      if (!amt) { toast('Enter an amount', true); return false; }
      const row = { on_date: $('#e_date').value, category: $('#e_cat').value,
                    detail: $('#e_detail').value.trim(), amount: amt };
      try {
        const r = await supa('expenses', { method: 'POST', headers: { Prefer: 'return=representation' }, body: row });
        OPS.expenses.unshift((r && r[0]) || row);
        toast('Expense recorded'); render();
      } catch (e) { toast(writeError(e), true); return false; }
    });
}

/* ---------- team: staff / attendance / payroll ---------- */
let teamTab = 'staff';

function viewTeam() {
  const tabs = ['staff', 'attendance'].concat(isOwner() ? ['payroll'] : []);
  return `
    <div class="head"><h2>Team</h2>
      <div class="sp">${isOwner() ? exportBar('team') : ''}
        ${teamTab === 'staff' && isOwner()
        ? '<button class="btn primary" id="newStaff">+ Add person</button>' : ''}
        ${teamTab === 'attendance' ? '<button class="btn primary" id="markAtt">Mark today</button>' : ''}
        ${teamTab === 'payroll' ? '<button class="btn primary" id="runPay">Generate this month</button>' : ''}
      </div></div>
    <div class="subtabs">${tabs.map(t =>
      `<button data-team="${t}" class="${teamTab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    ${teamTab === 'staff' ? staffTable() : teamTab === 'attendance' ? attendanceTable() : payrollTable()}`;
}

function staffTable() {
  if (!OPS.staff.length) return `<div class="empty">
    Nobody on the team yet. ${isOwner() ? 'Add your first person above.' : ''}</div>`;
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Name</th><th>Role</th><th>Phone</th>
      ${isOwner() ? '<th class="num">Base salary</th><th class="num">Commission</th>' : ''}
      <th class="num">Sales this month</th><th>Active</th>${isOwner() ? '<th></th>' : ''}</tr></thead>
    <tbody>${OPS.staff.map(s => `<tr>
      <td><div>${esc(s.name)}</div><div class="pid">${esc(s.email || s.uid || 'no login yet')}</div></td>
      <td><span class="pill ${esc(s.role)}">${esc(ROLE_LABEL[s.role] || s.role)}</span></td>
      <td class="muted">${esc(s.phone || '—')}</td>
      ${isOwner() ? `<td class="num">${money(s.base_salary)}</td>
        <td class="num">${s.commission_pct}%</td>` : ''}
      <td class="num">${money(staffSales(s.id, monthKey()))}</td>
      <td><span class="pill ${s.active ? 'on' : 'off'}">${s.active ? 'Yes' : 'No'}</span></td>
      ${isOwner() ? `<td style="text-align:right">
        <button class="btn ghost sm" data-sedit="${s.id}">Edit</button></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}

function attendanceTable() {
  const recent = OPS.attendance.slice(0, 60);
  if (!OPS.staff.length) return '<div class="empty">Add staff before marking attendance.</div>';
  if (!recent.length) return '<div class="empty">No attendance marked yet.</div>';
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Date</th><th>Person</th><th>Status</th><th class="num">Hours</th><th>Note</th></tr></thead>
    <tbody>${recent.map(a => {
      const s = OPS.staff.find(x => x.id === a.staff_id);
      return `<tr><td>${a.on_date}</td><td>${esc(s ? s.name : '—')}</td>
        <td><span class="pill ${a.status === 'present' ? 'on' : a.status === 'absent' ? 'off' : 'low'}">${esc(a.status)}</span></td>
        <td class="num">${a.hours || '—'}</td><td class="muted">${esc(a.note || '')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function payrollTable() {
  if (!OPS.payroll.length) return `<div class="empty">
    No payslips yet. Use <b>Generate this month</b> — it works out base salary plus
    commission on each person's sales. You approve and pay outside the system.</div>`;
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Month</th><th>Person</th><th class="num">Base</th><th class="num">Commission</th>
      <th class="num">Bonus</th><th class="num">Deduction</th><th class="num">Net</th><th>Status</th><th></th></tr></thead>
    <tbody>${OPS.payroll.map(p => {
      const s = OPS.staff.find(x => x.id === p.staff_id);
      return `<tr><td>${monthName(p.month)}</td><td>${esc(s ? s.name : '—')}</td>
        <td class="num">${money(p.base)}</td><td class="num">${money(p.commission)}</td>
        <td class="num">${money(p.bonus)}</td><td class="num">${money(p.deduction)}</td>
        <td class="num"><b>${money(p.net)}</b></td>
        <td><span class="pill ${p.status === 'paid' ? 'on' : p.status === 'approved' ? 'low' : 'off'}">${esc(p.status)}</span></td>
        <td style="text-align:right"><button class="btn ghost sm" data-pedit="${p.id}">Edit</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function wireTeam() {
  $$('[data-team]').forEach(b => b.onclick = () => { teamTab = b.dataset.team; render(); });

  /* founder-only: salaries and payslips are in here */
  wireExport('team', 'Team & payroll report', () => [
    { name: 'Staff',
      summary: [
        { k: 'People', v: OPS.staff.length },
        { k: 'Active', v: OPS.staff.filter(s => s.active).length },
        { k: 'Monthly salary bill', v: money(OPS.staff.filter(s => s.active)
            .reduce((t, s) => t + (s.base_salary || 0), 0)) }
      ],
      columns: [
        { header: 'Name', key: 'name' }, { header: 'Role', key: 'role' },
        { header: 'Email', key: 'email' }, { header: 'Phone', key: 'phone' },
        { header: 'Base salary', key: 'base_salary', type: 'money' },
        { header: 'Commission %', key: 'commission_pct', type: 'number' },
        { header: 'Sales this month', key: 'sales', type: 'money' },
        { header: 'Joined', key: 'joined_on', type: 'date' },
        { header: 'Active', key: 'act' }, { header: 'Has login', key: 'login' }
      ],
      rows: OPS.staff.map(s => Object.assign({}, s, {
        role: ROLE_LABEL[s.role] || s.role,
        sales: staffSales(s.id, monthKey()),
        act: s.active ? 'Yes' : 'No', login: s.uid ? 'Yes' : 'No'
      })) },
    { name: 'Payroll',
      columns: [
        { header: 'Month', key: 'month' }, { header: 'Person', key: 'who' },
        { header: 'Base', key: 'base', type: 'money' },
        { header: 'Commission', key: 'commission', type: 'money' },
        { header: 'Bonus', key: 'bonus', type: 'money' },
        { header: 'Deduction', key: 'deduction', type: 'money' },
        { header: 'Net', key: 'net', type: 'money' },
        { header: 'Status', key: 'status' }
      ],
      rows: OPS.payroll.map(p => Object.assign({}, p, {
        month: monthName(p.month),
        who: (OPS.staff.find(s => s.id === p.staff_id) || {}).name || ''
      })) },
    { name: 'Attendance',
      columns: [
        { header: 'Date', key: 'on_date', type: 'date' },
        { header: 'Person', key: 'who' }, { header: 'Status', key: 'status' },
        { header: 'Hours', key: 'hours', type: 'number' }, { header: 'Note', key: 'note' }
      ],
      rows: OPS.attendance.map(a => Object.assign({}, a, {
        who: (OPS.staff.find(s => s.id === a.staff_id) || {}).name || ''
      })) }
  ], 'Confidential — contains salary and payroll information.');

  const ns = $('#newStaff'); if (ns) ns.onclick = () => staffModal(null);
  $$('[data-sedit]').forEach(b => b.onclick = () =>
    staffModal(OPS.staff.find(s => s.id === b.dataset.sedit)));

  const ma = $('#markAtt'); if (ma) ma.onclick = markAttendance;
  const rp = $('#runPay'); if (rp) rp.onclick = generatePayroll;
  $$('[data-pedit]').forEach(b => b.onclick = () =>
    payslipModal(OPS.payroll.find(p => String(p.id) === b.dataset.pedit)));
}

function staffModal(s) {
  /* Belt and braces: the UI only shows this to founders, and the database
     refuses staff writes from anyone else regardless (staff_owner_write
     policy keyed on is_founder()). */
  if (!isOwner()) { toast('Only a founder can change the team', true); return; }
  const isNew = !s;
  openModal(isNew ? 'Add person' : 'Edit — ' + esc(s.name), `
    <div class="f">
      <div class="grid2">
        <div class="row"><label>Name</label><input id="st_name" value="${esc(s ? s.name : '')}"></div>
        <div class="row"><label>Role</label><select id="st_role">
          ${['founder','manager','sales','workshop'].map(r =>
            `<option value="${r}" ${s && (s.role === r || (r === 'founder' && s.role === 'owner')) ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>
          <div class="hint"><b>Founder</b> — everything, including salaries, payroll, settings and this screen.<br>
            <b>Manager</b> — products, stock, orders, billing and the team roster; no salaries, profit or settings.<br>
            <b>Sales</b> — their own sales, targets and tasks.<br>
            <b>Workshop</b> — their own tasks and the SOPs.</div></div>
        ${multiBranch() ? `<div class="row"><label>Branch</label><select id="st_branch">
          <option value="">All branches (founder)</option>
          ${DB.branches.filter(b => b.active).map(b => `<option value="${esc(b.id)}"
            ${s && s.branch_id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select><div class="hint">A manager or salesperson sees only their own branch.
          Leave on "All branches" for founders.</div></div>` : ''}
        <div class="row"><label>Phone</label><input id="st_phone" value="${esc(s ? s.phone || '' : '')}"></div>
        <div class="row"><label>Email</label><input id="st_email" value="${esc(s ? s.email || '' : '')}"></div>
        <div class="row"><label>Base salary (₹/month)</label><input id="st_base" type="number" min="0" value="${s ? s.base_salary : 0}"></div>
        <div class="row"><label>Commission (%)</label><input id="st_comm" type="number" min="0" step="0.5" value="${s ? s.commission_pct : 0}"></div>
      </div>
      <div class="row"><label>Login</label>
        ${s && s.uid
          ? `<input id="st_uid" value="${esc(s.uid)}">
             <div class="hint">This person has a working login. Clear this box only if they
               need to sign in from a different account.</div>`
          : `<input id="st_uid" value="" placeholder="No login yet" readonly>
             <div class="up" style="margin-top:8px">
               <span class="up-hint">They cannot sign in until a login exists.</span>
               <button type="button" class="btn primary sm" id="mkLogin"
                 style="margin-left:auto">Create login</button>
             </div>
             <div class="hint">Creates the account and sets a temporary password you hand over.
               Nothing is emailed.</div>`}
      </div>
      <div class="row"><label class="check"><input type="checkbox" id="st_active" ${!s || s.active ? 'checked' : ''}> Active</label>
        <div class="hint">Someone who left the team should be switched off here, not deleted —
          that keeps their attendance and payslip history.</div></div>
      ${isNew ? '' : `<div class="row" style="text-align:right">
        <button type="button" class="btn danger sm" id="stDel">Remove from team</button></div>`}
    </div>`, async () => {
    const row = {
      name: $('#st_name').value.trim(), role: $('#st_role').value,
      phone: $('#st_phone').value.trim(), email: $('#st_email').value.trim(),
      ...($('#st_branch') ? { branch_id: $('#st_branch').value || null } : {}),
      base_salary: Number($('#st_base').value || 0),
      commission_pct: Number($('#st_comm').value || 0),
      uid: $('#st_uid').value.trim() || null,
      active: $('#st_active').checked
    };
    if (!row.name) { toast('Name is required', true); return false; }
    try {
      if (isNew) {
        const r = await supa('staff', { method: 'POST', headers: { Prefer: 'return=representation' }, body: row });
        OPS.staff.push((r && r[0]) || row);
      } else {
        await saveRow('staff', Object.assign({ id: s.id }, row));
        Object.assign(s, row);
      }
      toast('Saved'); render();
    } catch (e) { toast(writeError(e), true); return false; }
  });

  /* Deleting is the nuclear option: the database cascades away their
     attendance, targets and payslips with them. Two guards: you cannot
     remove your own login (lockout), and the confirmation says exactly
     what is destroyed. "They left" is what the Active switch is for. */
  setTimeout(() => {
    const mk = $('#mkLogin');
    if (mk) mk.onclick = () => createLogin($('#st_email').value.trim(), $('#st_name').value.trim());

    const del = $('#stDel');
    if (!del) return;
    del.onclick = async () => {
      if (ME && s.id === ME.id) {
        toast('You cannot remove your own login — ask the other owner to do it', true);
        return;
      }
      if (!confirm(`Remove ${s.name} permanently?\n\nThis also deletes their attendance, targets and payslips. If they just left the team, press Cancel and switch Active off instead.`)) return;
      try {
        await deleteRow('staff', 'id', s.id);
        OPS.staff = OPS.staff.filter(x => x.id !== s.id);
        toast('Removed from the team');
        const m = document.querySelector('.modal'); if (m) m.remove();
        render();
      } catch (e) { toast(writeError(e), true); }
    };
  }, 20);
}

/* ---------- creating a login ----------
   Firebase accounts are created through a SECOND app instance. Creating a
   user on the main instance signs you in as them and throws the founder
   out mid-job; a secondary instance keeps this session untouched.

   Why this is safe: a Firebase account on its own grants nothing at all.
   Every policy in the database keys off my_role(), which reads the `staff`
   table — and only a founder can write that table. The account is the
   doorbell; the staff row is the key. */
function randomPassword() {
  const a = 'abcdefghijkmnpqrstuvwxyz', A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', n = '23456789';
  const pool = a + A + n, buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  /* guaranteed one of each class, then filled out */
  let out = a[buf[0] % a.length] + A[buf[1] % A.length] + n[buf[2] % n.length];
  for (let i = 3; i < 10; i++) out += pool[buf[i] % pool.length];
  return out;
}

async function createLogin(email, name) {
  if (!isOwner()) { toast('Only a founder can create a login', true); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    toast('Enter a valid email address first', true); return;
  }
  const btn = $('#mkLogin');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  const pw = randomPassword();
  try {
    /* a throwaway app instance, torn down straight after */
    const secondary = firebase.apps.find(a => a.name === 'mk')
      || firebase.initializeApp(FIREBASE_CONFIG, 'mk');
    const cred = await secondary.auth().createUserWithEmailAndPassword(email, pw);
    const uid = cred.user.uid;
    await secondary.auth().signOut();
    await secondary.delete().catch(() => {});

    const box = $('#st_uid');
    if (box) box.value = uid;               /* saved with the form */

    /* shown once — Firebase will never reveal this password again */
    const zone = $('#mkLogin') && $('#mkLogin').parentElement;
    if (zone) zone.innerHTML = `
      <div style="width:100%">
        <b style="display:block;margin-bottom:6px">Login created — hand these over now</b>
        <div class="pos-total" style="margin:0">
          <span>Email</span><b style="font-size:1rem">${esc(email)}</b>
          <span style="margin-left:14px">Password</span><b style="font-size:1rem">${esc(pw)}</b>
        </div>
        <div class="hint" style="margin-top:6px">This password is shown once and cannot be
          recovered — copy it before closing. ${esc(name || 'They')} should change it after
          signing in. Press <b>Save changes</b> to finish adding them to the team.</div>
      </div>`;
    toast('Login created');
  } catch (e) {
    const c = (e && e.code) || '';
    const msg =
      c === 'auth/email-already-in-use' ? 'That email already has a login — paste their existing UID instead, or use another address.'
      : c === 'auth/operation-not-allowed' ? 'Firebase is refusing new accounts. Turn on Email/Password sign-up in Firebase Console → Authentication → Sign-in method.'
      : c === 'auth/weak-password' ? 'Firebase rejected the generated password. Try again.'
      : (e && e.message) || 'Could not create the login';
    toast(msg, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Create login'; }
  }
}

function markAttendance() {
  const active = OPS.staff.filter(s => s.active);
  openModal('Attendance — ' + today(), `
    <div class="f"><div class="row"><label>Date</label><input id="a_date" type="date" value="${today()}"></div>
    ${active.map(s => `
      <div class="att-row">
        <span>${esc(s.name)}</span>
        <select data-att="${s.id}">
          ${['present','half','absent','leave','holiday'].map(x => `<option>${x}</option>`).join('')}
        </select>
      </div>`).join('')}</div>`, async () => {
    const on_date = $('#a_date').value;
    const rows = $$('[data-att]').map(sel => ({ staff_id: sel.dataset.att, on_date, status: sel.value }));
    try {
      await supa('attendance', { method: 'POST', body: rows,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      OPS.attendance = await supa('attendance?select=*&order=on_date.desc&limit=400');
      toast('Attendance saved'); render();
    } catch (e) { toast(writeError(e), true); return false; }
  });
}

async function generatePayroll() {
  const m = monthKey();
  const active = OPS.staff.filter(s => s.active);
  if (!active.length) return toast('No active staff', true);

  const rows = active.map(s => {
    const sold = staffSales(s.id, m);
    return {
      staff_id: s.id, month: m,
      base: s.base_salary,
      commission: Math.round(sold * (Number(s.commission_pct) || 0) / 100),
      bonus: 0, deduction: 0, status: 'draft'
    };
  });
  try {
    await supa('payroll', { method: 'POST', body: rows,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    OPS.payroll = await supa('payroll?select=*&order=month.desc');
    toast('Draft payslips generated for ' + monthName(m));
    render();
  } catch (e) { toast(writeError(e), true); }
}

function payslipModal(p) {
  const s = OPS.staff.find(x => x.id === p.staff_id);
  openModal('Payslip — ' + esc(s ? s.name : '') + ' · ' + monthName(p.month), `
    <div class="f"><div class="grid2">
      <div class="row"><label>Base</label><input id="p_base" type="number" value="${p.base}"></div>
      <div class="row"><label>Commission</label><input id="p_comm" type="number" value="${p.commission}"></div>
      <div class="row"><label>Bonus</label><input id="p_bonus" type="number" value="${p.bonus}"></div>
      <div class="row"><label>Deduction</label><input id="p_ded" type="number" value="${p.deduction}"></div>
      <div class="row"><label>Status</label><select id="p_status">
        ${['draft','approved','paid'].map(x => `<option ${p.status === x ? 'selected' : ''}>${x}</option>`).join('')}
      </select></div>
      <div class="row"><label>Paid on</label><input id="p_paid" type="date" value="${p.paid_on || ''}"></div>
    </div>
    <div class="row"><label>Note</label><input id="p_note" value="${esc(p.note || '')}"></div>
    <p class="hint">This records the payslip only — no money moves. Transfer through your
      bank or UPI, then mark it paid here.</p></div>`, async () => {
    const row = {
      id: p.id, base: Number($('#p_base').value || 0), commission: Number($('#p_comm').value || 0),
      bonus: Number($('#p_bonus').value || 0), deduction: Number($('#p_ded').value || 0),
      status: $('#p_status').value, paid_on: $('#p_paid').value || null, note: $('#p_note').value.trim()
    };
    try {
      await saveRow('payroll', row);
      OPS.payroll = await supa('payroll?select=*&order=month.desc');
      toast('Payslip saved'); render();
    } catch (e) { toast(writeError(e), true); return false; }
  });
}

/* ---------- tasks ---------- */
function taskTable(list) {
  if (!list.length) return '<div class="empty">Nothing outstanding.</div>';
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Task</th><th>Who</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
    <tbody>${list.map(t => {
      const s = OPS.staff.find(x => x.id === t.staff_id);
      const late = t.due_on && t.due_on < today() && t.status !== 'done';
      return `<tr><td><div>${esc(t.title)}</div>
          ${t.detail ? `<div class="pid">${esc(t.detail)}</div>` : ''}</td>
        <td class="muted">${esc(s ? s.name : '—')}</td>
        <td><span class="pill ${t.priority === 'high' ? 'off' : t.priority === 'low' ? '' : 'low'}">${esc(t.priority)}</span></td>
        <td class="${late ? 'warn-cell' : 'muted'}">${t.due_on || '—'}${late ? ' · late' : ''}</td>
        <td><select data-tstatus="${t.id}" style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:5px 8px;font-size:.76rem">
          ${['open','doing','done'].map(x => `<option ${t.status === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function viewTasks() {
  const mine = !isAdminRole();
  const list = mine ? OPS.tasks.filter(t => t.staff_id === (ME && ME.id)) : OPS.tasks;
  return `<div class="head"><h2>${mine ? 'My tasks' : 'Tasks'}</h2>
    ${isAdminRole() ? '<div class="sp"><button class="btn primary" id="newTask">+ New task</button></div>' : ''}</div>
    ${taskTable(list)}`;
}

function wireTasks() {
  const b = $('#newTask');
  if (b) b.onclick = () => openModal('New task', `
    <div class="f">
      <div class="row"><label>Title</label><input id="t_title"></div>
      <div class="row"><label>Detail</label><input id="t_detail"></div>
      <div class="grid2">
        <div class="row"><label>Assign to</label><select id="t_staff">
          <option value="">— unassigned —</option>
          ${OPS.staff.filter(s => s.active).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select></div>
        <div class="row"><label>Priority</label><select id="t_pri">
          <option>low</option><option selected>normal</option><option>high</option></select></div>
        <div class="row"><label>Due</label><input id="t_due" type="date"></div>
      </div></div>`, async () => {
    const row = { title: $('#t_title').value.trim(), detail: $('#t_detail').value.trim(),
      staff_id: $('#t_staff').value || null, priority: $('#t_pri').value,
      due_on: $('#t_due').value || null };
    if (!row.title) { toast('Title is required', true); return false; }
    try {
      const r = await supa('tasks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: row });
      OPS.tasks.unshift((r && r[0]) || row);
      toast('Task created'); render();
    } catch (e) { toast(writeError(e), true); return false; }
  });

  $$('[data-tstatus]').forEach(sel => sel.onchange = async () => {
    const id = sel.dataset.tstatus;
    try {
      await saveRow('tasks', { id: Number(id), status: sel.value,
        done_at: sel.value === 'done' ? new Date().toISOString() : null });
      const t = OPS.tasks.find(x => String(x.id) === id); if (t) t.status = sel.value;
      toast('Updated');
    } catch (e) { toast(writeError(e), true); }
  });
}

/* ---------- SOPs ---------- */
function viewSops() {
  const cats = [...new Set(OPS.sops.map(s => s.category))];
  return `<div class="head"><h2>SOPs</h2>
    ${isAdminRole() ? '<div class="sp"><button class="btn primary" id="newSop">+ New SOP</button></div>' : ''}</div>
    <p class="muted" style="margin-bottom:16px">How things are done here. Each one is visible
      only to the roles it applies to.</p>
    ${OPS.sops.length ? cats.map(c => `
      <div class="panel"><h3>${esc(c)}</h3>
        ${OPS.sops.filter(s => s.category === c).map(s => `
          <div class="sop">
            <div class="sop-head">
              <b>${esc(s.title)}</b>
              <span class="muted">${(s.for_roles || []).join(', ')}</span>
              ${isAdminRole() ? `<button class="btn ghost sm" data-sopedit="${s.id}">Edit</button>` : ''}
            </div>
            <pre class="sop-body">${esc(s.body)}</pre>
          </div>`).join('')}
      </div>`).join('') : '<div class="empty">No SOPs yet.</div>'}`;
}

function wireSops() {
  const b = $('#newSop');
  const form = s => `
    <div class="f">
      <div class="grid2">
        <div class="row"><label>Title</label><input id="sp_title" value="${esc(s ? s.title : '')}"></div>
        <div class="row"><label>Category</label><input id="sp_cat" value="${esc(s ? s.category : 'General')}"></div>
      </div>
      <div class="row"><label>Visible to</label>
        <div class="rolebox">${['owner','manager','sales','workshop'].map(r =>
          `<label class="check"><input type="checkbox" data-role="${r}"
            ${!s || (s.for_roles || []).includes(r) ? 'checked' : ''}> ${r}</label>`).join('')}</div></div>
      <div class="row"><label>Steps</label><textarea id="sp_body" style="min-height:220px">${esc(s ? s.body : '')}</textarea></div>
    </div>`;
  const save = s => async () => {
    const roles = $$('[data-role]').filter(c => c.checked).map(c => c.dataset.role);
    const row = { title: $('#sp_title').value.trim(), category: $('#sp_cat').value.trim() || 'General',
      body: $('#sp_body').value, for_roles: roles, updated_at: new Date().toISOString() };
    if (!row.title) { toast('Title is required', true); return false; }
    try {
      if (s) { await saveRow('sops', Object.assign({ id: s.id, version: s.version + 1 }, row)); Object.assign(s, row); }
      else {
        const r = await supa('sops', { method: 'POST', headers: { Prefer: 'return=representation' }, body: row });
        OPS.sops.push((r && r[0]) || row);
      }
      toast('Saved'); render();
    } catch (e) { toast(writeError(e), true); return false; }
  };
  if (b) b.onclick = () => openModal('New SOP', form(null), save(null));
  $$('[data-sopedit]').forEach(btn => btn.onclick = () => {
    const s = OPS.sops.find(x => String(x.id) === btn.dataset.sopedit);
    openModal('Edit SOP', form(s), save(s));
  });
}

/* ---------- leaderboards ---------- */
let boardTab = 'staff';

function viewBoards() {
  return `<div class="head"><h2>Leaderboards</h2></div>
    <div class="subtabs">
      <button data-board="staff"    class="${boardTab === 'staff' ? 'on' : ''}">Employees</button>
      <button data-board="customer" class="${boardTab === 'customer' ? 'on' : ''}">Customers</button>
    </div>
    ${boardTab === 'staff' ? staffBoard() : customerBoard()}`;
}

function staffBoard() {
  const m = monthKey();
  const rows = branchStaff().map(s => {
    const month = staffSales(s.id, m), all = staffSales(s.id);
    const t = (OPS.targets.find(x => x.staff_id === s.id && x.month === m) || {}).amount || 0;
    const att = OPS.attendance.filter(a => a.staff_id === s.id && a.on_date >= m);
    const present = att.filter(a => a.status === 'present').length;
    return { s, month, all, t, present, days: att.length,
             pct: t ? Math.min(100, Math.round(month / t * 100)) : null };
  }).sort((a, b) => b.month - a.month);

  if (!rows.length) return '<div class="empty">No active staff yet.</div>';
  return `<div class="tbl-wrap"><table>
    <thead><tr><th class="num">#</th><th>Person</th><th class="num">This month</th>
      <th>Target</th><th class="num">All time</th><th class="num">Days present</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      <td class="num"><b class="${i < 3 ? 'rank' : ''}">${i + 1}</b></td>
      <td><div>${esc(r.s.name)}</div><div class="pid">${esc(r.s.role)}</div></td>
      <td class="num"><b>${money(r.month)}</b></td>
      <td>${r.t ? `<div class="prog sm"><i style="width:${r.pct}%"></i></div>
            <span class="pid">${r.pct}% of ${money(r.t)}</span>` : '<span class="muted">no target</span>'}</td>
      <td class="num muted">${money(r.all)}</td>
      <td class="num">${r.present}/${r.days || '—'}</td>
    </tr>`).join('')}</tbody></table></div>
    ${isAdminRole() ? '<button class="btn ghost" id="setTargets" style="margin-top:14px">Set monthly targets</button>' : ''}`;
}

function customerBoard() {
  const list = branchCustomers();
  if (!list.length) return `<div class="empty">
    No customers${BRANCH ? ' at ' + esc(branchName(BRANCH)) : ''} yet — this fills up as
    orders come in, online or logged by hand.</div>`;
  return `${BRANCH ? `<p class="muted" style="margin-bottom:12px">Customers who bought at
      <b>${esc(branchName(BRANCH))}</b>. Someone who shops at both branches appears under each.</p>` : ''}
    <div class="tbl-wrap"><table>
    <thead><tr><th class="num">#</th><th>Customer</th><th>City</th>
      <th class="num">Orders</th><th class="num">Spend</th><th>Last order</th></tr></thead>
    <tbody>${list.map((c, i) => `<tr>
      <td class="num"><b class="${i < 3 ? 'rank' : ''}">${i + 1}</b></td>
      <td><div>${esc(c.name || 'Unknown')}</div><div class="pid">${esc(c.phone)}</div></td>
      <td class="muted">${esc(c.city || '—')}</td>
      <td class="num">${c.order_count}</td>
      <td class="num"><b>${money(c.spend)}</b></td>
      <td class="muted">${when(c.last_order)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function wireBoards() {
  $$('[data-board]').forEach(b => b.onclick = () => { boardTab = b.dataset.board; render(); });
  const st = $('#setTargets');
  if (st) st.onclick = () => {
    const m = monthKey();
    openModal('Targets — ' + monthName(m), `<div class="f">
      ${OPS.staff.filter(s => s.active).map(s => {
        const t = (OPS.targets.find(x => x.staff_id === s.id && x.month === m) || {}).amount || 0;
        return `<div class="att-row"><span>${esc(s.name)}</span>
          <input type="number" min="0" data-tgt="${s.id}" value="${t}" style="width:140px"></div>`;
      }).join('')}</div>`, async () => {
      const rows = $$('[data-tgt]').map(i => ({ staff_id: i.dataset.tgt, month: m, amount: Number(i.value || 0) }));
      try {
        await supa('targets', { method: 'POST', body: rows,
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
        OPS.targets = await supa('targets?select=*');
        toast('Targets saved'); render();
      } catch (e) { toast(writeError(e), true); return false; }
    });
  };
}
