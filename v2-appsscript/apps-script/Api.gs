/**
 * TOSS SPORTS v2 — API
 *
 * Every function here is reached through Code.gs, which has already
 * decided whether the caller is public or internal. Internal handlers
 * open with requireCan(); public handlers assume no identity and must
 * never return anything from staff, payroll, expenses, coupons or orders.
 */

/* ============================================================
   PUBLIC — the storefront
   ============================================================ */

/**
 * The shop. Only active products, and only the fields a customer needs:
 * cost price is deliberately absent, because a public endpoint that
 * returns margins hands competitors the business.
 */
function api_catalogue() {
  const cats = readTab('categories')
    .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
    .map(function (c) { return { id: c.id, name: c.name, sort: c.sort }; });

  const products = readTab('products')
    .filter(function (p) { return p.active; })
    .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
    .map(function (p) {
      const out = {
        id: p.id, name: p.name, category: p.category || 'bats', tier: p.tier,
        price: p.price, mrp: p.mrp, stock: p.stock,
        images: p.images || []
      };
      /* the spec blob carries wood, profile, weight, features … */
      if (p.data && typeof p.data === 'object') {
        Object.keys(p.data).forEach(function (k) {
          if (k !== 'cost') out[k] = p.data[k];
        });
      }
      return out;
    });

  return { products: products, categories: cats };
}

/** Only the settings a shop front legitimately needs. */
function api_publicSettings() {
  const PUBLIC_KEYS = ['whatsapp', 'instagram', 'free_ship_over', 'ship_fee',
                       'razorpay_key', 'announcement'];
  const out = {};
  readTab('settings').forEach(function (s) {
    if (PUBLIC_KEYS.indexOf(s.key) > -1) out[s.key] = s.value;
  });
  return out;
}

/**
 * Place an order.
 *
 * v1 accepted the total the browser sent, and the PRD flagged that as a
 * known risk (§9.2). Here the total is RECOMPUTED from the products tab
 * and the client's figure is ignored — a tampered price cannot become a
 * cheap order. The recomputed and submitted totals are compared and a
 * mismatch is recorded, so tampering is visible rather than silent.
 */
function api_placeOrder(payload) {
  const items = (payload && payload.items) || [];
  if (!items.length) throw new Error('The order has no items.');

  const byId = indexBy('products', 'id');
  const settings = api_publicSettings();

  let subtotal = 0;
  const priced = items.map(function (it) {
    const p = byId[it.id];
    if (!p) throw new Error('That product is no longer available.');
    if (!p.active) throw new Error(p.name + ' is not currently on sale.');
    const qty = Math.max(1, Math.min(20, Number(it.qty) || 1));
    const line = (Number(p.price) || 0) * qty;
    subtotal += line;
    return { id: p.id, name: p.name, qty: qty, price: Number(p.price) || 0, line: line };
  });

  /* coupon is re-validated here; the browser's word is not taken for it */
  let discount = 0, couponCode = '';
  if (payload.coupon) {
    const c = validateCoupon_(payload.coupon, subtotal);
    if (c.valid) { discount = c.discount; couponCode = c.code; }
  }

  const freeOver = Number(settings.free_ship_over) || 0;
  const shipping = subtotal >= freeOver ? 0 : (Number(settings.ship_fee) || 0);
  const total = Math.max(0, subtotal + shipping - discount);

  const claimed = Number(payload.total);
  if (claimed && Math.abs(claimed - total) > 1) {
    audit(null, 'orders', 'mismatch', '',
      'Submitted total ' + claimed + ' did not match computed ' + total);
  }

  const branch = defaultBranchId_();
  const order = {
    id: newOrderId(), created_at: nowIso(), branch_id: branch, staff_id: '',
    channel: payload.channel || 'web', status: 'new', paid: !!payload.paid,
    customer: payload.customer || {}, items: priced,
    subtotal: subtotal, shipping: shipping, discount: discount, total: total,
    coupon: couponCode, notes: payload.notes || ''
  };

  insertRow('orders', order);
  adjustStock(priced.map(function (i) { return { id: i.id, delta: -i.qty }; }));
  if (couponCode) bumpCouponUse_(couponCode);
  audit(null, 'orders', 'insert', order.id, 'Website order, ' + total);

  return { id: order.id, total: total, subtotal: subtotal,
           shipping: shipping, discount: discount };
}

/**
 * Coupon validation.
 * Returns only whether it works and by how much — the coupons tab is never
 * listed publicly, so a code cannot be discovered by reading a response.
 */
