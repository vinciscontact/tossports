/* ============================================================
   TOSS — storefront ↔ Supabase

   The shop must never depend on the network being up. Everything
   here degrades: if Supabase is unreachable the site runs exactly
   as it did before, on the bundled catalogue and localStorage.
   Online, the Maze Room becomes the source of truth.
   ============================================================ */

let LIVE = { products: false, settings: false, scores: false };

/* Everything the storefront reads off a product that has no column of its
   own, with a value that is safe to render.

   Supabase keeps the sellable fields as columns and the rest of the spec in
   a free-form `data` blob. A bat created in the Maze Room and saved with
   that blob still empty arrives here with no wood, no weight and no ball at
   all — and the shop walked straight into it: pickupWords read p.weight[0]
   off undefined and threw inside the map that builds the grid, so one
   incomplete row stopped the whole catalogue from rendering and took the
   filters and the search results down with it.

   Filling the shape here, once, is what keeps a half-finished product a
   cosmetic problem — a card with a dash on it — instead of an outage. The
   Maze Room refuses to put a bat live without a wood, which is where it
   belongs; this is the floor underneath that. Empty arrays rather than
   invented numbers: every reader already has a sensible answer for "not
   known", and none of them should be told 780 grams by a default. */
const PRODUCT_SHAPE = {
  wood: '', profile: 'standard',
  /* `level` and `style` are the catalogue's own player vocabulary and they
     drive the shop's Level and Best-for filters. Empty, not guessed: a bat
     nobody has classified yet should be absent from those chips rather than
     silently filed under "beginner" and recommended to someone. */
  level: '', style: [],
  weight: [], ball: [], usage: [], features: [], badges: [],
  tagline: '', edge: '', spine: '', handle: '', finish: '',
  height: '', sweetSpot: '',
  rating: 0, reviews: 0, popularity: 0
};

/* Supabase keeps the queryable columns separate from the spec blob.
   Flatten back into the shape every view and the SVG renderer expect. */
function rowToProduct(r) {
  return Object.assign({}, PRODUCT_SHAPE, r.data || {}, {
    id: r.id, name: r.name,
    price: r.price, mrp: r.mrp, tier: r.tier,
    stock: r.stock, images: r.images || [], cost: r.cost,
    category: r.category || 'bats'
  });
}

/* Categories created in the Maze Room appear on the shop automatically.
   The bundled default is just Bats, which is also the offline fallback. */
let CATEGORIES = [{ id: 'bats', name: 'Bats', sort: 0 }];
async function syncCategories() {
  try {
    const rows = await supa('categories?select=*&order=sort.asc');
    if (Array.isArray(rows) && rows.length) { CATEGORIES = rows; return true; }
  } catch (e) { console.warn('categories sync:', e.message); }
  return false;
}

async function syncCatalog() {
  try {
    const rows = await supa('products?select=*&active=eq.true&order=sort.asc');
    if (!Array.isArray(rows) || !rows.length) return false;
    const mapped = rows.map(rowToProduct).filter(p => p.id && p.name);
    if (!mapped.length) return false;
    /* mutate in place — PRODUCTS is a const other modules already hold */
    PRODUCTS.length = 0;
    mapped.forEach(p => PRODUCTS.push(p));
    LIVE.products = true;
    return true;
  } catch (e) { console.warn('catalog sync:', e.message); return false; }
}

async function syncSettings() {
  try {
    const rows = await supa('settings?select=*');
    if (!Array.isArray(rows)) return false;
    const s = {};
    rows.forEach(r => s[r.key] = r.value);
    if (s.whatsapp)       WA_NUMBER      = String(s.whatsapp);
    if (s.free_ship_over != null) FREE_SHIP_OVER = Number(s.free_ship_over);
    if (s.ship_fee      != null) SHIP_FEE       = Number(s.ship_fee);
    if (s.razorpay_key)   RAZORPAY_KEY   = String(s.razorpay_key);
    if (s.announcement)   STORE_NOTE     = String(s.announcement);
    /* The database re-prices every web order from the catalogue, engraving
       included, so this number has to be the same on both sides. Reading it
       from settings is what stops the shown total and the recorded total
       drifting apart the day someone changes the price. */
    if (s.engraving_price != null) SERVICES.engraving.price = Number(s.engraving_price);
    /* Standard warranty months. Guarded against 0 and nonsense so that clearing
       the field in the Maze Room returns the site to "the period on your card"
       rather than advertising a zero-month warranty. */
    if (s.warranty_months != null && Number(s.warranty_months) > 0) {
      WARRANTY_MONTHS = Number(s.warranty_months);
    }
    LIVE.settings = true;
    return true;
  } catch (e) { console.warn('settings sync:', e.message); return false; }
}

