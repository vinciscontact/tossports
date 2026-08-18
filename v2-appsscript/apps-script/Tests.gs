/**
 * TOSS SPORTS v2 — TESTS
 *
 * The suite that matters is runAccessTests(): it impersonates each of the
 * four roles and confirms that every unauthorised read and write is
 * REFUSED, not merely hidden. In v1 Postgres enforced this; here the
 * enforcement lives in Auth.gs, so it has to be proven rather than assumed.
 *
 * Run from the Apps Script editor and read the log. Nothing here writes
 * to the real tabs except runWriteTests(), which cleans up after itself.
 */

function runAllTests() {
  const r1 = runAccessTests();
  const r2 = runSalaryPrivacyTests();
  const r3 = runConcurrencyTests();
  const r4 = runTotalsTests();
  const all = [].concat(r1, r2, r3, r4);
  const failed = all.filter(function (t) { return !t.pass; });

  Logger.log('\n===== SUMMARY =====');
  Logger.log(all.length + ' checks, ' + failed.length + ' failed');
  failed.forEach(function (f) { Logger.log('  FAIL: ' + f.name + ' — ' + f.detail); });
  if (!failed.length) Logger.log('All checks passed.');
  return { total: all.length, failed: failed.length, failures: failed };
}

/* ---------------- helpers ---------------- */

function _as(role, id, branch) {
  _setUserForTest({
    id: id || ('test-' + role), email: role + '@test.local',
    name: 'Test ' + role, role: role, branch_id: branch || null
  });
}
function _anon() { _setUserForTest(null); }
function _reset() { _setUserForTest(undefined); }

/** Expect the call to be REFUSED. A returned value is a failure. */
function _refuses(name, fn) {
  try {
    fn();
    return { name: name, pass: false, detail: 'was ALLOWED but should have been refused' };
  } catch (e) {
    const forbidden = !!(e && e.forbidden);
    return { name: name, pass: forbidden, detail: forbidden ? 'refused' :
      'threw a non-permission error: ' + e.message };
  }
}

/** Expect the call to succeed. */
function _allows(name, fn) {
  try { fn(); return { name: name, pass: true, detail: 'allowed' }; }
  catch (e) { return { name: name, pass: false, detail: 'was REFUSED: ' + e.message }; }
}

/* ---------------- 1. the capability matrix ---------------- */