function api_validateCoupon(payload) {
  return validateCoupon_(payload && payload.code, Number(payload && payload.subtotal) || 0);
}

function validateCoupon_(code, subtotal) {
  const c = findRow('coupons', 'code', String(code || '').toUpperCase().trim());
  if (!c || !c.active) return { valid: false, reason: 'That code is not valid.' };
  if (subtotal < (Number(c.min_spend) || 0)) {
    return { valid: false, reason: 'Spend ₹' + c.min_spend + ' to use this code.' };
  }
  return { valid: true, code: c.code, discount: Number(c.discount) || 0, label: c.label || '' };
}

function bumpCouponUse_(code) {
  const c = findRow('coupons', 'code', code);
  if (c) updateRow('coupons', 'code', code, { uses: (Number(c.uses) || 0) + 1 });
}

/**
 * A game score earns a code. The code is returned only when the runs
 * actually reach the threshold, so it stays a surprise until earned —
 * the property v1 kept and the reason coupons are never listed.
 */
function api_claimReward(payload) {
  const runs = Number(payload && payload.runs) || 0;
  const won = readTab('coupons')
    .filter(function (c) { return c.active && c.unlock_runs && runs >= c.unlock_runs; })
    .sort(function (a, b) { return b.unlock_runs - a.unlock_runs; })
    .map(function (c) {
      return { code: c.code, discount: c.discount, min_spend: c.min_spend, label: c.label };
    });
  return { rewards: won };
}

function api_submitScore(payload) {
  const runs = Math.max(0, Math.min(999, Number(payload && payload.runs) || 0));
  insertRow('scores', {
    id: newId(), name: String((payload && payload.name) || 'Player').slice(0, 16),
    runs: runs, wickets: Number(payload.wickets) || 0,
    balls: Number(payload.balls) || 0, created_at: nowIso()
  });
  return { ok: true };
}

function api_leaderboard() {
  return readTab('scores')
    .sort(function (a, b) { return b.runs - a.runs; })
    .slice(0, 10)
    .map(function (s) { return { name: s.name, runs: s.runs, wickets: s.wickets }; });
}

function defaultBranchId_() {
  const b = readTab('branches').filter(function (x) { return x.is_default; })[0];
  return b ? b.id : 'chennai';
}

/* ============================================================
   INTERNAL — the Maze Room
   ============================================================ */

/** Everything the panel needs to draw itself, in one round trip. */
function api_bootstrap() {
  const u = requireUser();
  const can = CAN[u.role];
  const out = {
    me: { id: u.id, name: u.name, email: u.email, role: u.role, branch_id: u.branch_id },
    can: can,
    settings: {}, products: [], categories: [], branches: [],
    orders: [], staff: [], tasks: [], sops: [], scores: [], coupons: []
  };

  /* settings: the full set only for a founder */
  readTab('settings').forEach(function (s) {
    if (can.settings === 'all') out.settings[s.key] = s.value;
    else if (['whatsapp', 'free_ship_over', 'ship_fee', 'gst_rate',
              'hsn_code', 'invoice_prefix', 'gstin'].indexOf(s.key) > -1) {
      out.settings[s.key] = s.value;
    }
  });

  if (can.products)   out.products = readTab('products');
  if (can.categories) out.categories = readTab('categories');
  if (can.branches)   out.branches = readTab('branches');
  if (can.sales)      out.orders = branchVisibleTo(ordersVisibleTo(readTab('orders'), u), u);
  if (can.staff)      out.staff = scrubStaff(branchVisibleTo(readTab('staff'), u), u);
  if (can.tasks)      out.tasks = can.tasks === 'own'
    ? readTab('tasks').filter(function (t) { return t.staff_id === u.id; })
    : readTab('tasks');
  if (can.sops)       out.sops = readTab('sops').filter(function (s) {
    return s.active && (isAdmin(u) || (s.for_roles || []).indexOf(u.role) > -1);
  });
  if (can.scores)     out.scores = readTab('scores');
  if (can.coupons)    out.coupons = readTab('coupons');

  return out;
}

/** Payslips. The hard requirement: nobody but a founder sees another's. */
function api_payroll() {
  const g = requireCan('payroll', 'read');
  return payrollVisibleTo(readTab('payroll'), g.user);
}

function api_attendance() {
  const g = requireCan('attendance', 'read');
  const rows = readTab('attendance');
  return g.scope === 'own'
    ? rows.filter(function (r) { return r.staff_id === g.user.id; })
    : rows;
}

function api_expenses() {
  const g = requireCan('expenses', 'read');
  return branchVisibleTo(readTab('expenses'), g.user);
}

