/* ============================================================
   TOSS SPORTS v2 — FRONT-END DATA LAYER

   Drops in where v1 used js/config.js + js/store-sync.js. Same function
   names, same return shapes, so the storefront and Maze Room UI need no
   changes: TossAPI speaks Apps Script instead of PostgREST.

   Two rules carried over from v1 and worth keeping:
     · the shop renders from the BAKED catalogue first and only then asks
       the network — a slow or dead backend can never blank the site
     · every request has a hard timeout, because a hanging fetch is worse
       than a failed one
   ============================================================ */

/* Set by build.js at publish time. Two URLs because the public storefront
   and the internal panel are separate deployments — see Auth.gs. */
const TOSS_API = {
  public:   'PUBLIC_WEB_APP_URL',     /* replaced at build */
  internal: 'INTERNAL_WEB_APP_URL'
};

const API_TIMEOUT_MS = 12000;         /* Apps Script cold starts run 1–3s */

const TossAPI = (function () {

  function url(surface) {
    return TOSS_API[surface] || TOSS_API.public;
  }

  /**
   * One call.
   *
   * Content-Type is text/plain ON PURPOSE. An Apps Script web app cannot
   * answer a CORS preflight, and application/json triggers one. text/plain
   * keeps the request "simple" so the browser sends it directly; the
   * script parses the JSON body itself. Changing this to application/json
   * makes every browser call fail while curl keeps working.
   */
  async function call(action, payload, opts) {
    opts = opts || {};
    const surface = opts.surface || 'public';
    const endpoint = url(surface);
    if (!endpoint || endpoint.indexOf('_WEB_APP_URL') > -1) {
      throw new Error('API URL not configured — run the build with your deployment URLs.');
    }

    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || API_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, payload: payload || {} }),
        credentials: surface === 'internal' ? 'include' : 'omit',
        redirect: 'follow',
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('The server returned ' + res.status);

      const body = await res.json();
      if (!body.ok) {
        const err = new Error(body.error || 'Request failed');
        err.forbidden = !!body.forbidden;
        throw err;
      }
      return body.data;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    call: call,
    /* the panel talks to the internal deployment */
    internal: function (action, payload) {
      return call(action, payload, { surface: 'internal', timeout: 20000 });
    }
  };
})();

/* ============================================================
   STOREFRONT — same names v1 exposed, so app.js is untouched
   ============================================================ */

let LIVE = { products: false, settings: false, categories: false, scores: false };

/** Baked at build time; the network only ever upgrades this. */
let CATEGORIES = (typeof BAKED_CATEGORIES !== 'undefined')
  ? BAKED_CATEGORIES : [{ id: 'bats', name: 'Bats', sort: 0 }];

function rowToProduct(r) {
  return Object.assign({}, r, {
    id: r.id, name: r.name, price: r.price, mrp: r.mrp,
    stock: r.stock, images: r.images || [], category: r.category || 'bats'
  });
}

async function syncCatalog() {
  try {
    const d = await TossAPI.call('catalogue');
    if (!d || !Array.isArray(d.products) || !d.products.length) return false;
    const mapped = d.products.map(rowToProduct).filter(function (p) { return p.id && p.name; });
    if (!mapped.length) return false;
    PRODUCTS.length = 0;
    mapped.forEach(function (p) { PRODUCTS.push(p); });
    if (Array.isArray(d.categories) && d.categories.length) CATEGORIES = d.categories;
    LIVE.products = true; LIVE.categories = true;
    return true;
  } catch (e) {
    console.warn('catalogue sync:', e.message);
    return false;
  }
}

async function syncSettings() {
  try {
    const s = await TossAPI.call('settings');
    if (!s) return false;
    if (s.whatsapp)               WA_NUMBER      = String(s.whatsapp);
    if (s.free_ship_over != null) FREE_SHIP_OVER = Number(s.free_ship_over);
    if (s.ship_fee != null)       SHIP_FEE       = Number(s.ship_fee);
    if (s.razorpay_key)           RAZORPAY_KEY   = String(s.razorpay_key);
    if (s.announcement)           STORE_NOTE     = String(s.announcement);
    LIVE.settings = true;
    return true;
  } catch (e) {
    console.warn('settings sync:', e.message);
    return false;
  }
}