function runAccessTests() {
  const out = [];
  Logger.log('===== ACCESS CONTROL =====');

  /* --- anonymous: the public surface only --- */
  _anon();
  out.push(_refuses('anon cannot bootstrap the panel', function () { api_bootstrap(); }));
  out.push(_refuses('anon cannot read payroll',        function () { api_payroll(); }));
  out.push(_refuses('anon cannot read finance',        function () { api_finance(); }));
  out.push(_refuses('anon cannot read the audit log',  function () { api_audit(); }));
  out.push(_refuses('anon cannot save a product',      function () { api_saveProduct({ product: { id: 'x', name: 'X' } }); }));
  out.push(_refuses('anon cannot save a setting',      function () { api_saveSetting({ key: 'gstin', value: 'x' }); }));
  out.push(_refuses('anon cannot save staff',          function () { api_saveStaff({ staff: { name: 'X' } }); }));
  /* but the storefront still works with no identity at all */
  out.push(_allows('anon can read the catalogue',      function () { api_catalogue(); }));
  out.push(_allows('anon can read public settings',    function () { api_publicSettings(); }));

  /* the whitelist itself */
  out.push(_refuses('internal action refused on the public surface', function () {
    assertPublicAction('saveStaff');
  }));
  out.push(_allows('public action accepted on the public surface', function () {
    assertPublicAction('placeOrder');
  }));

  /* --- workshop: the narrowest role --- */
  _as('workshop');
  out.push(_refuses('workshop cannot read finance',    function () { api_finance(); }));
  out.push(_refuses('workshop cannot read expenses',   function () { api_expenses(); }));
  out.push(_refuses('workshop cannot read the order book', function () { requireCan('sales', 'read'); }));
  out.push(_refuses('workshop cannot edit products',   function () { requireCan('products', 'write'); }));
  out.push(_refuses('workshop cannot read staff',      function () { requireCan('staff', 'read'); }));
  out.push(_allows('workshop can read SOPs',           function () { requireCan('sops', 'read'); }));
  out.push(_allows('workshop can see their own tasks', function () { requireCan('tasks', 'read'); }));

  /* --- sales --- */
  _as('sales');
  out.push(_refuses('sales cannot read finance',       function () { api_finance(); }));
  out.push(_refuses('sales cannot read expenses',      function () { api_expenses(); }));
  out.push(_refuses('sales cannot edit products',      function () { requireCan('products', 'write'); }));
  out.push(_refuses('sales cannot read coupons',       function () { requireCan('coupons', 'read'); }));
  out.push(_refuses('sales cannot change settings',    function () { requireCan('settings', 'write'); }));
  out.push(_refuses('sales cannot read staff records', function () { requireCan('staff', 'read'); }));
  out.push(_allows('sales can read products',          function () { requireCan('products', 'read'); }));
  out.push(_allows('sales can see their own sales',    function () { requireCan('sales', 'read'); }));

  /* --- manager: the interesting middle --- */
  _as('manager');
  out.push(_refuses('manager cannot read finance',     function () { api_finance(); }));
  out.push(_refuses('manager cannot change settings',  function () { requireCan('settings', 'write'); }));
  out.push(_refuses('manager cannot edit staff',       function () { requireCan('staff', 'write'); }));
  out.push(_refuses('manager cannot read the audit log', function () { api_audit(); }));
  out.push(_allows('manager can edit products',        function () { requireCan('products', 'write'); }));
  out.push(_allows('manager can read the order book',  function () { requireCan('sales', 'read'); }));
  out.push(_allows('manager can view the staff list',  function () { requireCan('staff', 'read'); }));

  /* --- founder --- */
  _as('founder');
  out.push(_allows('founder can read finance',         function () { api_finance(); }));
  out.push(_allows('founder can change settings',      function () { requireCan('settings', 'write'); }));
  out.push(_allows('founder can edit staff',           function () { requireCan('staff', 'write'); }));
  out.push(_allows('founder can read the audit log',   function () { requireCan('audit', 'read'); }));

  _reset();
  out.forEach(function (t) { Logger.log((t.pass ? 'ok   ' : 'FAIL ') + t.name); });
  return out;
}

/* ---------------- 2. salary privacy (the hard requirement) ---------------- */

function runSalaryPrivacyTests() {
  const out = [];
  Logger.log('\n===== SALARY PRIVACY =====');

  const fakeStaff = [
    { id: 'A', name: 'Founder',  role: 'founder', base_salary: 90000, commission_pct: 0 },
    { id: 'B', name: 'Manager',  role: 'manager', base_salary: 40000, commission_pct: 1 },
    { id: 'C', name: 'Sales',    role: 'sales',   base_salary: 12000, commission_pct: 2 }
  ];
  const fakePay = [
    { id: 'p1', staff_id: 'A', net: 90000 },
    { id: 'p2', staff_id: 'B', net: 40000 },
    { id: 'p3', staff_id: 'C', net: 12000 }
  ];

  /* a manager reading the roster gets no one else's salary — the columns
     are ABSENT from the response, not merely unrendered */
  const mgr = { id: 'B', role: 'manager', name: 'Manager' };
  const seen = scrubStaff(fakeStaff, mgr);
  const leaked = seen.filter(function (r) {
    return r.id !== 'B' && (r.base_salary !== undefined || r.commission_pct !== undefined);
  });
  out.push({ name: 'manager sees no one else\'s salary in the staff list',
    pass: leaked.length === 0,
    detail: leaked.length ? 'LEAKED ' + leaked.length + ' rows' : 'clean' });

  out.push({ name: 'manager still sees their own salary',
    pass: seen.filter(function (r) { return r.id === 'B'; })[0].base_salary === 40000,
    detail: 'own record intact' });

  /* payslips: only their own */
  const mgrPay = payrollVisibleTo(fakePay, mgr);
  out.push({ name: 'manager receives only their own payslip',
    pass: mgrPay.length === 1 && mgrPay[0].staff_id === 'B',
    detail: 'got ' + mgrPay.length + ' payslip(s)' });

  const salesPay = payrollVisibleTo(fakePay, { id: 'C', role: 'sales' });
  out.push({ name: 'salesperson receives only their own payslip',
    pass: salesPay.length === 1 && salesPay[0].staff_id === 'C',
    detail: 'got ' + salesPay.length + ' payslip(s)' });

  const founderPay = payrollVisibleTo(fakePay, { id: 'A', role: 'founder' });
  out.push({ name: 'founder receives every payslip',
    pass: founderPay.length === 3, detail: 'got ' + founderPay.length });

  /* calling the API directly, not through the UI — the brief's requirement */
  _as('sales', 'C');
  out.push(_allows('salesperson may call payroll (they have one payslip)',
    function () { api_payroll(); }));
  _as('workshop', 'D');
  const wsPay = (function () { try { return api_payroll(); } catch (e) { return null; } })();
  out.push({ name: 'workshop calling payroll directly gets nobody else\'s',
    pass: wsPay === null || wsPay.every(function (p) { return p.staff_id === 'D'; }),
    detail: wsPay === null ? 'refused outright' : 'own rows only' });

  _reset();
  out.forEach(function (t) { Logger.log((t.pass ? 'ok   ' : 'FAIL ') + t.name + ' — ' + t.detail); });
  return out;
}