function api_audit() {
  requireCan('audit', 'read');
  return readTab('audit_log')
    .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); })
    .slice(0, 300);
}

/** Finance summary — founder only, by the matrix. */
function api_finance() {
  const g = requireCan('finance', 'read');
  const orders = branchVisibleTo(readTab('orders'), g.user)
    .filter(function (o) { return o.status !== 'cancelled'; });
  const byId = indexBy('products', 'id');

  let revenue = 0, cogs = 0, unknownCost = 0;
  const months = {};
  orders.forEach(function (o) {
    revenue += Number(o.total) || 0;
    const m = String(o.created_at).slice(0, 7);
    const row = months[m] || (months[m] = { month: m, orders: 0, revenue: 0, cogs: 0 });
    row.orders++; row.revenue += Number(o.total) || 0;
    (o.items || []).forEach(function (it) {
      const p = byId[it.id];
      if (p && p.cost != null && p.cost !== '') {
        const c = Number(p.cost) * (Number(it.qty) || 1);
        cogs += c; row.cogs += c;
      } else unknownCost++;
    });
  });

  const expenses = branchVisibleTo(readTab('expenses'), g.user)
    .reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
  const salaries = readTab('payroll')
    .filter(function (p) { return p.status === 'paid'; })
    .reduce(function (s, p) { return s + (Number(p.net) || 0); }, 0);

  return {
    revenue: revenue, cogs: cogs, expenses: expenses, salaries: salaries,
    net: revenue - cogs - expenses - salaries,
    unknownCost: unknownCost,
    months: Object.keys(months).sort().map(function (k) { return months[k]; })
  };
}

/**
 * customer_stats — computed, never stored. Sheets has no live views, so a
 * stored copy would drift out of date the moment an order was cancelled.
 */
function api_customerStats() {
  const g = requireCan('sales', 'read');
  const rows = branchVisibleTo(ordersVisibleTo(readTab('orders'), g.user), g.user)
    .filter(function (o) { return o.status !== 'cancelled'; });

  const m = {};
  rows.forEach(function (o) {
    const c = o.customer || {};
    const key = c.phone || c.name || 'unknown';
    const r = m[key] || (m[key] = { phone: c.phone || '', name: c.name || 'Unknown',
      city: c.city || '', order_count: 0, spend: 0, first_order: null, last_order: null });
    r.order_count++;
    r.spend += Number(o.total) || 0;
    if (!r.first_order || o.created_at < r.first_order) r.first_order = o.created_at;
    if (!r.last_order || o.created_at > r.last_order) r.last_order = o.created_at;
  });
  return Object.keys(m).map(function (k) { return m[k]; })
    .sort(function (a, b) { return b.spend - a.spend; });
}

/* ---------------- writes ---------------- */

function api_saveProduct(payload) {
  const g = requireCan('products', 'write');
  const p = payload.product || {};
  if (!p.id || !p.name) throw new Error('A product needs an id and a name.');

  const exists = findRow('products', 'id', p.id);
  const row = {
    id: p.id, name: p.name, category: p.category || 'bats', tier: p.tier || 'mid',
    price: p.price, mrp: p.mrp, cost: p.cost, stock: p.stock,
    active: !!p.active, sort: p.sort || 0,
    images: p.images || [], data: p.data || {}, updated_at: nowIso()
  };
  if (exists) updateRow('products', 'id', p.id, row);
  else insertRow('products', row);

  audit(g.user, 'products', exists ? 'update' : 'insert', p.id, p.name);
  return row;
}

function api_logSale(payload) {
  const g = requireCan('sales', 'write');
  const items = payload.items || [];
  const byId = indexBy('products', 'id');
  let subtotal = 0;
  const priced = items.map(function (it) {
    const p = byId[it.id];
    if (!p) throw new Error('Unknown product: ' + it.id);
    const qty = Math.max(1, Number(it.qty) || 1);
    subtotal += (Number(p.price) || 0) * qty;
    return { id: p.id, name: p.name, qty: qty, price: Number(p.price) || 0 };
  });

  const order = {
    id: newOrderId(), created_at: nowIso(),
    branch_id: g.user.branch_id || defaultBranchId_(),
    staff_id: g.user.id, channel: payload.channel || 'walkin',
    status: payload.status || 'new', paid: !!payload.paid,
    customer: payload.customer || {}, items: priced,
    subtotal: subtotal, shipping: 0, discount: Number(payload.discount) || 0,
    total: subtotal - (Number(payload.discount) || 0),
    coupon: '', notes: payload.notes || ''
  };
  insertRow('orders', order);
  adjustStock(priced.map(function (i) { return { id: i.id, delta: -i.qty }; }));
  audit(g.user, 'orders', 'insert', order.id, 'Logged by hand, ' + order.total);
  return order;
}

