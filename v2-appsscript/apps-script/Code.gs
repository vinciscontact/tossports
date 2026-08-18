/**
 * TOSS SPORTS v2 — ENTRY POINTS
 *
 * One script, deployed twice (see Auth.gs for why one deployment cannot
 * do both jobs). Which deployment is running is decided by a script
 * property, not by trusting anything in the request:
 *
 *     TOSS_SURFACE = 'public'   → storefront, anonymous, whitelist only
 *     TOSS_SURFACE = 'internal' → Maze Room, Google-verified identity
 *
 * A CORS note that catches most Apps Script APIs: web apps cannot send
 * custom response headers, so a browser preflight (OPTIONS) can never be
 * answered. The only way to avoid the preflight is to make the request
 * "simple" — which means posting with Content-Type: text/plain and
 * parsing the JSON body ourselves. The front end does exactly that; do
 * not "fix" it to application/json or every call will fail in the browser
 * while continuing to work from curl.
 */

const SURFACE_PROP = 'TOSS_SURFACE';

function surface_() {
  return PropertiesService.getScriptProperties().getProperty(SURFACE_PROP) || 'public';
}

/* ---------------- routing ---------------- */

const PUBLIC_ROUTES = {
  catalogue:      function ()  { return api_catalogue(); },
  settings:       function ()  { return api_publicSettings(); },
  placeOrder:     function (p) { return api_placeOrder(p); },
  validateCoupon: function (p) { return api_validateCoupon(p); },
  claimReward:    function (p) { return api_claimReward(p); },
  submitScore:    function (p) { return api_submitScore(p); },
  leaderboard:    function ()  { return api_leaderboard(); }
};

const INTERNAL_ROUTES = {
  bootstrap:      function ()  { return api_bootstrap(); },
  payroll:        function ()  { return api_payroll(); },
  attendance:     function ()  { return api_attendance(); },
  expenses:       function ()  { return api_expenses(); },
  finance:        function ()  { return api_finance(); },
  customerStats:  function ()  { return api_customerStats(); },
  audit:          function ()  { return api_audit(); },
  saveProduct:    function (p) { return api_saveProduct(p); },
  logSale:        function (p) { return api_logSale(p); },
  setOrderStatus: function (p) { return api_setOrderStatus(p); },
  saveStaff:      function (p) { return api_saveStaff(p); },
  saveAttendance: function (p) { return api_saveAttendance(p); },
  saveExpense:    function (p) { return api_saveExpense(p); },
  saveSetting:    function (p) { return api_saveSetting(p); },
  updateTask:     function (p) { return api_updateTask(p); },
  ackSop:         function (p) { return api_ackSop(p); }
};

/**
 * The single dispatcher. Both doGet and doPost land here so a GET and a
 * POST of the same action cannot diverge in what they permit.
 */
function handle_(action, payload) {
  const isInternal = surface_() === 'internal';

  if (!isInternal) {
    /* Public deployment: the whitelist is the entire defence. An internal
       action name reaching this surface is refused before it can run. */
    assertPublicAction(action);
    return PUBLIC_ROUTES[action](payload || {});
  }

  /* Internal deployment serves both sets: the panel also needs the
     catalogue, and every internal route guards itself. */
  const fn = INTERNAL_ROUTES[action] || PUBLIC_ROUTES[action];
  if (!fn) throw Forbidden('Unknown action.');
  return fn(payload || {});
}

function respond_(body, ok) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: ok !== false, data: body.data, error: body.error }))
    .setMimeType(ContentService.MimeType.JSON);
}

function run_(action, payload) {
  try {
    if (!action) throw new Error('No action given.');
    const data = handle_(action, payload);
    return respond_({ data: data });
  } catch (e) {
    /* A refusal and a crash must look different to the caller: the panel
       shows "ask a founder" for one and "something broke" for the other. */
    const msg = e && e.message ? e.message : String(e);
    console.error(action + ': ' + msg);
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false, error: msg, forbidden: !!(e && e.forbidden)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/** Reads. Also serves as the health check: ?action=ping */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping') {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, surface: surface_(), at: nowIso() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  let payload = {};
  if (p.payload) { try { payload = JSON.parse(p.payload); } catch (err) {} }
  return run_(p.action, payload);
}

/** Writes. Body arrives as text/plain to dodge the CORS preflight. */
function doPost(e) {
  let body = {};
  try {
    const raw = e && e.postData && e.postData.contents;
    if (raw) body = JSON.parse(raw);
  } catch (err) {
    return respond_({ error: 'Could not read the request.' }, false);
  }
  return run_(body.action, body.payload || {});
}

/* ---------------- one-time configuration ----------------
   Run whichever of these matches the deployment you are creating, from
   the Apps Script editor, before you deploy. */

function markAsPublicSurface() {
  PropertiesService.getScriptProperties().setProperty(SURFACE_PROP, 'public');
  Logger.log('This script now answers as the PUBLIC storefront API.');
}

function markAsInternalSurface() {
  PropertiesService.getScriptProperties().setProperty(SURFACE_PROP, 'internal');
  Logger.log('This script now answers as the INTERNAL Maze Room API.');
}