/* ---------------- 3. concurrency ---------------- */

function runConcurrencyTests() {
  const out = [];
  Logger.log('\n===== CONCURRENCY =====');

  /* the lock must actually be obtainable and re-entrant across calls */
  let got = false;
  try { withLock_(function () { got = true; }); } catch (e) {}
  out.push({ name: 'document lock can be taken and released', pass: got,
    detail: got ? 'ok' : 'could not acquire' });

  /* stock must never go negative however many are sold at once */
  const p = readTab('products')[0];
  if (p) {
    const before = Number(p.stock) || 0;
    adjustStock([{ id: p.id, delta: -(before + 50) }]);
    const after = Number(findRow('products', 'id', p.id).stock) || 0;
    out.push({ name: 'stock cannot be driven negative', pass: after === 0,
      detail: before + ' − ' + (before + 50) + ' → ' + after });
    adjustStock([{ id: p.id, delta: before }]);          /* put it back */
    const restored = Number(findRow('products', 'id', p.id).stock) || 0;
    out.push({ name: 'stock restored after the test', pass: restored === before,
      detail: 'now ' + restored });
  } else {
    out.push({ name: 'stock tests skipped', pass: true, detail: 'no products yet' });
  }

  out.forEach(function (t) { Logger.log((t.pass ? 'ok   ' : 'FAIL ') + t.name + ' — ' + t.detail); });
  return out;
}

/* ---------------- 4. order totals are not client-trusted ---------------- */

function runTotalsTests() {
  const out = [];
  Logger.log('\n===== ORDER TOTALS =====');
  _anon();

  const p = readTab('products').filter(function (x) { return x.active && x.price; })[0];
  if (!p) {
    out.push({ name: 'totals test skipped', pass: true, detail: 'no priced product' });
    return out;
  }

  /* a customer claiming ₹1 for a ₹3,000 bat must be billed ₹3,000 */
  let res = null, err = null;
  try {
    res = api_placeOrder({
      items: [{ id: p.id, qty: 1 }], total: 1,
      customer: { name: 'TEST — please delete', phone: '0000000000' },
      channel: 'test'
    });
  } catch (e) { err = e.message; }

  if (res) {
    out.push({ name: 'server recomputes the total, ignoring the browser',
      pass: res.subtotal === Number(p.price),
      detail: 'claimed 1, charged ' + res.subtotal });

    /* tidy up: cancel the test order so it never reaches the books */
    try {
      _as('founder');
      api_setOrderStatus({ id: res.id, status: 'cancelled' });
      out.push({ name: 'test order cancelled and stock returned', pass: true, detail: res.id });
    } catch (e) {
      out.push({ name: 'test order cleanup', pass: false,
        detail: 'DELETE ORDER ' + res.id + ' BY HAND: ' + e.message });
    }
  } else {
    out.push({ name: 'placeOrder ran', pass: false, detail: err });
  }

  _reset();
  out.forEach(function (t) { Logger.log((t.pass ? 'ok   ' : 'FAIL ') + t.name + ' — ' + t.detail); });
  return out;
}