function api_setOrderStatus(payload) {
  const g = requireCan('sales', 'write');
  const o = findRow('orders', 'id', payload.id);
  if (!o) throw new Error('No such order.');
  if (!isAdmin(g.user) && o.staff_id !== g.user.id) {
    throw Forbidden('That is not your order.');
  }
  /* cancelling returns the stock, exactly like the v1 database trigger */
  if (payload.status === 'cancelled' && o.status !== 'cancelled') {
    adjustStock((o.items || []).map(function (i) {
      return { id: i.id, delta: Number(i.qty) || 1 };
    }));
  }
  updateRow('orders', 'id', payload.id, { status: payload.status });
  audit(g.user, 'orders', 'update', payload.id, 'Status → ' + payload.status);
  return { ok: true };
}

function api_saveStaff(payload) {
  const g = requireCan('staff', 'write');       /* founder only, by the matrix */
  const s = payload.staff || {};
  if (!s.name) throw new Error('A name is required.');
  const exists = s.id && findRow('staff', 'id', s.id);
  const row = {
    id: s.id || newId(), email: String(s.email || '').toLowerCase(), name: s.name,
    phone: s.phone || '', role: s.role || 'sales', branch_id: s.branch_id || '',
    base_salary: Number(s.base_salary) || 0, commission_pct: Number(s.commission_pct) || 0,
    joined_on: s.joined_on || nowIso().slice(0, 10),
    active: s.active !== false, created_at: exists ? exists.created_at : nowIso()
  };
  if (exists) updateRow('staff', 'id', row.id, row);
  else insertRow('staff', row);
  audit(g.user, 'staff', exists ? 'update' : 'insert', row.id, row.name + ' — ' + row.role);
  return row;
}

function api_saveAttendance(payload) {
  const g = requireCan('attendance', 'write');
  const rows = payload.rows || [];
  rows.forEach(function (r) {
    const existing = readTab('attendance').filter(function (a) {
      return a.staff_id === r.staff_id && a.on_date === r.on_date;
    })[0];
    if (existing) updateRow('attendance', 'id', existing.id, { status: r.status, hours: r.hours });
    else insertRow('attendance', { id: newId(), staff_id: r.staff_id, on_date: r.on_date,
      status: r.status, hours: r.hours || '', note: r.note || '' });
  });
  audit(g.user, 'attendance', 'update', '', rows.length + ' marked');
  return { ok: true, count: rows.length };
}

function api_saveExpense(payload) {
  const g = requireCan('expenses', 'write');
  const e = payload.expense || {};
  const row = {
    id: e.id || newId(), on_date: e.on_date || nowIso().slice(0, 10),
    branch_id: g.user.branch_id || defaultBranchId_(),
    category: e.category || 'Other', detail: e.detail || '',
    amount: Number(e.amount) || 0
  };
  if (e.id && findRow('expenses', 'id', e.id)) updateRow('expenses', 'id', e.id, row);
  else insertRow('expenses', row);
  audit(g.user, 'expenses', 'insert', row.id, row.category + ' ' + row.amount);
  return row;
}

function api_saveSetting(payload) {
  const g = requireCan('settings', 'write');    /* founder only */
  const key = payload.key, value = payload.value;
  if (!key) throw new Error('Which setting?');
  const existing = findRow('settings', 'key', key);
  if (existing) updateRow('settings', 'key', key, { value: value, updated_at: nowIso() });
  else insertRow('settings', { key: key, value: value, updated_at: nowIso() });
  audit(g.user, 'settings', 'update', key, 'Changed ' + key);
  return { ok: true };
}

function api_updateTask(payload) {
  const g = requireCan('tasks', 'read');
  const t = findRow('tasks', 'id', payload.id);
  if (!t) throw new Error('No such task.');
  /* a staff member may move their OWN task and nothing else — the same
     rule v1 expressed as a row-level policy */
  const mine = t.staff_id === g.user.id;
  if (!isAdmin(g.user) && !mine) throw Forbidden('That is not your task.');
  const patch = isAdmin(g.user) ? payload.patch : { status: payload.patch.status };
  updateRow('tasks', 'id', payload.id, patch);
  return { ok: true };
}

function api_ackSop(payload) {
  const u = requireUser();
  insertRow('sop_acks', { id: newId(), sop_id: payload.sop_id,
    staff_id: u.id, acked_at: nowIso() });
  return { ok: true };
}