async function syncStore() {
  const results = await Promise.all([syncCatalog(), syncSettings()]);
  if (results.some(Boolean)) console.info('Toss: live data', LIVE);
  else console.info('Toss: running on the baked catalogue (offline or not configured)');
  return LIVE;
}

/**
 * Send an order.
 *
 * The server recomputes every price from its own product tab and ignores
 * the total we send — so the confirmation may legitimately differ from
 * what the cart showed if a price changed mid-session. Return the
 * server's figures and let the UI show those.
 */
async function pushOrder(order) {
  try {
    const res = await TossAPI.call('placeOrder', {
      items: (order.items || []).map(function (i) { return { id: i.id, qty: i.qty }; }),
      customer: order.customer || {},
      coupon: order.coupon || '',
      total: order.total,
      channel: 'web',
      notes: order.notes || ''
    });
    return res;
  } catch (e) {
    console.warn('order push failed:', e.message);
    return null;      /* WhatsApp hand-off still happens — never block the sale */
  }
}

async function validateCouponRemote(code, subtotal) {
  try { return await TossAPI.call('validateCoupon', { code: code, subtotal: subtotal }); }
  catch (e) { return null; }
}

async function claimRewardRemote(runs) {
  try {
    const r = await TossAPI.call('claimReward', { runs: runs });
    return (r && r.rewards) || null;
  } catch (e) { return null; }
}

async function fetchScores(limit) {
  try {
    const rows = await TossAPI.call('leaderboard');
    return Array.isArray(rows) ? rows.slice(0, limit || 8) : null;
  } catch (e) { return null; }
}

async function pushScore(name, runs, wickets, balls) {
  try {
    await TossAPI.call('submitScore', { name: name, runs: runs, wickets: wickets, balls: balls });
    return true;
  } catch (e) { return false; }
}

/* ============================================================
   MAZE ROOM — replaces supa()/supaRpc()

   Identity is the browser's Google session against the internal
   deployment. There is no login form and no password to store: if the
   person is signed into a Workspace account on the domain, the script
   knows who they are; if not, the request is refused.
   ============================================================ */

const Maze = {
  bootstrap:      function ()  { return TossAPI.internal('bootstrap'); },
  payroll:        function ()  { return TossAPI.internal('payroll'); },
  attendance:     function ()  { return TossAPI.internal('attendance'); },
  expenses:       function ()  { return TossAPI.internal('expenses'); },
  finance:        function ()  { return TossAPI.internal('finance'); },
  customerStats:  function ()  { return TossAPI.internal('customerStats'); },
  audit:          function ()  { return TossAPI.internal('audit'); },

  saveProduct:    function (p) { return TossAPI.internal('saveProduct', { product: p }); },
  logSale:        function (o) { return TossAPI.internal('logSale', o); },
  setOrderStatus: function (id, status) {
                                 return TossAPI.internal('setOrderStatus', { id: id, status: status }); },
  saveStaff:      function (s) { return TossAPI.internal('saveStaff', { staff: s }); },
  saveAttendance: function (rows) { return TossAPI.internal('saveAttendance', { rows: rows }); },
  saveExpense:    function (e) { return TossAPI.internal('saveExpense', { expense: e }); },
  saveSetting:    function (k, v) { return TossAPI.internal('saveSetting', { key: k, value: v }); },
  updateTask:     function (id, patch) {
                                 return TossAPI.internal('updateTask', { id: id, patch: patch }); },
  ackSop:         function (id) { return TossAPI.internal('ackSop', { sop_id: id }); }
};

/**
 * Turns a rejection into something a person can act on. A refusal and a
 * breakage need different words — one means "ask a founder", the other
 * means "something is wrong with the system".
 */
function apiError(e) {
  if (!e) return 'Something went wrong.';
  if (e.forbidden) return e.message;
  if (e.name === 'AbortError') return 'The server took too long. Check your connection and try again.';
  if (/not configured/i.test(e.message)) return e.message;
  return 'Could not reach the server: ' + e.message;
}