/* ---------- play styles ----------
   Who each bat is for, as the Maze Room decided. Three small tables the
   shop turns into one row of chips per group. All of it degrades: with no
   connection PLAYSTYLES stays empty, the "Best for" filter simply does not
   render, and every other filter works exactly as before. */
let PLAYSTYLE_GROUPS = [];
let PLAYSTYLES = [];
let PROD_STYLES = {};        // { productId: [styleId, …] }

async function syncPlaystyles() {
  try {
    const [groups, styles, links] = await Promise.all([
      supa('playstyle_groups?select=*&order=sort.asc'),
      supa('playstyles?select=*&order=sort.asc'),
      supa('product_playstyles?select=product_id,playstyle_id')
    ]);
    if (!Array.isArray(groups) || !Array.isArray(styles)) return false;
    PLAYSTYLE_GROUPS = groups;
    PLAYSTYLES = styles;
    PROD_STYLES = {};
    (links || []).forEach(r => {
      (PROD_STYLES[r.product_id] = PROD_STYLES[r.product_id] || []).push(r.playstyle_id);
    });
    LIVE.playstyles = true;
    return true;
  } catch (e) { console.warn('playstyle sync:', e.message); return false; }
}

/* ---------- orders ---------- */
/* Recording an order must never block the customer. The WhatsApp hand-off
   and the confirmation screen happen regardless; this just makes the order
   show up in the Maze Room. */
async function pushOrder(order) {
  try {
    await supa('orders', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        id: order.id,
        customer: order.info || {},
        /* `engrave` travels with the line because the database re-prices the
           order from the catalogue, and an engraved bat costs more than a
           plain one. Dropping it here made the recomputed total too low and
           lost the text the workshop has to cut. */
        items: (order.items || []).map(l => {
          const p = byId(l.id) || {};
          /* `warranty` travels for the same reason `engrave` does: the
             database re-prices the order from the catalogue, and a bat
             with cover costs more than one without. Dropping it here
             would make the recomputed total too low and lose the plan
             the customer actually paid for. */
          return { id: l.id, name: p.name || l.id, price: p.price || 0,
                   qty: l.qty, variant: l.variant || null,
                   engrave: l.engrave || null,
                   warranty: l.warranty || null };
        }),
        subtotal: order.subtotal, shipping: order.shipping,
        discount: order.off || 0, total: order.total,
        coupon: order.coupon || null,
        method: order.method === 'wa' ? 'whatsapp' : order.method,
        channel: 'web',
        paid: order.method === 'online',
        /* Both of these are thrown away by orders_sanitise() on insert, and
           should be: a checkout that ran in the customer's browser cannot
           prove money moved. They are sent anyway so a staff-entered order
           still carries them, and so the shape of an order is one thing.

           payment_ref_claimed is the hint that survives. It is what the
           browser SAYS the payment was, stored under a name that says so,
           to be pasted into Razorpay's search rather than believed. What
           settles an order is the signed webhook — see sql/026. */
        payment_id: order.payment_id || null,
        payment_ref_claimed: order.payment_id || null
      }
    });
    return true;
  } catch (e) { console.warn('order not recorded:', e.message); return false; }
}

/* ---------- coupons ---------- */
/* Validated server-side so the discount rules cannot be edited in devtools.
   Falls back to the bundled table when offline. */
async function validateCouponRemote(code, subtotal) {
  try {
    const r = await supaRpc('validate_coupon', { p_code: code, p_subtotal: subtotal });
    const row = Array.isArray(r) ? r[0] : r;
    if (!row) return null;
    return { valid: !!row.valid, off: row.discount || 0, label: row.label, reason: row.reason };
  } catch (e) { return null; }
}

async function claimRewardRemote(runs) {
  try {
    const r = await supaRpc('claim_reward', { runs });
    return Array.isArray(r) ? r : [];
  } catch (e) { return null; }
}

/* ---------- leaderboard ---------- */
async function fetchScores(limit) {
  try {
    const r = await supa('scores?select=name,runs,wickets,created_at&order=runs.desc&limit=' + (limit || 8));
    if (!Array.isArray(r)) return null;
    LIVE.scores = true;
    return r.map(s => ({ name: s.name, runs: s.runs, wkts: s.wickets }));
  } catch (e) { return null; }
}

async function pushScore(name, runs, wkts, balls) {
  try {
    await supa('scores', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: { name: String(name).slice(0, 12), runs, wickets: wkts, balls: balls || 0 } });
    return true;
  } catch (e) { console.warn('score not saved online:', e.message); return false; }
}

/* ---------- boot ---------- */
async function syncStore() {
  const [c, s, k, ps] = await Promise.all([
    syncCatalog(), syncSettings(), syncCategories(), syncPlaystyles()
  ]);
  LIVE.categories = k;
  LIVE.playstyles = ps;
  if (c || s || k || ps) console.info('Toss: live data', LIVE);
  else console.info('Toss: running on bundled catalogue (offline or not configured)');
  return LIVE;
}
