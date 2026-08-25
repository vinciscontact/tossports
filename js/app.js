/* ============================================================
   TOSS SPORTS — APP
   Hash router · filters · cart · bat finder · WhatsApp + Razorpay
   ============================================================ */

/* Defaults only. When Supabase is reachable these are replaced at boot by
   whatever is set in the Maze Room → Settings, so the shop can be retuned
   without touching code. See js/store-sync.js. */
let WA_NUMBER = '919176995707';
let FREE_SHIP_OVER = 1500;
let SHIP_FEE = 99;
let STORE_NOTE = '';

/* Set the live key in Maze Room → Settings → Razorpay key id. */
let RAZORPAY_KEY = 'rzp_test_REPLACE_WITH_YOUR_KEY';

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const app = $('#app');

/* ---------------- state ---------------- */
let cart = [];
try { cart = JSON.parse(localStorage.getItem('toss_cart') || '[]'); } catch (e) { cart = []; }
const saveCart = () => localStorage.setItem('toss_cart', JSON.stringify(cart));

let filters = { wood: [], profile: [], ball: [], tier: [], division: [], sort: 'pop', cat: 'bats' };
let lastOrder = null;

/* ---------- coupons earned in the gully cricket game ---------- */
const COUPONS = {
  GULLY50:  { off: 50,  min: 1200, runs: 30, label: '₹50 off' },
  GULLY100: { off: 100, min: 1800, runs: 50, label: '₹100 off' }
};
const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
let unlocked = readLS('toss_unlocked', []);
let coupon   = readLS('toss_coupon', null);           // the code, as a string
let couponMeta = readLS('toss_coupon_meta', null);    // {off,min} as the server stated them
const saveUnlocked = () => localStorage.setItem('toss_unlocked', JSON.stringify(unlocked));
const saveCoupon   = () => {
  localStorage.setItem('toss_coupon', JSON.stringify(coupon));
  localStorage.setItem('toss_coupon_meta', JSON.stringify(couponMeta));
};
const couponCode = () => coupon;

function couponOff() {
  /* single gate for every total on the site: the code must exist, be earned,
     and the cart must clear its minimum. NOTE: this is client-side only —
     re-validate on the server once there's a backend. */
  if (!coupon) return 0;
  /* Prefer the terms the database gave us — those were validated server-side.
     Fall back to the bundled table only when running offline. */
  if (couponMeta) return cartSubtotal() >= couponMeta.min ? couponMeta.off : 0;
  if (!COUPONS[coupon] || !unlocked.includes(coupon)) return 0;
  return cartSubtotal() >= COUPONS[coupon].min ? COUPONS[coupon].off : 0;
}
function grandTotal() { return cartSubtotal() + shipFee() - couponOff(); }

/* ---------------- utils ---------------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const byId = id => PRODUCTS.find(p => p.id === id);
const discount = p => (p.mrp && p.price) ? Math.round((1 - p.price / p.mrp) * 100) : 0;

function toast(msg) {
  const t = $('#toast');
  $('#toastIco').innerHTML = ICON.check;
  $('#toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- cart ---------------- */
function cartCount() { return cart.reduce((n, i) => n + i.qty, 0); }
function cartSubtotal() {
  return cart.reduce((n, i) => {
    const p = byId(i.id);
    if (!p || !p.price) return n;
    /* engraving is priced per bat, so it multiplies with qty like the bat does */
    return n + (p.price + (i.engrave ? SERVICES.engraving.price : 0)) * i.qty;
  }, 0);
}
function shipFee() {
  const s = cartSubtotal();
  return (s === 0 || s >= FREE_SHIP_OVER) ? 0 : SHIP_FEE;
}
function addToCart(id, variant, engrave) {
  const p = byId(id);
  if (!p) return;
  if (!hasPrice(p)) { enquire(p); return; }
  /* Engraved text is part of the line identity, not an attribute of it — two
     bats with different names on them are two lines, and must never merge
     into a quantity of 2. */
  engrave = String(engrave || '').trim().slice(0, SERVICES.engraving.maxChars);
  const key = id + '|' + (variant || '') + '|' + engrave;
  const hit = cart.find(i => i.key === key);
  if (hit) hit.qty++;
  else cart.push({ key, id, variant: variant || null, engrave: engrave || null, qty: 1 });
  saveCart(); syncCart();
  toast(p.name + ' added to bag');
  if (typeof trackEvent === 'function') trackEvent('add_to_cart',
    { currency: 'INR', value: p.price, items: [{ item_id: p.id, item_name: p.name }] });
  document.dispatchEvent(new CustomEvent('toss:cart'));
}
function setQty(key, d) {
  const i = cart.find(x => x.key === key);
  if (!i) return;
  i.qty += d;
  if (i.qty < 1) cart = cart.filter(x => x.key !== key);
  saveCart(); syncCart(); renderCart();
  if (location.hash.startsWith('#/checkout')) route();
}
function removeItem(key) {
  cart = cart.filter(x => x.key !== key);
  saveCart(); syncCart(); renderCart();
  if (location.hash.startsWith('#/checkout')) route();
}
function syncCart() {
  const n = cartCount(), dot = $('#cartDot');
  dot.textContent = n;
  dot.classList.toggle('hide', n === 0);
}
function variantName(p, vid) {
  if (!p.variants || !vid) return null;
  const v = p.variants.find(x => x.id === vid);
  return v ? v.name : null;
}

/* ---------------- WhatsApp ---------------- */
function waLink(text) {
  return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text);
}
function enquire(p) {
  /* the spec line only exists for bats — other categories just name the item */
  const spec = WOOD[p.wood] && PROFILE[p.profile]
    ? `\n(${WOOD[p.wood].label} · ${PROFILE[p.profile].label} · ${weightLabel(p)})` : '';
  window.open(waLink(
    `Hi Toss Sports 👋\n\nI want to know the price and availability of:\n*${p.name}*${spec}\n\nPlease share the details.`
  ), '_blank');
}
function cartWaText(info) {
  let t = 'Hi Toss Sports 👋\n\nI want to place this order:\n\n';
  cart.forEach((i, n) => {
    const p = byId(i.id);
    const v = variantName(p, i.variant);
    t += `${n + 1}. *${p.name}*${v ? ' — ' + v : ''}\n`;
    if (i.engrave) t += `   Engraved: "${i.engrave}" (+${fmt(SERVICES.engraving.price)} each)
`;
    t += `   Qty ${i.qty}`;
    t += hasPrice(p) ? ` × ${fmt(p.price)} = ${fmt(p.price * i.qty)}\n` : `  (price on request)\n`;
  });
  const sub = cartSubtotal(), sh = shipFee(), off = couponOff();
  t += `\nSubtotal: ${fmt(sub)}`;
  t += `\nShipping: ${sh === 0 ? 'FREE' : fmt(sh)}`;
  if (off > 0) t += `\nDiscount (${coupon}): −${fmt(off)}`;
  t += `\n*Total: ${fmt(sub + sh - off)}*\n`;
  if (info) {
    t += `\n— Delivery details —\n${info.name}\n${info.phone}\n${info.address}\n${info.city} — ${info.pin}\n${info.state}`;
    if (info.notes) t += `\nNote: ${info.notes}`;
  }
  t += `\n\nPlease confirm availability and dispatch.`;
  return t;
}

/* ---------------- filtering ---------------- */
const prodCat = p => p.category || 'bats';

/* ------------------------------------------------------------
   Divisions.

   Derived from the ball a bat is built for, which is data we
   already hold, rather than a new field somebody has to maintain
   for 29 products. A bat rated only for a soft tennis ball is a
   gully bat; one that will take a medium or hard ball is built
   for turf and tournament play.

   `p.division` overrides it, so the Maze Room can correct any bat
   the derivation gets wrong without touching this code.
   ------------------------------------------------------------ */
const DIVISION = {
  gully: { label: 'Gully & street', note: 'Soft tennis ball, concrete and matting' },
  pro:   { label: 'Turf & tournament', note: 'Medium and hard tennis ball' }
};
function division(p) {
  if (p.division) return p.division;
  return (p.ball || []).includes('medium') ? 'pro' : 'gully';
}

function filtered() {
  let list = PRODUCTS.filter(p => prodCat(p) === filters.cat);
  /* the spec filters describe bats — other categories are a plain grid */
  if (filters.cat === 'bats') list = list.filter(p =>
    (!filters.wood.length    || filters.wood.includes(p.wood)) &&
    (!filters.profile.length || filters.profile.includes(p.profile)) &&
    (!filters.ball.length    || filters.ball.some(b => (p.ball || []).includes(b))) &&
    (!filters.tier.length    || filters.tier.includes(p.tier)) &&
    (!filters.division.length || filters.division.includes(division(p)))
  );
  const s = filters.sort;
  /* "price on request" items always sink to the bottom, whichever way we sort */
  const lo = p => (p.price == null ?  Infinity : p.price);
  const hi = p => (p.price == null ? -Infinity : p.price);
  if (s === 'lo')      list.sort((a, b) => lo(a) - lo(b));
  else if (s === 'hi') list.sort((a, b) => hi(b) - hi(a));
  else if (s === 'light') list.sort((a, b) => (a.weight ? a.weight[0] : 1e9) - (b.weight ? b.weight[0] : 1e9));
  else if (s === 'rate')  list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return list;
}
function activeChips() {
  const out = [];
  filters.wood.forEach(v => out.push({ g: 'wood', v, l: WOOD[v].short }));
  filters.profile.forEach(v => out.push({ g: 'profile', v, l: PROFILE[v].label }));
  filters.ball.forEach(v => out.push({ g: 'ball', v, l: BALL_LABEL[v] }));
  filters.tier.forEach(v => out.push({ g: 'tier', v, l: TIER_LABEL[v] }));
  filters.division.forEach(v => out.push({ g: 'division', v, l: DIVISION[v].label }));
  return out;
}
/* filter state lives in the URL so filtered views are shareable and Back works */
const FKEYS = ['wood', 'profile', 'ball', 'tier', 'division'];

function shopURL() {
  const q = [];
  if (filters.cat !== 'bats') q.push('cat=' + filters.cat);
  FKEYS.forEach(k => { if (filters[k].length) q.push(k + '=' + filters[k].join(',')); });
  if (filters.sort !== 'pop') q.push('sort=' + filters.sort);
  return '#/shop' + (q.length ? '?' + q.join('&') : '');
}
function applyShopQuery(q) {
  filters.cat = q.cat || 'bats';
  FKEYS.forEach(k => { filters[k] = q[k] ? q[k].split(',').filter(Boolean) : []; });
  filters.sort = q.sort || 'pop';
}
function pushFilters() {
  try { history.replaceState(null, '', shopURL()); } catch (e) { /* file:// fallback */ }
  route(true);
}
function toggleFilter(g, v) {
  const a = filters[g];
  const i = a.indexOf(v);
  if (i > -1) a.splice(i, 1); else a.push(v);
  pushFilters();
}
function clearFilters() {
  FKEYS.forEach(k => { filters[k] = []; });
  pushFilters();
}

/* ---------------- components ---------------- */
/* ---------------- designed banner slides ----------------
   One asset, two treatments. Desktop gets the composition exactly as drawn,
   with transparent anchors sitting over the printed buttons so they actually
   click. Mobile can't read 10px baked text, so the artwork slides across to
   the product side, a scrim drops over it, and real HTML copy renders on top.
   Percentages are measured against the 1717x916 source, and the slide holds
   that aspect ratio on desktop so the hotspots stay aligned at any width. */
const WA_GROUP   = 'https://chat.whatsapp.com/JxcsJgTyLHw4exbmwXYZn4?s=sw&p=i&mlu=0&amv=1';
const IG_CHANNEL = 'https://www.instagram.com/channel/AbYHB6_4jOmcJVFv/';

/* ---------------- persuasion blocks ----------------
   Three tiers side by side rather than 29 bats. Hick's Law: the first
   decision on the page should be small. The middle option is marked as
   the popular one — the centre-stage effect reliably lifts people off
   the cheapest choice, which is also where the margin is better. */
function tierRowHTML() {
  const TIERS = [
    { id: 'entry',   name: 'Starter',  line: 'First proper bat',
      note: 'Street and soft tennis ball' },
    { id: 'mid',     name: 'Regular',  line: 'What most players buy',
      note: 'Soft and medium ball, weekend matches', star: true },
    { id: 'premium', name: 'Serious',  line: 'Tournament weapons',
      note: 'Big edges, custom weights, warranty' }
  ];
  const cards = TIERS.map(t => {
    const list = PRODUCTS.filter(p => p.tier === t.id && hasPrice(p));
    if (!list.length) return '';
    const from = Math.min(...list.map(p => p.price));
    const reviews = list.reduce((s, p) => s + (p.reviews || 0), 0);
    return `
      <a class="tier${t.star ? ' star' : ''}" href="#/shop?tier=${t.id}">
        ${t.star ? '<span class="tier-flag">Most picked</span>' : ''}
        <span class="tier-name">${t.name}</span>
        <span class="tier-line">${t.line}</span>
        <div class="tier-price"><small>from</small> ${fmt(from)}</div>
        <span class="tier-note">${t.note}</span>
        <span class="tier-meta">${list.length} bats · ${reviews} reviews</span>
        <span class="tier-go">See these ${ICON.arrow}</span>
      </a>`;
  }).join('');

  return `
  <section class="sec tiers-sec">
    <div class="wrap">
      <div class="sec-head rv">
        <p class="eyebrow">Start here</p>
        <h2 class="d2">How much bat do you need?</h2>
        <p class="sec-sub">Three honest brackets. Every one of them is made by us —
          the difference is the wood, the edges and how hard you intend to hit.</p>
      </div>
      <div class="tier-row rv">${cards}</div>
    </div>
  </section>`;
}

/* Evidence that other people already did this. For a first-time buyer from
   a small brand, this does more than any amount of copy. */
function socialProofHTML() {
  const priced = PRODUCTS.filter(p => p.reviews);
  const reviews = priced.reduce((s, p) => s + p.reviews, 0);
  const avg = priced.length
    ? (priced.reduce((s, p) => s + p.rating * p.reviews, 0) / reviews).toFixed(1)
    : '0';
  const top = PRODUCTS.slice().sort((a, b) => (b.reviews || 0) - (a.reviews || 0))[0];

  return `
  <section class="proof">
    <div class="wrap proof-grid">
      <div class="proof-i"><b>${avg}<span>★</span></b><span>Average rating</span></div>
      <div class="proof-i"><b>${reviews.toLocaleString('en-IN')}</b><span>Player reviews</span></div>
      <div class="proof-i"><b>${PRODUCTS.length}</b><span>Models in our unit</span></div>
      <div class="proof-i wide">
        <b>Most bought</b>
        <a href="#/product/${top.id}">${esc(top.name)} — ${top.reviews} reviews ${ICON.arrow}</a>
      </div>
    </div>
  </section>`;
}

/* Non-bat products have no spec-drawn art or bat vocabulary — their card
   is photo-led. The Maze Room refuses to publish one without a photo, so
   the placeholder branch only shows if that rule is ever bypassed. */
function genericCardHTML(p) {
  const off = discount(p);
  const img = (p.images || []).filter(Boolean)[0];
  return `
  <article class="card">
    <a href="#/product/${p.id}" class="card-art photo" aria-label="${esc(p.name)}">
      <div class="badges">${off >= 15 ? `<span class="badge b-off">${off}% OFF</span>` : ''}</div>
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`
            : `<span class="card-noimg" aria-hidden="true">📦</span>`}
    </a>
    <div class="card-b">
      <h3><a href="#/product/${p.id}">${esc(p.name)}</a></h3>
      ${p.tagline ? `<p class="card-tag">${esc(p.tagline)}</p>` : ''}
      ${p.description ? `<p class="card-tag">${esc(String(p.description).slice(0, 90))}</p>` : ''}
      <div class="card-foot">
        ${hasPrice(p)
          ? `<div class="price num">${fmt(p.price)}${p.mrp ? `<small>${fmt(p.mrp)}</small>` : ''}</div>`
          : `<div class="price por">Price on request</div>`}
        <button class="add" data-add="${p.id}" aria-label="Add ${esc(p.name)} to bag">
          ${hasPrice(p) ? ICON.cart : ICON.whatsapp}
        </button>
      </div>
    </div>
  </article>`;
}

function cardHTML(p) {
  if (prodCat(p) !== 'bats') return genericCardHTML(p);
  const off = discount(p);
  const badges = (p.badges || []).slice(0, 1)
    .map(b => `<span class="badge">${esc(b)}</span>`).join('');
  const offBadge = off >= 15 ? `<span class="badge b-off">${off}% OFF</span>` : '';
  return `
  <article class="card">
    <a href="#/product/${p.id}" class="card-art" aria-label="${esc(p.name)}">
      <div class="badges">${badges}${offBadge}</div>
      ${batArt(p)}
    </a>
    <div class="card-b">
      <span class="card-meta">${WOOD[p.wood].short} · ${(PROFILE_WORDS[p.profile] || PROFILE_WORDS.standard).b}</span>
      <h3><a href="#/product/${p.id}">${esc(p.name)}</a></h3>
      ${p.tagline ? `<p class="card-tag">${esc(p.tagline)}</p>` : ''}
      <!-- plain language first, the figure as fine print. "780 grams" means
           nothing to a first-time buyer; "Light pickup" is actionable. -->
      <div class="card-spec">
        <span><b>${pickupWords(p).b}</b><i>${pickupWords(p).s}</i>
          <u>${p.weight[0]}–${p.weight[1]}g</u></span>
        <span><b>${ballWords(p).b}</b><i>${ballWords(p).s}</i></span>
      </div>
      <div class="rate">${ICON.star}${p.rating}<span>(${p.reviews})</span></div>
      <div class="card-foot">
        ${hasPrice(p)
          ? `<div class="price num">${fmt(p.price)}${p.mrp ? `<small>${fmt(p.mrp)}</small>` : ''}
               ${p.mrp && p.mrp > p.price ? `<span class="save">Save ${fmt(p.mrp - p.price)}</span>` : ''}</div>`
          : `<div class="price por">Price on request</div>`}
        <button class="add" data-add="${p.id}" aria-label="Add ${esc(p.name)} to bag">
          ${hasPrice(p) ? ICON.cart : ICON.whatsapp}
        </button>
      </div>
    </div>
  </article>`;
}

function filterPanelHTML() {
  const count = (g, v) => PRODUCTS.filter(p => prodCat(p) === 'bats' &&
    (g === 'ball'     ? (p.ball || []).includes(v)
     : g === 'division' ? division(p) === v
     : p[g] === v)).length;
  const grp = (title, g, opts) => `
    <div class="fgroup">
      <b>${title}</b>
      ${opts.map(o => `
        <label class="chk">
          <input type="checkbox" data-f="${g}" value="${o.v}" ${filters[g].includes(o.v) ? 'checked' : ''}>
          <span>${o.l}</span><span class="n">${count(g, o.v)}</span>
        </label>`).join('')}
    </div>`;
  return (
    grp('Division', 'division',
      Object.keys(DIVISION).map(k => ({ v: k, l: DIVISION[k].label }))) +
    grp('Wood', 'wood', Object.values(WOOD).map(w => ({ v: w.key, l: w.label }))) +
    grp('Profile', 'profile', Object.values(PROFILE).map(w => ({ v: w.key, l: w.label }))) +
    grp('Ball Type', 'ball', [{ v: 'soft', l: 'Soft Tennis' }, { v: 'medium', l: 'Medium Tennis' }]) +
    `<div class="fgroup"><b>Price</b>
      ${['entry','mid','premium'].map(t => `
        <label class="chk">
          <input type="checkbox" data-f="tier" value="${t}" ${filters.tier.includes(t) ? 'checked' : ''}>
          <span>${TIER_LABEL[t]}</span>
          <span class="n">${PRODUCTS.filter(p => p.tier === t).length}</span>
        </label>`).join('')}
    </div>`
  );
}

/* ---------------- VIEW: HOME ----------------
   Section audit, Aug 2026. Removed:
     · "Pick your shape" (6 profile tiles) — asked the visitor to choose a
       category immediately after the tier row already had. Shape now lives
       in the shop filters and the footer, where a browser actually wants it.
     · Three carousel slides (Power X, "from ₹950", the quiz) — each repeated
       a full section further down, two of them word for word.
   Testimonials moved up beside the stats band so the evidence lands together. */
/* The making-line stage art. Stages 1–4 are hand-drawn here in the same
   wood tones the product renderer uses, so the billet that enters the line
   is visibly the same wood as the finished bat that leaves it (stage 5 IS
   the product renderer). */
function mkArt(stage) {
  const W = { lo: '#8E5A28', mid: '#C9884A', hi: '#E7B87E', grain: '#7A4A1E' };
  const open = `<svg viewBox="0 0 120 160" aria-hidden="true" class="mk-svg">`;
  const grain = (x, w, y0, y1, n) => Array.from({ length: n }, (_, i) =>
    `<line x1="${x + w * (i + 1) / (n + 1)}" y1="${y0}" x2="${x + w * (i + 1) / (n + 1)}" y2="${y1}"
      stroke="${W.grain}" stroke-width="1.4" opacity=".45"/>`).join('');

  if (stage === 'cleft') return `${open}
    <rect x="38" y="22" width="44" height="120" rx="7" fill="${W.mid}"/>
    <rect x="38" y="22" width="14" height="120" rx="7" fill="${W.hi}" opacity=".5"/>
    ${grain(38, 44, 30, 136, 4)}
    <ellipse cx="60" cy="22" rx="22" ry="7" fill="${W.hi}"/>
    <ellipse cx="60" cy="22" rx="13" ry="4" fill="none" stroke="${W.grain}" stroke-width="1.2" opacity=".55"/>
    <ellipse cx="60" cy="22" rx="6" ry="2" fill="none" stroke="${W.grain}" stroke-width="1" opacity=".5"/>
  </svg>`;

  if (stage === 'pressed') return `${open}
    <rect x="26" y="12" width="68" height="12" rx="3" fill="#1c1c2e"/>
    <rect x="26" y="136" width="68" height="12" rx="3" fill="#1c1c2e"/>
    <rect x="54" y="2" width="12" height="12" fill="#1c1c2e"/>
    <rect x="40" y="28" width="40" height="104" rx="6" fill="${W.mid}"/>
    <rect x="40" y="28" width="12" height="104" rx="6" fill="${W.hi}" opacity=".55"/>
    ${grain(40, 40, 34, 126, 3)}
    <line x1="34" y1="60" x2="28" y2="60" stroke="${W.hi}" stroke-width="2" opacity=".6"/>
    <line x1="86" y1="60" x2="92" y2="60" stroke="${W.hi}" stroke-width="2" opacity=".6"/>
    <line x1="34" y1="100" x2="28" y2="100" stroke="${W.hi}" stroke-width="2" opacity=".6"/>
    <line x1="86" y1="100" x2="92" y2="100" stroke="${W.hi}" stroke-width="2" opacity=".6"/>
  </svg>`;

  if (stage === 'profiled') return `${open}
    <rect x="53" y="8" width="14" height="34" rx="6" fill="${W.lo}"/>
    <path d="M60 36 L42 52 Q38 56 38 64 L38 132 Q38 142 48 142 L72 142 Q82 142 82 132 L82 64
      Q82 56 78 52 Z" fill="${W.mid}"/>
    <path d="M60 36 L42 52 Q38 56 38 64 L38 132 Q38 142 48 142 L54 142 L54 44 Z"
      fill="${W.hi}" opacity=".45"/>
    ${grain(44, 32, 62, 136, 3)}
    <path d="M24 120 q6 -4 4 -10 q-6 2 -4 10Z" fill="${W.hi}" opacity=".7"/>
    <path d="M96 90 q6 -4 4 -10 q-6 2 -4 10Z" fill="${W.hi}" opacity=".6"/>
    <path d="M27 74 q5 -3 3.5 -8 q-5 1.5 -3.5 8Z" fill="${W.hi}" opacity=".5"/>
  </svg>`;

  /* seasoned — the same profile, face toasted in bands, heat rising */
  return `${open}
    <rect x="53" y="8" width="14" height="34" rx="6" fill="${W.lo}"/>
    <path d="M60 36 L42 52 Q38 56 38 64 L38 132 Q38 142 48 142 L72 142 Q82 142 82 132 L82 64
      Q82 56 78 52 Z" fill="${W.mid}"/>
    <path d="M38 78 L82 78 L82 96 L38 96 Z" fill="${W.lo}" opacity=".55"/>
    <path d="M38 106 L82 106 L82 118 L38 118 Z" fill="${W.lo}" opacity=".4"/>
    <path d="M38 126 L82 126 L82 134 L38 134 Z" fill="${W.lo}" opacity=".3"/>
    <path d="M30 30 q4 -8 0 -16 M60 24 q4 -8 0 -16 M90 30 q4 -8 0 -16"
      transform="translate(0,26)" fill="none" stroke="#FF8A1E" stroke-width="2"
      stroke-linecap="round" opacity=".5"/>
  </svg>`;
}

function viewHome() {
  const best = PRODUCTS.filter(p => p.popularity >= 80)
    .sort((a, b) => b.popularity - a.popularity).slice(0, 8);
  const px = byId('power-x');
  const entry = PRODUCTS.filter(p => p.tier === 'entry').sort((a,b)=>b.popularity-a.popularity).slice(0, 6);

  /* THE HERO CAROUSEL — the coded night-match scene leads (live type,
     real buttons, the text Google reads), and the three designed banners
     slide in after it. Each banner is a whole-slide click on desktop
     (its baked buttons land on the slide's destination); below 900px the
     artwork becomes a backdrop and real HTML copy takes over — the same
     dual treatment the old banners used, driven by CSS that never left. */
  const bnSlide = (n, o) => `
    <div class="car-slide s-banner" data-href="${o.href}"${o.ext ? ' data-ext="1"' : ''}
         role="link" tabindex="0" aria-label="${esc(o.alt)}">
      <picture class="bn-pic">
        <source type="image/webp" srcset="images/hero/slide-${n}-800.webp 800w,
          images/hero/slide-${n}-1280.webp 1280w, images/hero/slide-${n}-1920.webp 1920w"
          sizes="100vw">
        <img src="images/hero/slide-${n}-1280.jpg"
          srcset="images/hero/slide-${n}-800.jpg 800w, images/hero/slide-${n}-1280.jpg 1280w,
            images/hero/slide-${n}-1920.jpg 1920w"
          sizes="100vw" alt="${esc(o.alt)}" loading="lazy" decoding="async">
      </picture>
      <div class="bn-live"><div class="wrap">${o.live}</div></div>
    </div>`;

  return `
  <section class="car dark" id="car" aria-roledescription="carousel" aria-label="Featured">
    <div class="car-track" id="carTrack">

      <div class="hero-live car-slide s-live" id="heroLive">
        <span class="hv-cone l"></span><span class="hv-cone r"></span>
        <span class="hv-lamp l"></span><span class="hv-lamp r"></span>
        <span class="hv-haze"></span>
        <span class="hv-embers" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <div class="wrap hv-grid">
          <div class="hv-copy">
            <p class="eyebrow hv-in s1">India's gully cricket ecosystem</p>
            <h1 class="d1 hv-in s2">From street cricket<span class="hl-2">to greatness.</span></h1>
            <p class="lede hv-in s3">29 bats shaped by hand in our own unit — Sri Lankan wood,
              Kashmir Willow and Poplar. From ₹950.</p>
            <div class="car-cta hv-in s4">
              <a href="#/shop" class="btn btn-primary">Shop All Bats ${ICON.arrow}</a>
              <a href="#/finder" class="btn btn-ghost">Find My Bat — 30s</a>
            </div>
            <p class="hv-proof hv-in s5">36.9K on Instagram · 4M reel reach · played by 170-player clubs</p>
          </div>
          <div class="hv-stage" id="hvStage">
            <span class="hv-ball"></span>
            <div class="hv-bat">${batArt(px || PRODUCTS[0], { glow: true, eager: true })}</div>
            <span class="hv-shadow"></span>
          </div>
        </div>
      </div>

      ${bnSlide(1, { href: '#/shop',
        alt: 'From street cricket to greatness — premium cricket gear built by Toss',
        live: `
          <p class="eyebrow">Premium cricket gear</p>
          <h2 class="d1">Built for players<span class="hl-2">who breathe it.</span></h2>
          <p class="lede">Bats, accessories and merchandise — straight from our unit.</p>
          <div class="car-cta">
            <a href="#/shop" class="btn btn-primary">Shop now ${ICON.arrow}</a>
          </div>` })}

      ${bnSlide(2, { href: WA_GROUP, ext: true,
        alt: 'Join the Toss community — 36.9K on Instagram, tournaments and teams',
        live: `
          <p class="eyebrow">More than cricket. A community.</p>
          <h2 class="d1">Join the<span class="hl-2">Toss community.</span></h2>
          <div class="bn-stats">
            <div><b>36.9K</b><span>Instagram</span></div>
            <div><b>24.5K</b><span>YouTube</span></div>
            <div><b>4M</b><span>Reel reach</span></div>
          </div>
          <div class="car-cta">
            <a href="${WA_GROUP}" target="_blank" rel="noopener" class="btn btn-wa">
              ${ICON.whatsapp} Join the group</a>
            <a href="${IG_CHANNEL}" target="_blank" rel="noopener" class="btn btn-ghost">
              ${ICON.insta} Tournaments</a>
          </div>` })}

      ${bnSlide(3, { href: '#/game',
        alt: 'Play and win — score in Gully Cricket and earn exciting offers',
        live: `
          <p class="eyebrow">Free to play</p>
          <h2 class="d1">Play &amp; win.<span class="hl-2">Earn offers.</span></h2>
          <p class="lede">The button-phone classic. Score 30 and a discount code unlocks.</p>
          <div class="car-cta">
            <a href="#/game" class="btn btn-primary">Play the game ${ICON.arrow}</a>
          </div>` })}

    </div>
    <button class="car-nav car-prev" id="carPrev" aria-label="Previous slide">${ICON.arrow}</button>
    <button class="car-nav car-next" id="carNext" aria-label="Next slide">${ICON.arrow}</button>
    <div class="car-dots" id="carDots">
      ${[0, 1, 2, 3].map(i => `<button data-go="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}
    </div>
    <div class="car-bar" id="carBar"></div>
  </section>

  <!-- Risk reduction, not feature listing. Each line answers a reason to
       hesitate, and is loss-framed where the loss is the real worry. -->
  <section class="trust">
    <div class="wrap trust-grid">
      <div class="trust-i">${ICON.hammer}<div><b>We make it, so we answer for it</b><span>Shaped in our own unit — never resold</span></div></div>
      <div class="trust-i">${ICON.whatsapp}<div><b>Not sure? Ask before you pay</b><span>Message us — no account, no card</span></div></div>
      <div class="trust-i">${ICON.truck}<div><b>Delivered across India</b><span>Free over ₹1,500 · 3–6 days</span></div></div>
      <div class="trust-i">${ICON.shield}<div><b>Breaks in 3 months? We replace it</b><span>Warranty on Toss Power X</span></div></div>
    </div>
  </section>

  ${tierRowHTML()}
  ${socialProofHTML()}

  ${testimonialsHTML()}

  <section class="sec" style="padding-top:0">
    <div class="wrap">
      <div class="sec-head row rv">
        <div><p class="eyebrow">Most ordered</p><h2 class="d2">Best sellers</h2></div>
        <a href="#/shop?sort=pop" class="link-arrow">See all ${ICON.arrow}</a>
      </div>
    </div>
    <div class="wrap"><div class="rail">${best.map(cardHTML).join('')}</div></div>
  </section>

  <section class="sec flag dark">
    <div class="wrap flag-grid">
      <div class="flag-art">
        <div class="flag-burst"></div>
        ${batArt(px)}
      </div>
      <div class="rv">
        <p class="eyebrow">The flagship</p>
        <h2 class="d2">Toss Power X</h2>
        <p class="lede">Three years of research packed into one blade. Triple hard seasoned,
          water resistant, science-induced rock toe and handle guard.</p>
        <ul>
          <li>${ICON.check}Molecules packed powerful bat</li>
          <li>${ICON.check}Triple hard seasoned, water resistant</li>
          <li>${ICON.check}Rock toe + handle guard</li>
          <li>${ICON.check}3 months assured warranty</li>
        </ul>
        <div class="editions">
          ${px.variants.map(v => `<div class="edition"><b>${v.name.replace(' Edition','')}</b><span>${v.weight[0]}–${v.weight[1]}g</span></div>`).join('')}
        </div>
        <div class="flag-price"><b>${fmt(px.price)}</b><s>${fmt(px.mrp)}</s></div>
        <div class="hero-cta" style="margin-top:20px">
          <a href="#/product/power-x" class="btn btn-primary">View Power X ${ICON.arrow}</a>
        </div>
      </div>
    </div>
  </section>

  ${communityHTML()}

  ${servicesBandHTML()}

  <section class="sec">
    <div class="wrap">
      <div class="finder-cta rv">
        <div>
          <h2 class="d3">Not sure which bat?</h2>
          <p>Answer 4 quick questions about your ball, your style and your budget.
             We'll shortlist the exact bats that suit you.</p>
        </div>
        <a href="#/finder" class="btn btn-dark">Start — 30 seconds ${ICON.arrow}</a>
      </div>
    </div>
  </section>

  <section class="sec" style="padding-top:0">
    <div class="wrap">
      <div class="sec-head row rv">
        <div><p class="eyebrow">Starting out</p><h2 class="d2">Under ₹1500</h2></div>
        <a href="#/shop?tier=entry" class="link-arrow">See all ${ICON.arrow}</a>
      </div>
    </div>
    <div class="wrap"><div class="rail">${entry.map(cardHTML).join('')}</div></div>
  </section>

  <section class="sec dark mk">
    <div class="wrap">
      <div class="sec-head rv">
        <p class="eyebrow">How we build</p>
        <h2 class="d2">We don't resell.<br>We make.</h2>
        <p class="lede">One billet of wood becomes your bat without ever leaving our unit.
          Follow it down the line.</p>
      </div>

      <!-- THE MAKING LINE — five stages on one conveyor. Every visual is
           drawn in code; the last stage is the real product renderer, so
           the line literally ends in the bat you can buy. A reseller has
           no equivalent of this section — that is the point of it. -->
      <div class="mk-line rv" aria-label="How a Toss bat is made">
        <span class="mk-belt" aria-hidden="true"></span>
        <div class="mk-stage">
          <span class="mk-n">01</span>
          <span class="mk-art">${mkArt('cleft')}</span>
          <b>Cleft</b>
          <p>Three woods, chosen per model — Sri Lankan, Kashmir Willow, Poplar.</p>
        </div>
        <div class="mk-stage">
          <span class="mk-n">02</span>
          <span class="mk-art">${mkArt('pressed')}</span>
          <b>Pressed</b>
          <p>Faces pressed in-house — never bought pre-finished from a trader.</p>
        </div>
        <div class="mk-stage">
          <span class="mk-n">03</span>
          <span class="mk-art">${mkArt('profiled')}</span>
          <b>Profiled</b>
          <p>Six profiles — scoop, flat, big edge, mongoose, twin &amp; triple blade.</p>
        </div>
        <div class="mk-stage">
          <span class="mk-n">04</span>
          <span class="mk-art">${mkArt('seasoned')}</span>
          <b>Seasoned</b>
          <p>Triple hard seasoning on the Power X line — built for the medium ball.</p>
        </div>
        <div class="mk-stage">
          <span class="mk-n">05</span>
          <span class="mk-art">${batSVG(byId('power-x') || PRODUCTS[0], { glow: false })}</span>
          <b>Finished</b>
          <p>Custom weight, scoop and colour on request — then it ships to you.</p>
        </div>
      </div>

      <div class="mk-foot rv">
        <span>29 models come off this line — from ₹950, direct price, no middleman.</span>
        <a class="btn btn-primary btn-sm" href="#/shop?profile=scoop">Customise yours ${ICON.arrow}</a>
      </div>
    </div>
  </section>

  ${trustBand()}
  `;
}

/* Testimonials sit directly under the stats band rather than at the foot of
   the page. Numbers and quotes together make one evidence block, placed where
   doubt actually needs answering — almost nobody scrolled far enough to read
   these where they used to live. */
function testimonialsHTML() {
  const REVIEWS = [
    ['Arun K.','Chennai','CWS','Best pickup I have used in this range. The Indian handle makes a real difference for control.'],
    ['Sathish R.','Bangalore','Flat Bat No-Spine','Ordered on WhatsApp, got it in 3 days. Sword look is exactly like the photos.'],
    ['Vignesh M.','Coimbatore','Toss Power X','Sixit edition. Middled everything from ball one. Worth the price.'],
    ['Rahul S.','Kerala','Kerala Scoop Double Blade','Double blade holds up to medium tennis. Nothing has cracked in 6 months.']
  ];
  return `
  <section class="sec" style="padding-top:34px">
    <div class="wrap">
      <div class="sec-head rv"><p class="eyebrow">From the ground</p><h2 class="d2">What players say</h2></div>
      <div class="grid rv">
        ${REVIEWS.map(r => `
          <div class="rev">
            <div class="rate">${ICON.star}${ICON.star}${ICON.star}${ICON.star}${ICON.star}</div>
            <p>“${r[3]}”</p>
            <div class="rev-who">
              <div class="rev-av">${r[0][0]}</div>
              <div><b>${r[0]}</b><span>${r[1]} · ${r[2]}</span></div>
            </div>
          </div>`).join('')}
      </div>
    </div>
  </section>`;
}

/* ---------------- TRUST BAND ----------------
   Spotlight + wall, no marquees. The old version drifted two conveyor
   belts of thumbnails past the visitor: authentic, but the best words a
   customer ever wrote were a green-and-white texture at marquee speed.
   Now the words lead. Every quote below is transcribed VERBATIM from a
   WhatsApp screenshot we hold, and tapping any quote opens that exact
   screenshot as proof. Club photos stopped being a separate row and
   became the wall's imagery; the reel keeps its slot inside the wall.

   Weight discipline is unchanged: the reel (0.78MB) is not fetched until
   the band is on screen, every image is lazy WebP, and contact names AND
   phone numbers inside the screenshots are blurred — the praise is
   public, the customer is not. */
const TRUST_SPOT = [
  { q: 'We won 7–8 turf tournaments… our lucky charm — Toss bats ❤️',
    who: 'Manoj', where: 'Ambattur · Power X + Holes bat', proof: 't4' },
  { q: 'There are almost 170 players going to use these bats.',
    who: 'Team order', where: 'four bats for a tournament squad', proof: 't1' },
  { q: 'It’s great, I loved it. Super performance.',
    who: 'Verified buyer', where: 'feedback after the first match', proof: 't3' },
];
const TRUST_WALL = [
  { q: 'Performance 💥💥💥 Played with Sixit ball and control is good.',
    who: 'Holes bat · unprompted feedback', proof: 't5', area: 'q1' },
  { q: 'Super haa irukka sir bat. Naa expect pannathu oda nalla irukka.',
    who: 'RDX buyer', proof: 't2', area: 'q2' },
  { q: 'Nalla eruku bro… 925 grms bat vanthuruku. Gud service broo 👏',
    who: 'Custom weight order', proof: 't6', area: 'q3' },
];
/* every WhatsApp screenshot we hold (names and numbers blurred) — the
   product page's review card draws from this set */
const TRUST_NOTES = ['t1', 't2', 't3', 't4', 't5', 't6'];
const TRUST_WALL_PHOTOS = [
  { img: 'm3', area: 'p1' }, { img: 'm1', area: 'p2' },
  { img: 'c1', area: 'p3' }, { img: 'm7', area: 'p4', extra: ' hide-sm' },
];

function trustBand() {
  const spot = TRUST_SPOT.map((s, i) => `
    <figure class="tbs-slide${i ? '' : ' on'}">
      <blockquote>“${s.q}”</blockquote>
      <figcaption>
        <b>${s.who}</b><span>${s.where}</span>
        <button class="tbs-proof" data-note="images/trust/${s.proof}.webp">
          ${ICON.whatsapp} See the actual chat</button>
      </figcaption>
    </figure>`).join('');
  const dots = TRUST_SPOT.map((_, i) => `
    <button class="tbs-dot${i ? '' : ' on'}" aria-label="Quote ${i + 1}"></button>`).join('');
  const quotes = TRUST_WALL.map(w => `
    <button class="tbw-q" style="grid-area:${w.area}"
            data-note="images/trust/${w.proof}.webp" aria-label="Read the full message">
      <p>“${w.q}”</p>
      <span class="tbw-meta"><span class="tbw-who">${w.who}</span>
        <span class="tbw-see">${ICON.whatsapp} Real chat</span></span>
    </button>`).join('');
  const photos = TRUST_WALL_PHOTOS.map(p => `
    <figure class="tbw-ph${p.extra || ''}" style="grid-area:${p.area}">
      <img src="images/trust/${p.img}.webp" alt="A club team with their Toss bats"
           loading="lazy" decoding="async">
    </figure>`).join('');

  return `
  <section class="tb">
    <div class="wrap">
      <div class="sec-head rv">
        <p class="eyebrow">Out in the middle</p>
        <h2 class="d2">Clubs, not ads.</h2>
        <p class="lede">Teams across Tamil Nadu and Karnataka play with these.
          Every word below is copied exactly from our WhatsApp — tap any of
          them to see the real chat.</p>
      </div>

      <div class="tb-spot" id="tbSpot">
        <div class="tbs-stage">${spot}</div>
        <div class="tbs-dots">${dots}</div>
      </div>

      <div class="tb-wall">
        ${quotes}
        ${photos}
        <div class="tbw-reel" style="grid-area:reel">
          <video id="tbVideo" class="tb-video" muted loop playsinline preload="none"
                 poster="images/reel/toss-reel-poster.jpg"
                 aria-label="Toss bats being finished in our unit"></video>
          <span class="tb-tag">In our unit</span>
        </div>
      </div>
    </div>
  </section>`;
}

let TB_TIMER = 0;
function wireTrust() {
  if (!document.querySelector('.tb')) return;
  clearInterval(TB_TIMER);   /* the home view can be re-rendered */

  /* spotlight rotation — pauses on hover/focus, stops entirely for
     reduced-motion users (the dots still work by hand) */
  const slides = $$('.tbs-slide'), dots = $$('.tbs-dot');
  let cur = 0, hold = false;
  const show = n => {
    cur = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('on', k === cur));
    dots.forEach((d, k) => d.classList.toggle('on', k === cur));
  };
  dots.forEach((d, k) => d.onclick = () => show(k));
  const spotEl = $('#tbSpot');
  if (spotEl) {
    spotEl.addEventListener('mouseenter', () => hold = true);
    spotEl.addEventListener('mouseleave', () => hold = false);
    spotEl.addEventListener('focusin', () => hold = true);
    spotEl.addEventListener('focusout', () => hold = false);
  }
  if (slides.length > 1 && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    TB_TIMER = setInterval(() => {
      if (!hold && document.visibilityState === 'visible') show(cur + 1);
    }, 6000);
  }

  /* The reel costs 780KB, so nothing is fetched until it is on screen.
     Someone who never scrolls this far downloads none of it. */
  const v = $('#tbVideo');
  if (v && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) { v.pause(); return; }
      if (!v.src) v.src = 'images/reel/toss-reel.mp4';
      v.play().catch(() => {});     /* autoplay refusal is fine — the poster stays */
    }), { rootMargin: '200px' }).observe(v);
  }

  $$('[data-note]').forEach(b => b.onclick = () => {
    const box = document.createElement('div');
    box.className = 'tb-lb';
    box.innerHTML = `<img src="${b.dataset.note}" alt="Customer message">
                     <button class="tb-lb-x" aria-label="Close">${ICON.close}</button>`;
    document.body.appendChild(box);
    document.body.classList.add('no-scroll');
    const close = () => { box.remove(); document.body.classList.remove('no-scroll'); };
    box.onclick = close;
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  });
}

/* ---------------- THE INDEX ----------------
   Type-led rather than picture-led, because 29 generated bats that differ by
   about 17% in blade width will always read as the same object when shown
   together. So the name carries the page, the spec numbers are the graphics,
   and the drawing is a small accent that no longer has to do the persuading.

   `.ix-shot` is the slot real photography drops into. Once photos exist the
   markup does not change — the image simply replaces the silhouette. */
/* Specs translated into something a first-time buyer can act on.
   "780 grams" tells you nothing unless you already know bats; "Heavy — hits
   hardest" does. The figure stays underneath for anyone who wants it, so
   nothing is hidden — the meaning just leads and the data supports it. */
function pickupWords(p) {
  const mid = (p.weight[0] + p.weight[1]) / 2;
  if (mid < 760) return { b: 'Light pickup', s: 'Fast swing, easy to control' };
  if (mid > 850) return { b: 'Heavy',        s: 'Hits hardest, tires you sooner' };
  return             { b: 'Balanced',   s: 'The range most players pick' };
}
function ballWords(p) {
  const soft = p.ball.includes('soft'), med = p.ball.includes('medium');
  if (soft && med) return { b: 'Soft or medium ball', s: 'Handles either' };
  if (med)         return { b: 'Medium ball',         s: 'Tournaments and turf' };
  return                { b: 'Soft ball',          s: 'Street and gully' };
}
const PROFILE_WORDS = {
  standard: { b: 'Classic shape',  s: 'All-round, nothing extreme' },
  scoop:    { b: 'Scooped back',   s: 'Lighter to swing for its size' },
  flat:     { b: 'Flat face',      s: 'Sword look, retro feel' },
  bigedge:  { b: 'Big edges',      s: 'Built for clearing the rope' },
  mongoose: { b: 'Short blade',    s: 'Long handle, fast hands' },
  multi:    { b: 'Layered blade',  s: 'Extra strength, lasts longer' }
};

/* Grouped by who the bat is for, so nobody weighs a ₹950 starter against a
   ₹2,999 flagship as if they were alternatives. Dropping the 01–29 numbering
   also removes a false ranking — it was only sort position, so switching to
   "price low to high" would have made "01" quietly mean cheapest. */
const SHOP_GROUPS = [
  { tier: 'entry',   title: 'Starting out',    sub: 'A first proper bat. Street games and soft tennis ball.' },
  { tier: 'mid',     title: 'Weekend matches', sub: 'Soft and medium ball, regular play, better wood.' },
  { tier: 'premium', title: 'Tournament bats', sub: 'Big edges, custom weights, and our warranty.' }
];

function groupedIndex(list) {
  const out = SHOP_GROUPS.map(g => {
    const rows = list.filter(p => p.tier === g.tier);
    if (!rows.length) return '';
    return `
      <div class="ix-group">
        <div class="ix-gh">
          <h2>${g.title}</h2>
          <p>${g.sub}</p>
          <span class="ix-gn">${rows.length} bat${rows.length === 1 ? '' : 's'}</span>
        </div>
        <div class="grid">${rows.map(cardHTML).join('')}</div>
      </div>`;
  }).filter(Boolean).join('');
  return out || `<div class="grid">${list.map(cardHTML).join('')}</div>`;
}

/* ---------------- VIEW: SHOP ---------------- */
/* One shop, many categories. Bats keep the full filter-and-group
   experience; every other category is a clean photo grid. The rail only
   lists categories that actually have live products, so an empty one
   never shows the customer a bare shelf. */
function shopCatsRail() {
  const cats = (typeof CATEGORIES !== 'undefined' ? CATEGORIES : [{ id: 'bats', name: 'Bats' }])
    .filter(c => c.id === 'bats' || PRODUCTS.some(p => prodCat(p) === c.id));
  if (cats.length < 2) return '';
  return `<div class="shop-cats" role="tablist" aria-label="Categories">
    ${cats.map(c => `
      <a class="shop-cat${filters.cat === c.id ? ' on' : ''}"
         href="#/shop${c.id === 'bats' ? '' : '?cat=' + c.id}">
        ${esc(c.name)}<i>${PRODUCTS.filter(p => prodCat(p) === c.id).length}</i>
      </a>`).join('')}
  </div>`;
}

function viewShop() {
  const list = filtered();
  const chips = activeChips();
  const isBats = filters.cat === 'bats';
  const title = isBats ? 'All Bats'
    : ((typeof CATEGORIES !== 'undefined' && (CATEGORIES.find(c => c.id === filters.cat) || {}).name) || 'Shop');

  const head = `
  <section class="shop-head">
    <div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Shop${isBats ? '' : ' / ' + esc(title)}</div>
      <h1 class="d2">${esc(title)}</h1>
      <p class="lede" style="margin-top:10px">${isBats
        ? 'Every model we make, filterable by wood, profile, ball type and budget.'
        : 'Straight from our unit — order on WhatsApp or pay online.'}</p>
      ${shopCatsRail()}
    </div>
  </section>`;

  if (!isBats) return `${head}
  <section class="shop-body">
    <div class="wrap">
      ${list.length
        ? `<div class="grid">${list.map(cardHTML).join('')}</div>`
        : `<div class="empty"><b>Nothing here yet</b>
             <p>This shelf is being stocked — message us on WhatsApp for first pick.</p>
             <a href="https://wa.me/${WA_NUMBER}" target="_blank" rel="noopener"
                class="btn btn-primary btn-sm" style="margin-top:14px">${ICON.whatsapp} Ask us</a></div>`}
    </div>
  </section>`;

  return `${head}
  <section class="shop-body">
    <div class="wrap">
      <div class="shop-layout">
        <aside class="side" id="sideFilters">${filterPanelHTML()}</aside>
        <div>
          <div class="filter-bar">
            <button class="btn btn-ghost btn-sm f-open" id="fOpen">${ICON.filter} Filter${chips.length ? ' (' + chips.length + ')' : ''}</button>
            <select class="sel" id="sortSel">
              <option value="pop"${filters.sort==='pop'?' selected':''}>Most popular</option>
              <option value="lo"${filters.sort==='lo'?' selected':''}>Price: low to high</option>
              <option value="hi"${filters.sort==='hi'?' selected':''}>Price: high to low</option>
              <option value="light"${filters.sort==='light'?' selected':''}>Lightest first</option>
              <option value="rate"${filters.sort==='rate'?' selected':''}>Top rated</option>
            </select>
            <span class="count num">${list.length} bat${list.length === 1 ? '' : 's'}</span>
          </div>

          ${chips.length ? `<div class="pills">
            ${chips.map(c => `<span class="pill">${esc(c.l)}
              <button data-chip="${c.g}:${c.v}" aria-label="Remove">${ICON.close}</button></span>`).join('')}
            <button class="pill clear" id="clearAll">Clear all</button>
          </div>` : ''}

          ${list.length
            ? groupedIndex(list)
            : `<div class="empty"><b>No bats match that</b>
                 <p>Try loosening a filter — or let us pick for you.</p>
                 <a href="#/finder" class="btn btn-primary btn-sm" style="margin-top:14px">Find My Bat</a></div>`}
        </div>
      </div>
    </div>
  </section>`;
}

/* ---------------- VIEW: PRODUCT ---------------- */
/* Gallery built for photography that does not exist yet. With no images it
   shows the generated art and hides the thumbnail strip entirely; the moment
   `images` has entries the same markup becomes a real gallery. Nothing here
   needs rewriting when the shoot happens. */
function galleryHTML(p, off) {
  const imgs = (p.images || []).filter(Boolean);
  const badges = `
    <div class="badges">
      ${(p.badges || []).map(b => `<span class="badge">${esc(b)}</span>`).join('')}
      ${off >= 15 ? `<span class="badge b-off">${off}% OFF</span>` : ''}
    </div>`;

  const main = imgs.length
    ? `<img id="pdpMain" src="${esc(imgs[0])}" alt="${esc(p.name)}" fetchpriority="high">`
    : `<div id="pdpMain" class="pdp-art">${batSVG(p)}</div>`;

  /* Thumbnails sit BESIDE the photo on a wide screen rather than under
     it. On a 2000px monitor a full-width white panel left the bat
     stranded in a sea of empty white with the other shots pushed so far
     down they read as decoration. Beside it, they are the first thing
     the eye finds after the product. */
  return `
  <div class="pdp-gal${imgs.length > 1 ? ' with-thumbs' : ''}">
    ${imgs.length > 1 ? `
      <div class="pdp-thumbs" role="group" aria-label="Product images">
        ${imgs.map((src, i) => `
          <button class="pdp-th${i === 0 ? ' on' : ''}" data-img="${esc(src)}"
                  aria-label="View image ${i + 1} of ${imgs.length}">
            <img src="${esc(src)}" alt="" loading="lazy" decoding="async">
          </button>`).join('')}
      </div>` : ''}
    <div class="pdp-stage${imgs.length ? ' has-photo' : ''}">
      ${badges}${main}
      ${imgs.length ? `
        <button class="pdp-zoom" id="pdpZoom" aria-label="Zoom this photo">
          ${ICON.search}<span>Zoom</span>
        </button>` : ''}
    </div>
  </div>`;
}

/* ---------------- the zoom viewer ----------------
   Opens the photo full screen. Scroll or pinch to zoom, drag to move
   around, arrow keys or the strip to change shot, Escape to leave.
   Built here rather than pulled in as a library because it is about
   sixty lines and a library would be heavier than the photos. */
function openZoom(images, startAt, name) {
  if (!images || !images.length) return;
  let i = startAt || 0, scale = 1, tx = 0, ty = 0;

  const box = document.createElement('div');
  box.className = 'zoom';
  box.innerHTML = `
    <div class="zoom-bar">
      <span class="zoom-count">${i + 1} / ${images.length}</span>
      <span class="zoom-hint">Scroll to zoom · drag to move</span>
      <button class="zoom-x" aria-label="Close">${ICON.close}</button>
    </div>
    <div class="zoom-stage">
      <img class="zoom-img" src="${esc(images[i])}" alt="${esc(name || '')}" draggable="false">
    </div>
    ${images.length > 1 ? `
      <div class="zoom-strip">
        ${images.map((s, k) => `<button class="zoom-th${k === i ? ' on' : ''}" data-k="${k}">
          <img src="${esc(s)}" alt="" loading="lazy"></button>`).join('')}
      </div>` : ''}`;
  document.body.appendChild(box);
  document.body.classList.add('no-scroll');

  const img = box.querySelector('.zoom-img');
  const count = box.querySelector('.zoom-count');
  const apply = () => {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.classList.toggle('zoomed', scale > 1);
  };
  const clampPan = () => {
    /* keep the photo from being dragged off screen entirely */
    const lim = 160 * scale;
    tx = Math.max(-lim, Math.min(lim, tx));
    ty = Math.max(-lim, Math.min(lim, ty));
  };
  const zoomTo = v => {
    scale = Math.max(1, Math.min(4, v));
    if (scale === 1) { tx = 0; ty = 0; }
    clampPan(); apply();
  };
  const show = k => {
    i = (k + images.length) % images.length;
    img.src = images[i];
    scale = 1; tx = 0; ty = 0; apply();
    if (count) count.textContent = (i + 1) + ' / ' + images.length;
    $$('.zoom-th', box).forEach((t, n) => t.classList.toggle('on', n === i));
  };

  box.querySelector('.zoom-x').onclick = close;
  $$('.zoom-th', box).forEach(t => t.onclick = () => show(+t.dataset.k));

  /* click the photo to step the zoom, click the backdrop to leave */
  box.querySelector('.zoom-stage').addEventListener('click', e => {
    if (e.target === img) zoomTo(scale >= 4 ? 1 : scale + 1);
    else close();
  });

  box.addEventListener('wheel', e => {
    e.preventDefault();
    zoomTo(scale + (e.deltaY < 0 ? 0.3 : -0.3));
  }, { passive: false });

  /* drag to pan, mouse and touch through pointer events */
  let dragging = false, px = 0, py = 0;
  img.addEventListener('pointerdown', e => {
    if (scale <= 1) return;
    dragging = true; px = e.clientX; py = e.clientY;
    img.setPointerCapture(e.pointerId);
  });
  img.addEventListener('pointermove', e => {
    if (!dragging) return;
    tx += e.clientX - px; ty += e.clientY - py;
    px = e.clientX; py = e.clientY;
    clampPan(); apply();
  });
  ['pointerup', 'pointercancel'].forEach(ev =>
    img.addEventListener(ev, () => dragging = false));

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(i + 1);
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === '+' || e.key === '=') zoomTo(scale + 0.5);
    if (e.key === '-') zoomTo(scale - 0.5);
  }
  document.addEventListener('keydown', onKey);

  function close() {
    box.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  }
}

/* Real customer messages instead of a paid endorsement. Chosen by product
   index so a given bat always shows the same one rather than shuffling. */
function reviewCard(p) {
  const i = Math.max(0, PRODUCTS.indexOf(p));
  const shot = TRUST_NOTES[i % TRUST_NOTES.length];
  return `
  <div class="pdp-rev">
    <button class="pdp-rev-img" data-note="images/trust/${shot}.webp"
            aria-label="Read the full message">
      <img src="images/trust/${shot}.webp" alt="A customer message about their Toss bats"
           loading="lazy" decoding="async">
    </button>
    <div>
      <span class="pdp-rev-tag">${ICON.check} Real WhatsApp message</span>
      <p>Every bat we send goes out to a player or a club. This is what comes
         back — unedited, names blurred.</p>
      <span class="pdp-rev-go">Tap to read it →</span>
    </div>
  </div>`;
}

/* Non-bat product page: photo gallery, the essentials, the same buy row
   and sticky bar (same element ids, so the existing wiring drives it),
   and related items from the same category. No bat vocabulary anywhere. */
function viewProductGeneric(p) {
  const off = discount(p);
  const cat = (typeof CATEGORIES !== 'undefined' &&
    (CATEGORIES.find(c => c.id === prodCat(p)) || {}).name) || 'Shop';
  const related = PRODUCTS
    .filter(x => x.id !== p.id && prodCat(x) === prodCat(p)).slice(0, 4);
  const desc = p.description || (p.data && p.data.description) || '';

  return `
  <section class="pdp-top">
    <div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> /
        <a href="#/shop?cat=${esc(prodCat(p))}">${esc(cat)}</a> / ${esc(p.name)}</div>
      ${galleryHTML(p, off)}
    </div>
  </section>

  <section class="pdp-body">
    <div class="wrap">
      <div class="pdp-grid">
        <div>
          <h1 class="pdp-title">${esc(p.name)}</h1>
          ${p.tagline ? `<p class="pdp-tag">${esc(p.tagline)}</p>` : ''}

          ${hasPrice(p) ? `
            <div class="pdp-price">
              <b class="num">${fmt(p.price)}</b>
              ${p.mrp ? `<s class="num">${fmt(p.mrp)}</s>` : ''}
              ${off >= 10 ? `<span class="save">Save ${fmt(p.mrp - p.price)}</span>` : ''}
            </div>
            <p class="incl">Inclusive of all taxes · ${p.price >= FREE_SHIP_OVER ? 'Free shipping' : 'Free shipping over ₹1500'}</p>
          ` : `
            <div class="pdp-price"><b style="font-size:1.5rem;color:var(--orange-700)">Price on request</b></div>
            <p class="incl">Message us for the current price and availability.</p>
          `}

          <div class="pdp-assure">
            <span>${ICON.hammer}<b>From our unit</b><i>Hand-checked</i></span>
            <span>${ICON.truck}<b>${hasPrice(p) && p.price >= FREE_SHIP_OVER ? 'Free shipping' : 'Ships India-wide'}</b><i>3–6 days</i></span>
            <span>${ICON.whatsapp}<b>Ask before you pay</b><i>No account needed</i></span>
            <span>${ICON.check}<b>Checked &amp; packed</b><i>Photographed first</i></span>
          </div>

          <div class="buy-row">
            ${hasPrice(p)
              ? `<button class="btn btn-primary btn-block" id="addBtn">${ICON.cart} Add to Bag</button>
                 <button class="btn btn-wa btn-block" id="waBtn">${ICON.whatsapp} Order on WhatsApp</button>`
              : `<button class="btn btn-wa btn-block" id="waBtn">${ICON.whatsapp} Ask price on WhatsApp</button>`}
          </div>
        </div>

        <div class="pdp-acc">
          ${desc ? `<details open>
            <summary><b>Description</b><span class="acc-i"></span></summary>
            <div class="acc-b"><p>${esc(desc)}</p></div>
          </details>` : ''}
          <details${desc ? '' : ' open'}>
            <summary><b>Shipping &amp; returns</b><span class="acc-i"></span></summary>
            <div class="acc-b">
              <p>We ship across India. Free over ${fmt(FREE_SHIP_OVER)}, otherwise ${fmt(SHIP_FEE)}.
                Orders leave our unit in 1–2 days and arrive in 3–6 depending on where you are.</p>
              <p>Everything is checked and photographed before it's packed. If what arrives
                isn't what you ordered, tell us on WhatsApp and we'll replace it.</p>
            </div>
          </details>
        </div>
      </div>

      ${related.length ? `
      <div style="margin-top:60px">
        <div class="sec-head row">
          <div><p class="eyebrow">More from this shelf</p><h2 class="d3">${esc(cat)}</h2></div>
        </div>
        <div class="grid">${related.map(cardHTML).join('')}</div>
      </div>` : ''}
    </div>
  </section>

  <div class="buybar" id="buybar">
    <div class="bb-p">
      ${hasPrice(p)
        ? `<b class="num">${fmt(p.price)}</b><span>incl. taxes</span>`
        : `<b>On request</b><span>Ask for today's price</span>`}
    </div>
    <button class="btn btn-wa" id="waBtn2">${ICON.whatsapp}<span class="bb-wa-t">WhatsApp</span></button>
    ${hasPrice(p) ? `<button class="btn btn-primary" id="addBtn2">Add to Bag</button>` : ''}
  </div>`;
}

function viewProduct(id) {
  const p = byId(id);
  if (!p) return viewNotFound();
  if (prodCat(p) !== 'bats') return viewProductGeneric(p);
  const off = discount(p);
  const related = PRODUCTS
    .filter(x => x.id !== p.id && prodCat(x) === 'bats' && (x.profile === p.profile || x.wood === p.wood))
    .sort((a, b) => b.popularity - a.popularity).slice(0, 4);

  const specs = [
    ['Wood', WOOD[p.wood].label],
    ['Profile', PROFILE[p.profile].label],
    ['Weight', weightLabel(p)],
    ['Height', heightLabel(p)],
    ['Handle', p.handle],
    ['Sweet spot', p.sweetSpot],
    ['Edge', p.edge],
    ['Finish', p.finish],
    ['Spine', p.spine === false ? 'No spine (flat back)' : 'Yes'],
    p.width ? ['Blade width', p.width] : null,
    p.blades ? ['Blade construction', p.blades + ' blade laminated'] : null,
    p.toeGuard ? ['Toe guard', 'Fitted'] : null,
    ['Ball type', p.ball.map(b => BALL_LABEL[b]).join(' & ')],
    ['Best for', p.usage],
    p.warranty ? ['Warranty', p.warranty] : null
  ].filter(Boolean);

  return `
  <section class="pdp-top">
    <div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / <a href="#/shop">Bats</a> / ${esc(p.name)}</div>
      ${galleryHTML(p, off)}
    </div>
  </section>

  <section class="pdp-body">
    <div class="wrap">
      <div class="pdp-grid">
        <div>
          <h1 class="pdp-title">${esc(p.name)}</h1>
          <p class="pdp-tag">${esc(p.tagline)}</p>
          <div class="rate">${ICON.star}${p.rating} <span>· ${p.reviews} reviews</span></div>

          ${hasPrice(p) ? `
            <div class="pdp-price">
              <b class="num">${fmt(p.price)}</b>
              ${p.mrp ? `<s class="num">${fmt(p.mrp)}</s>` : ''}
              ${off >= 10 ? `<span class="save">Save ${fmt(p.mrp - p.price)}</span>` : ''}
            </div>
            <p class="incl">Inclusive of all taxes · ${p.price >= FREE_SHIP_OVER ? 'Free shipping' : 'Free shipping over ₹1500'}</p>
          ` : `
            <div class="pdp-price"><b style="font-size:1.5rem;color:var(--orange-700)">Price on request</b></div>
            <p class="incl">This model is made to order. Message us for the current price and available weights.</p>
          `}

          <!-- reassurance sits directly under the price, where the doubt is -->
          <div class="pdp-assure">
            <span>${ICON.hammer}<b>Made by us</b><i>Never resold</i></span>
            <span>${ICON.truck}<b>${p.price >= FREE_SHIP_OVER ? 'Free shipping' : 'Ships India-wide'}</b><i>3–6 days</i></span>
            <span>${ICON.shield}<b>${p.warranty ? '3 month warranty' : 'Defect cover'}</b><i>We replace it</i></span>
            <span>${ICON.check}<b>Weight to order</b><i>Tell us yours</i></span>
          </div>

          ${p.variants ? `
            <div class="opts">
              <b>Choose your edition</b>
              <div class="opt-row" id="variants">
                ${p.variants.map((v, i) => `
                  <button class="opt${i === 1 ? ' on' : ''}" data-v="${v.id}">
                    <b>${v.name.replace(' Edition','')}</b>
                    <span class="num">${v.weight[0]}–${v.weight[1]}g</span>
                  </button>`).join('')}
              </div>
            </div>` : ''}

          ${p.customizable ? `
            <div class="opts">
              <b>Customisable</b>
              <p style="margin:0;font-size:.87rem;color:var(--ink-70)">
                Weight, ${p.profile === 'scoop' ? 'scoop style ' : ''}and finish can be customised on this model.
                Tell us what you want when you order.
              </p>
            </div>` : ''}

          ${hasPrice(p) && SERVICES.engraving.enabled ? `
            <div class="opts engrave">
              <label class="svc-check">
                <input type="checkbox" id="engOn">
                <span><b>Engrave it</b> — your name, a number, your team
                  <i>+${fmt(SERVICES.engraving.price)}</i></span>
              </label>
              <input id="engTxt" type="text" class="eng-txt hide"
                     maxlength="${SERVICES.engraving.maxChars}"
                     placeholder="Up to ${SERVICES.engraving.maxChars} characters">
            </div>` : ''}

          <div class="buy-row">
            ${hasPrice(p)
              ? `<button class="btn btn-primary btn-block" id="addBtn">${ICON.cart} Add to Bag</button>
                 <button class="btn btn-wa btn-block" id="waBtn">${ICON.whatsapp} Order on WhatsApp</button>`
              : `<button class="btn btn-wa btn-block" id="waBtn">${ICON.whatsapp} Ask price on WhatsApp</button>`}
          </div>

          ${reviewCard(p)}
        </div>

        <!-- Everything below the decision folded away. The page was one long
             scroll of specs most people never read; now each block is one line
             until it is wanted. -->
        <div class="pdp-acc">
          <details open>
            <summary><b>Description</b><span class="acc-i"></span></summary>
            <div class="acc-b">
              <p>${esc(p.tagline)}. ${WOOD[p.wood].short} with a
                ${(PROFILE_WORDS[p.profile] || PROFILE_WORDS.standard).b.toLowerCase()} profile,
                ${p.weight[0]}–${p.weight[1]}g and ${p.height[0]}–${p.height[1]} inches.
                Built for ${p.ball.map(b => BALL_LABEL[b].toLowerCase()).join(' and ')} cricket.</p>
              <p>${esc(p.usage || '')}</p>
            </div>
          </details>

          <details>
            <summary><b>Specifications</b><span class="acc-i"></span></summary>
            <div class="acc-b">
              <table class="spec-tbl">
                ${specs.map(s => `<tr><th>${esc(s[0])}</th><td>${esc(s[1])}</td></tr>`).join('')}
              </table>
            </div>
          </details>

          <details>
            <summary><b>Why this bat</b><span class="acc-i"></span></summary>
            <div class="acc-b">
              <ul class="feat">${p.features.map(f => `<li>${ICON.check}${esc(f)}</li>`).join('')}</ul>
            </div>
          </details>

          <details>
            <summary><b>How to look after it</b><span class="acc-i"></span></summary>
            <div class="acc-b">
              <p>Tennis ball bats need far less fuss than leather ones — no heavy
                knocking-in required. Keep it dry, don't leave it in the boot of a car,
                and don't use it on a wet ground.</p>
              <p>Toe guard and threading take most of the punishment. If the toe starts
                to fray, tape it early and the bat will last seasons.</p>
            </div>
          </details>

          <details>
            <summary><b>Warranty</b><span class="acc-i"></span></summary>
            <div class="acc-b">
              <p>${p.warranty
                ? esc(p.warranty) + ' from the date of delivery.'
                : 'Covered against manufacturing defects — wood splitting on its own, or a handle coming loose.'}</p>
              <p>Normal wear from playing, or damage from a wet ground or the wrong ball,
                isn't covered. Message us with a photo and we'll sort it out.</p>
            </div>
          </details>

          <details>
            <summary><b>Shipping &amp; returns</b><span class="acc-i"></span></summary>
            <div class="acc-b">
              <p>We ship across India. Free over ${fmt(FREE_SHIP_OVER)}, otherwise ${fmt(SHIP_FEE)}.
                Orders leave our unit in 1–2 days and arrive in 3–6 depending on where you are.</p>
              <p>Every bat is checked and photographed before it's packed. If what arrives
                isn't what you ordered, tell us on WhatsApp and we'll replace it.</p>
            </div>
          </details>
        </div>
      </div>

      ${related.length ? `
      <div style="margin-top:60px">
        <div class="sec-head row">
          <div><p class="eyebrow">You might also like</p><h2 class="d3">Similar bats</h2></div>
        </div>
        <div class="grid">${related.map(cardHTML).join('')}</div>
      </div>` : ''}
    </div>
  </section>

  ${qaHTML(p.id)}

  <!-- follows you down the page. Unpriced bats get one too — they previously
       had no sticky action at all, so the only way to enquire was to scroll
       back up. -->
  <div class="buybar" id="buybar">
    <div class="bb-p">
      ${hasPrice(p)
        ? `<b class="num">${fmt(p.price)}</b><span>incl. taxes</span>`
        : `<b>Made to order</b><span>Ask for today's price</span>`}
    </div>
    <button class="btn btn-wa" id="waBtn2">${ICON.whatsapp}<span class="bb-wa-t">WhatsApp</span></button>
    ${hasPrice(p) ? `<button class="btn btn-primary" id="addBtn2">Add to Bag</button>` : ''}
  </div>`;
}

/* ---------------- VIEW: FINDER ---------------- */
const QUIZ = [
  { key:'ball', q:'Which ball do you play with?', sub:'This decides how strong the bat needs to be.',
    opts:[
      {v:'soft',   e:'🎾', b:'Soft tennis ball',   s:'Regular street and gully cricket'},
      {v:'medium', e:'🏏', b:'Medium tennis ball', s:'Heavier ball, tournaments and turf'},
      {v:'any',    e:'🤷', b:'Both / not sure',    s:'Show me bats that handle either'}
    ]},
  { key:'style', q:'How do you bat?', sub:'Be honest — it changes the profile we suggest.',
    opts:[
      {v:'power',   e:'💥', b:'I go for the boundary', s:'Big edges and thick profiles'},
      {v:'balance', e:'⚖️', b:'All-round, I rotate strike', s:'Balanced pickup, mid sweet spot'},
      {v:'speed',   e:'⚡', b:'Fast hands, quick swing', s:'Lighter scoop and mongoose builds'},
      {v:'new',     e:'🌱', b:"I'm just starting", s:'Simple, forgiving, affordable'}
    ]},
  { key:'weight', q:'What weight feels right?', sub:'Heavier hits harder. Lighter swings faster.',
    opts:[
      {v:'light',  e:'🪶', b:'Light — under 750g',  s:'Fast swing, easier control'},
      {v:'mid',    e:'🎯', b:'Medium — 750g to 850g', s:'The most popular range'},
      {v:'heavy',  e:'🔨', b:'Heavy — 850g plus',   s:'Maximum power transfer'},
      {v:'any',    e:'🤷', b:"Don't mind",          s:'Show me everything'}
    ]},
  { key:'budget', q:"What's your budget?", sub:'Every price band has a good bat in it.',
    opts:[
      {v:'entry',   e:'💸', b:'Under ₹1500',   s:'Solid starter bats'},
      {v:'mid',     e:'💰', b:'₹1500 – ₹2200', s:'Best value range'},
      {v:'premium', e:'👑', b:'₹2200 and above', s:'Our top builds'},
      {v:'any',     e:'🔓', b:'Show me the best', s:'Budget is flexible'}
    ]}
];
let quizStep = 0, quizAns = {};

function scoreProduct(p) {
  let s = p.popularity / 20;
  if (quizAns.ball && quizAns.ball !== 'any') { if (p.ball.includes(quizAns.ball)) s += 30; else s -= 40; }
  if (quizAns.style === 'power')   s += (p.profile === 'bigedge' ? 26 : 0) + (/thick|big/i.test(p.edge||'') ? 14 : 0) + (p.profile === 'multi' ? 10 : 0);
  if (quizAns.style === 'speed')   s += (p.profile === 'scoop' ? 24 : 0) + (p.profile === 'mongoose' ? 22 : 0) + (p.weight[0] < 750 ? 12 : 0);
  if (quizAns.style === 'balance') s += (p.profile === 'standard' ? 20 : 0) + (p.profile === 'scoop' ? 12 : 0);
  if (quizAns.style === 'new')     s += (p.tier === 'entry' ? 26 : 0) + (/beginner/i.test(p.features.join(' ')) ? 14 : 0);
  const mid = (p.weight[0] + p.weight[1]) / 2;
  if (quizAns.weight === 'light' ) s += mid < 760 ? 20 : -16;
  if (quizAns.weight === 'mid'   ) s += (mid >= 740 && mid <= 870) ? 20 : -10;
  if (quizAns.weight === 'heavy' ) s += mid > 840 ? 20 : -16;
  if (quizAns.budget && quizAns.budget !== 'any') s += p.tier === quizAns.budget ? 26 : -20;
  if (!hasPrice(p)) s -= 12;
  return s;
}

/* Bats that genuinely still fit the answers so far.
   Ball, budget and weight are real compatibility constraints, so they filter.
   Batting style is a preference, not a constraint — a power player CAN use a
   standard bat — so it ranks in scoreProduct() rather than eliminating here.
   Keeping style out is also what stops the count collapsing to zero, which
   would both discourage people and contradict the shortlist they end up with. */
function stillMatching() {
  return PRODUCTS.filter(p => prodCat(p) === 'bats').filter(p => {
    const a = quizAns;
    if (a.ball && a.ball !== 'any' && !p.ball.includes(a.ball)) return false;
    if (a.budget && a.budget !== 'any' && p.tier !== a.budget) return false;
    const mid = (p.weight[0] + p.weight[1]) / 2;
    if (a.weight === 'light' && mid >= 790) return false;
    if (a.weight === 'heavy' && mid <= 800) return false;
    if (a.weight === 'mid'   && (mid < 700 || mid > 900)) return false;
    return true;
  });
}

/* A soft tennis ball really does look different from a medium one — that is
   the whole question, so the options show it instead of an emoji. */
function ballArt(fill, shade, seam) {
  return `<svg viewBox="0 0 80 80" class="opt-art" aria-hidden="true">
    <circle cx="40" cy="40" r="30" fill="${fill}"/>
    <circle cx="40" cy="40" r="30" fill="url(#bs${seam})" opacity=".35"/>
    <path d="M14 28q26 12 52 0M14 52q26-12 52 0" stroke="${shade}" stroke-width="2.6"
      fill="none" stroke-linecap="round"/>
    <defs><radialGradient id="bs${seam}" cx="35%" cy="30%">
      <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${shade}"/>
    </radialGradient></defs></svg>`;
}

/* Each option shows the kind of bat it leads to, using the real renderer. */
const OPT_BAT = {
  style:  { power:'big-edge-varnish-pro', balance:'cws', speed:'custom-scoop', new:'regular-bat' },
  weight: { light:'regular-bat', mid:'cws', heavy:'cs-pro' },
  budget: { entry:'regular-bat', mid:'custom-scoop', premium:'power-x' }
};

function optArt(key, v) {
  if (key === 'ball') {
    if (v === 'soft')   return ballArt('#e3f56b', '#a8c23c', 'a');
    if (v === 'medium') return ballArt('#c2cf4a', '#7d8f24', 'b');
    return `<span class="opt-both">${ballArt('#e3f56b', '#a8c23c', 'c')}${ballArt('#c2cf4a', '#7d8f24', 'd')}</span>`;
  }
  const id = (OPT_BAT[key] || {})[v];
  const p = id && byId(id);
  return p ? `<span class="opt-bat">${batSVG(p, { glow: false, trueScale: key === 'weight' })}</span>`
           : `<span class="opt-any">ANY</span>`;
}

/* Why the winner fits — sentences built from the actual answers, so the
   verdict reads like a fitter's judgement, not a search result. */
function fitReasons(p) {
  const a = quizAns, r = [];
  if (a.ball === 'soft')        r.push('Built for the soft tennis ball you play with');
  else if (a.ball === 'medium') r.push('Strong enough for the heavier medium ball');
  else                          r.push('Handles both soft and medium tennis balls');
  const style = {
    power:   p.profile === 'bigedge' ? 'Thick edges to carry your boundary swing'
                                     : 'Real meat behind the ball for big hitting',
    balance: 'Balanced pickup for rotating the strike',
    speed:   'Light swing weight for your fast hands',
    new:     'Forgiving and simple — right for starting out'
  }[a.style];
  if (style) r.push(style);
  const mid = Math.round((p.weight[0] + p.weight[1]) / 2);
  r.push(`~${mid}g pickup — ${
    a.weight === 'light' ? 'in the light range you wanted'
    : a.weight === 'heavy' ? 'the heavy hitter you asked for'
    : a.weight === 'mid' ? 'right in your preferred range'
    : 'an easy middle weight'}`);
  if (a.budget && a.budget !== 'any' && hasPrice(p)) r.push(`${fmt(p.price)} — inside your budget`);
  return r;
}

/* THE WORKSHOP BENCH. The right half of the page is a bat on a lit stage —
   always the current leading match, re-rendered by the real product
   renderer after every answer, so each choice visibly reshapes it. It
   stays a dark silhouette while the quiz runs (the name would spoil the
   reveal) and comes up in full colour only on the verdict screen. */
function viewFinder() {
  if (quizStep >= QUIZ.length) {
    /* the finder is a bat fitter — other categories never enter the ranking */
    const ranked = PRODUCTS.filter(p => prodCat(p) === 'bats')
      .map(p => ({ p, s: scoreProduct(p) }))
      .sort((a, b) => b.s - a.s).map(x => x.p);
    const win = ranked[0], backups = ranked.slice(1, 3);
    return `
    <section class="quiz dark fdr">
      <span class="gr-light l"></span><span class="gr-light r"></span>
      <div class="wrap">
        <div class="fdr-reveal">
          <div class="fdr-stage win">
            <span class="fdr-spot"></span>
            <div class="fdr-bat">${batArt(win, { glow: true, trueScale: true })}</div>
            <span class="fdr-plinth"></span>
          </div>
          <div class="fdr-verdict">
            <p class="eyebrow">Over bowled · verdict in</p>
            <h2 class="d2">This is your bat.</h2>
            <p class="fdr-name">${esc(win.name)}
              <b>${hasPrice(win) ? fmt(win.price) : 'Price on request'}</b></p>
            <ul class="fdr-why">${fitReasons(win).map(t => `<li>${t}</li>`).join('')}</ul>
            <div class="hero-cta">
              <a class="btn btn-primary" href="#/product/${win.id}">See this bat ${ICON.arrow}</a>
              <button class="btn btn-ghost" id="qRestart">Start again</button>
            </div>
          </div>
        </div>
        <div class="fdr-backups">
          <p class="fdr-alt">Want options? These two also fit your answers:</p>
          <div class="fdr-bkgrid">${backups.map(cardHTML).join('')}</div>
        </div>
      </div>
    </section>`;
  }

  const q = QUIZ[quizStep];
  const pct = (quizStep / QUIZ.length) * 100;
  const left = stillMatching();
  const lead = left.slice().sort((a, b) => scoreProduct(b) - scoreProduct(a))[0] || PRODUCTS[0];
  const answered = Object.keys(quizAns).length > 0;
  const SPEC_LABEL = { ball: 'Ball', style: 'Style', weight: 'Weight', budget: 'Budget' };

  return `
  <section class="quiz dark fdr ground">
    <span class="gr-light l"></span><span class="gr-light r"></span>
    <div class="wrap fdr-grid">

      <!-- bench first in the DOM so on a phone the taking-shape bat sits
           right above the question and every answer's morph is seen -->
      <aside class="fdr-bench" aria-live="polite">
        <div class="fdr-stage${answered ? '' : ' ghost'}">
          <span class="fdr-spot"></span>
          <div class="fdr-bat sil">${batSVG(lead, { glow: false, trueScale: true })}</div>
        </div>
        <p class="fdr-cap">${answered
          ? 'Your bat, taking shape'
          : 'Answer — and watch your bat take shape'}</p>
        <div class="fdr-specs">
          ${QUIZ.map((s, i) => {
            const done = quizAns[s.key] !== undefined;
            const opt = done && s.opts.find(o => o.v === quizAns[s.key]);
            return `<div class="fdr-spec${done ? ' done' : ''}${i === quizStep ? ' now' : ''}">
              <span>${SPEC_LABEL[s.key]}</span>
              <b>${opt ? esc(opt.b) : i === quizStep ? 'Answering…' : '—'}</b>
            </div>`;
          }).join('')}
        </div>
        <div class="fdr-count">
          <b>${left.length}</b><span>of ${PRODUCTS.length} bats still fit</span>
          <div class="fdr-cbar"><i style="width:${Math.round(left.length / PRODUCTS.length * 100)}%"></i></div>
        </div>
      </aside>

      <div class="quiz-ask">
        <div class="quiz-bar"><i style="width:${pct}%"></i></div>
        <p class="quiz-step">Delivery ${quizStep + 1} of ${QUIZ.length}</p>
        <h2 class="d2 q-head">${q.q}</h2>
        <p class="lede">${q.sub}</p>

        <div class="q-opts n${q.opts.length}">
          ${q.opts.map(o => `
            <button class="q-opt${quizAns[q.key] === o.v ? ' on' : ''}" data-q="${o.v}">
              <span class="q-art">${optArt(q.key, o.v)}</span>
              <b>${o.b}</b>
              <span class="q-sub">${o.s}</span>
            </button>`).join('')}
        </div>

        <div class="quiz-nav">
          ${quizStep > 0 ? `<button class="btn btn-ghost btn-sm" id="qBack">Back</button>` : ''}
          <a href="#/shop" class="btn btn-ghost btn-sm">Skip — show all bats</a>
        </div>
      </div>

    </div>
  </section>`;
}

/* ---------------- VIEW: GULLY CRICKET ---------------- */
function scores() { return readLS('toss_scores', []); }
function saveScore(name, runs, wkts) {
  const list = scores();
  list.push({ name: name.slice(0, 12), runs, wkts });
  list.sort((a, b) => b.runs - a.runs);
  localStorage.setItem('toss_scores', JSON.stringify(list.slice(0, 8)));
}

function bestScore() { return scores().reduce((m, s) => Math.max(m, s.runs), 0); }

function leaderboardHTML() {
  const list = scores();
  if (!list.length) return `<div class="lb-empty2">
      <b>Board's empty</b><span>Play an innings and put your name up.</span></div>`;
  const medal = ['g', 's', 'b'];
  return `<div class="lb2">${list.map((s, i) => `
    <div class="row ${i === 0 ? 'top1' : ''}">
      <span class="medal ${medal[i] || ''}">${i + 1}</span>
      <span class="nm">${esc(s.name)}</span>
      <span class="sc">${s.runs}<small>/${s.wkts}</small></span>
    </div>`).join('')}</div>`;
}

/* A locked reward gives nothing away — not the code, not the amount.
   The whole thing is the surprise; only the target score is public,
   because that's what you're playing for. Rows are LED board lines:
   goal number left, masked code right, a NEED line and a 10-segment
   progress strip that the live poller keeps current mid-innings. */
function rewardHTML(justWon) {
  const best = bestScore();
  return Object.keys(COUPONS).map(code => {
    const c = COUPONS[code], got = unlocked.includes(code);

    if (got) {
      const rev = justWon === code;
      return `<div class="bd-tgt on${rev ? ' reveal' : ''}">
        ${rev ? '<span class="tkt-shine"></span>' : ''}
        <div class="bd-t-top">
          <b class="bd-t-num">${c.runs}</b>
          <span class="bd-t-code"${rev ? ` data-reveal="${code}"` : ''}>${rev ? '&nbsp;' : code}</span>
        </div>
        <span class="bd-t-need ok">${c.label} over ${fmt(c.min)} — use it at checkout →</span>
      </div>`;
    }

    const segs = Math.min(10, Math.floor(best / c.runs * 10));
    const need = best >= c.runs
      ? 'Play one more innings to claim it'
      : best
        ? `Need ${c.runs - best} past your best`
        : `Need ${c.runs} in one innings`;
    return `<div class="bd-tgt off" data-goal="${c.runs}">
        <div class="bd-t-top">
          <b class="bd-t-num">${c.runs}</b>
          <span class="bd-t-code masked">??????</span>
        </div>
        <span class="bd-t-need" data-need>${need}</span>
        <div class="bd-seg" aria-hidden="true">${
          Array.from({ length: 10 }, (_, i) => `<i${i < segs ? ' class="lit"' : ''}></i>`).join('')
        }</div>
      </div>`;
  }).join('');
}

/* code scrambles, then settles one character at a time */
function decodeReveal(el, final) {
  const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let frame = 0;
  const t = setInterval(() => {
    frame++;
    const settled = Math.floor(frame / 3);
    let s = '';
    for (let i = 0; i < final.length; i++) {
      s += i < settled ? final[i] : pool[Math.floor(Math.random() * pool.length)];
    }
    el.textContent = s;
    if (settled >= final.length) { clearInterval(t); el.textContent = final; }
  }, 55);
}
function runReveals() {
  $$('[data-reveal]').forEach(el => {
    const final = el.dataset.reveal;
    el.removeAttribute('data-reveal');
    decodeReveal(el, final);
  });
}

/* ---------------- THE WIN SPLASH ----------------
   Fires once, at the end of an innings that unlocked a code — the moment
   the reward is actually earned. Full-screen takeover: confetti, the code
   slamming in at display size, copy + shop actions. The mid-innings green
   pulse stays a tease; this is the payoff. */
function confettiHTML(n) {
  const colors = ['#FF8A1E', '#FFC46B', '#35E065', '#5b8cff', '#ffffff', '#e5484d'];
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<i style="left:${(Math.random() * 100).toFixed(1)}%;
      background:${colors[i % colors.length]};
      width:${6 + (Math.random() * 6 | 0)}px;
      animation-delay:${(Math.random() * .9).toFixed(2)}s;
      animation-duration:${(2.4 + Math.random() * 1.8).toFixed(2)}s"></i>`;
  }
  return s;
}

/* an 8-bit victory arpeggio, synthesized — no audio file, and if the
   browser refuses autoplay the celebration is simply silent */
function winChime() {
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = A.currentTime;
    [[523.25, 0, .12], [659.25, .12, .12], [783.99, .24, .12], [1046.5, .36, .34]]
      .forEach(([f, dt, d]) => {
        const o = A.createOscillator(), g = A.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(.11, t0 + dt + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t0 + dt + d);
        o.connect(g); g.connect(A.destination);
        o.start(t0 + dt); o.stop(t0 + dt + d + .05);
      });
    setTimeout(() => A.close(), 1600);
  } catch (e) { /* a silent win still counts */ }
}

function rewardSplash(codes) {
  if (!codes || !codes.length) return;
  /* the biggest prize leads; any extra one gets a line, and is already
     revealed on the board behind the splash */
  const primary = codes.slice().sort((a, b) => COUPONS[b].runs - COUPONS[a].runs)[0];
  const c = COUPONS[primary];
  const old = document.querySelector('.win-splash'); if (old) old.remove();

  const box = document.createElement('div');
  box.className = 'win-splash';
  box.innerHTML = `
    <div class="ws-confetti" aria-hidden="true">${confettiHTML(46)}</div>
    <div class="ws-card" role="dialog" aria-modal="true" aria-label="Reward unlocked">
      <span class="ws-burst" aria-hidden="true"></span>
      <p class="ws-eyebrow">🏆 Mystery reward unlocked</p>
      <b class="ws-code" data-ws-code>??????</b>
      <p class="ws-what">${esc(c.label)} on orders over ${fmt(c.min)}</p>
      ${codes.length > 1 ? `<p class="ws-extra">+ ${codes.length - 1} more code unlocked — it's on the board</p>` : ''}
      <div class="ws-cta">
        <button class="btn btn-ghost" id="wsCopy">Copy code</button>
        <a class="btn btn-primary" id="wsShop" href="#/shop">Shop with it ${ICON.arrow}</a>
      </div>
      <button class="ws-x" aria-label="Close">${ICON.close}</button>
    </div>`;
  document.body.appendChild(box);

  decodeReveal(box.querySelector('[data-ws-code]'), primary);
  winChime();

  const close = () => box.remove();
  box.querySelector('.ws-x').onclick = close;
  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  box.querySelector('#wsShop').addEventListener('click', close);
  box.querySelector('#wsCopy').onclick = () => {
    const done = () => toast('Copied — ' + primary + ' works at checkout');
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(primary).then(done, () => toast(primary + ' — note it down'));
    else toast(primary + ' — note it down');
  };
}

/* The live poller. The board reads the running innings straight off
   TossCricket.state a few times a second — the engine is never modified.
   Mid-innings each locked target counts down ("Need 12 more"), its segment
   strip fills, and crossing the goal flips the row green ("finish the
   innings!"). The actual code still only reveals when the innings ends. */
let BOARD_TIMER = 0;
function boardTick() {
  const S = (typeof TossCricket !== 'undefined') && TossCricket.state;
  if (!S) return;
  const put = (sel, v) => {
    const e = $(sel); if (e && e.textContent !== v) e.textContent = v;
  };
  put('#bdRuns', S.runs + '/' + S.wkts);
  put('#bdOvers', Math.floor(S.balls / 6) + '.' + (S.balls % 6));

  const over = S.phase === 'over';
  $$('.bd-tgt.off').forEach(row => {
    const goal = +row.dataset.goal;
    const needEl = row.querySelector('[data-need]');
    const reached = S.runs >= goal;
    row.classList.toggle('inrange', reached && !over);
    if (needEl) {
      if (reached) needEl.textContent = over ? 'Play one more innings to claim it'
                                             : 'Target reached — finish the innings!';
      else if (S.balls || S.runs) needEl.textContent = `Need ${goal - S.runs} more`;
      /* before the first ball, leave rewardHTML's best-based line alone */
    }
    const lit = Math.min(10, Math.floor(S.runs / goal * 10));
    row.querySelectorAll('.bd-seg i').forEach((seg, i) =>
      seg.classList.toggle('lit', i < lit));
  });
}

function viewGame() {
  return `
  <section class="gp dark">
    <!-- night-match scene: lamp heads in the top corners (the cones are
         pseudo-elements on .gp.dark) and a slow orange crowd-haze drifting
         along the bottom. All CSS, no images. -->
    <span class="flood a"></span><span class="flood b"></span>
    <span class="night-haze"></span>
    <div class="wrap">
      <div class="crumbs"><a href="#/">Home</a> / Gully Cricket</div>
      <!-- broadcast bar: the game reads as the live feed rather than a widget -->
      <div class="cast">
        <span class="cast-live"><i></i>Live</span>
        <h1 class="d2 cast-title">Toss Gully Cricket</h1>
        <span class="cast-meta">Free to play · Chennai</span>
      </div>

      <div class="gp-grid">
        <div class="gp-stage">
          <div class="console" id="gameHost">
            <div class="gp-hud">
              <div><span class="l">SCORE</span><b data-score>0/0</b></div>
              <div style="margin-left:14px"><span class="l">OVERS</span><b data-overs>0.0</b></div>
              <div class="sp"><span class="l">AIM</span><b data-lane>Straight</b></div>
            </div>
            <div class="gp-gap"><span data-gap>Long-on open</span></div>
            <canvas class="gp-cv" aria-label="Cricket game"></canvas>
            <div class="gp-strip" data-strip></div>
            <div class="pad">
              <button class="key" data-lanebtn="0">◀<small>LEG</small></button>
              <button class="key hit" data-swing>SWING<small>SPACE</small></button>
              <button class="key" data-lanebtn="2">▶<small>OFF</small></button>
            </div>
            <div class="pad" style="grid-template-columns:1fr">
              <button class="key" data-lanebtn="1">▲<small>STRAIGHT</small></button>
            </div>
          </div>
        </div>

        <div class="gp-side">
          <!-- THE BIG SCREEN: one stadium LED board instead of three stacked
               panels. It tracks the running innings ball by ball (polled from
               TossCricket.state — the engine itself is untouched), counts
               down to each target, and the code reveal fires on the board. -->
          <div class="board">
            <div class="bd-head">
              <span class="bd-live"><i></i>Live</span>
              <span>Toss Big Screen</span>
              <span class="bd-loc">Chennai</span>
            </div>
            <div class="bd-now">
              <div class="cell"><span>Score</span><b id="bdRuns">0/0</b></div>
              <div class="cell"><span>Overs</span><b id="bdOvers">0.0</b></div>
              <div class="cell"><span>Best</span><b id="bdBest">${bestScore() || '–'}</b></div>
            </div>
            <div class="bd-targets" id="rewards">${rewardHTML()}</div>
            <div class="bd-sub">Best innings · this device</div>
            <div class="bd-lb" id="lbBox">${leaderboardHTML()}</div>
            <div class="bd-foot">3 overs · 3 wickets — hit a target and its code unlocks</div>
          </div>

          <details class="gpanel sm gp-how">
            <summary><h3>How to play</h3><span class="gp-chev">${ICON.arrow}</span></summary>
            <ul class="gp-rules">
              <li><span class="kc">◀ ▶</span><span>Aim leg side, straight or off side. Two of the three
                are guarded — the dotted circle marks the gap.</span></li>
              <li><span class="kc hit">SPACE</span><span>Swing as the ball reaches the bat.
                Perfect timing is a six.</span></li>
              <li><span class="kc">4</span><span>A four hit at midwicket, long-on or cover gets caught.
                Sixes clear them.</span></li>
              <li><span class="kc bad">W</span><span>Swing too early, too late, or not at all
                and you're bowled.</span></li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  </section>`;
}

/* ---------------- VIEW: CHECKOUT ---------------- */
function viewCheckout() {
  if (lastOrder) return viewDone();
  if (!cart.length) return `
    <section class="co"><div class="wrap"><div class="empty">
      <b>Your bag is empty</b>
      <p>Add a bat and come back.</p>
      <a href="#/shop" class="btn btn-primary btn-sm" style="margin-top:16px">Shop Bats</a>
    </div></div></section>`;

  const sub = cartSubtotal(), sh = shipFee(), off = couponOff(), tot = sub + sh - off;
  return `
  <section class="co">
    <div class="wrap">
      <div class="crumbs" style="color:var(--ink-50);margin-bottom:12px"><a href="#/shop">Shop</a> / Checkout</div>
      <h1 class="d2" style="margin-bottom:24px">Checkout</h1>
      <div class="co-grid">
        <div>
          <div class="panel">
            <h3>Delivery details</h3>
            <p class="sub">We'll use this to dispatch and to update you on WhatsApp.</p>
            <div class="field"><label for="cName">Full name</label>
              <input id="cName" placeholder="Your name" autocomplete="name"><div class="msg hide"></div></div>
            <div class="row2">
              <div class="field"><label for="cPhone">WhatsApp number</label>
                <input id="cPhone" type="tel" inputmode="numeric" placeholder="10 digit number" autocomplete="tel"><div class="msg hide"></div></div>
              <div class="field"><label for="cPin">PIN code</label>
                <input id="cPin" type="tel" inputmode="numeric" placeholder="600001" autocomplete="postal-code"><div class="msg hide"></div>
                <div class="dv-note" id="cPinNote"></div></div>
            </div>
            <div class="field"><label for="cAddr">Address</label>
              <textarea id="cAddr" rows="3" placeholder="House / street / area" autocomplete="street-address"></textarea><div class="msg hide"></div></div>
            <div class="row2">
              <div class="field"><label for="cCity">City</label>
                <input id="cCity" placeholder="Chennai" autocomplete="address-level2"><div class="msg hide"></div></div>
              <div class="field"><label for="cState">State</label>
                <input id="cState" placeholder="Tamil Nadu" autocomplete="address-level1"><div class="msg hide"></div></div>
            </div>
            <div class="field"><label for="cNotes">Anything we should know? <span style="text-transform:none;font-weight:600">(optional)</span></label>
              <input id="cNotes" placeholder="Preferred weight, colour, scoop style…"></div>
          </div>

          <div class="panel" style="margin-top:18px">
            <h3>How do you want to pay?</h3>
            <p class="sub">Both options are confirmed by us before dispatch.</p>

            <div class="pay-opt on" data-pay="wa">
              <div class="pay-radio"></div>
              <div>
                <b>${ICON.whatsapp} Order on WhatsApp <span class="pay-tag">Most used</span></b>
                <p>Your full order opens as a ready-made WhatsApp message. We confirm stock,
                   weight and delivery, then you pay — UPI on confirmation or cash on delivery.</p>
              </div>
            </div>

            <div class="pay-opt" data-pay="online">
              <div class="pay-radio"></div>
              <div>
                <b>${ICON.rupee} Pay online now</b>
                <p>UPI, card or netbanking via Razorpay. Order is confirmed instantly
                   and goes straight into dispatch.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="co-side">
          <div class="panel">
            <h3>Your order</h3>
            <p class="sub">${cartCount()} item${cartCount() === 1 ? '' : 's'}</p>
            ${cart.map(i => {
              const p = byId(i.id), v = variantName(p, i.variant);
              const eng = i.engrave ? SERVICES.engraving.price : 0;
              return `<div class="mini-item">
                <div class="mini-art">${batArt(p, { glow: false })}</div>
                <b>${esc(p.name)}${v ? `<br><span style="color:var(--ink-50);font-weight:600;font-size:.78rem">${esc(v)}</span>` : ''}
                   ${i.engrave ? `<br><span style="color:var(--orange);font-weight:700;font-size:.78rem">Engraved “${esc(i.engrave)}”</span>` : ''}
                   <br><span style="color:var(--ink-50);font-weight:600;font-size:.78rem">Qty ${i.qty}</span></b>
                <i class="num">${hasPrice(p) ? fmt((p.price + eng) * i.qty) : '—'}</i>
              </div>`;
            }).join('')}
            <div class="coupon">
              <input id="cCoupon" placeholder="Discount code" value="${coupon || ''}" autocomplete="off">
              <button class="btn btn-dark btn-sm" id="applyCoupon">${coupon ? 'Remove' : 'Apply'}</button>
            </div>
            <div class="coupon-msg hide" id="couponMsg"></div>
            ${unlocked.length && !coupon
              ? `<p class="coupon-hint">You've unlocked <b>${unlocked.join(', ')}</b> from
                   <a href="#/game">Gully Cricket</a>.</p>`
              : !unlocked.length
                ? `<p class="coupon-hint">No code? <a href="#/game">Play Gully Cricket</a> and score 30 to unlock one.</p>`
                : ''}

            <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:14px">
              <div class="sum"><span>Subtotal</span><span class="num">${fmt(sub)}</span></div>
              <div class="sum"><span>Shipping</span>
                <span class="${sh === 0 ? 'free' : 'num'}">${sh === 0 ? 'FREE' : fmt(sh)}</span></div>
              ${off > 0 ? `<div class="sum"><span>Discount (${coupon})</span>
                 <span class="off num">− ${fmt(off)}</span></div>` : ''}
              ${sh > 0 ? `<div class="sum" style="color:var(--ink-50);font-size:.78rem">
                 <span>Add ${fmt(FREE_SHIP_OVER - sub)} more for free shipping</span><span></span></div>` : ''}
              <div class="sum tot"><span>Total</span><span class="num">${fmt(tot)}</span></div>
            </div>
            <button class="btn btn-wa btn-block" id="placeBtn" style="margin-top:18px">
              ${ICON.whatsapp} Send Order on WhatsApp
            </button>
            <p style="font-size:.74rem;color:var(--ink-50);text-align:center;margin:12px 0 0">
              By placing this order you agree to be contacted on WhatsApp about it.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function viewDone() {
  const o = lastOrder;
  return `
  <section class="co">
    <div class="wrap">
      <div class="panel done" style="max-width:620px;margin:0 auto">
        <div class="done-ring">${ICON.check}</div>
        <h1 class="d2">Order placed</h1>
        <p class="lede" style="margin:12px auto 0">
          ${o.method === 'wa'
            ? 'Your order has been sent to us on WhatsApp. We\'ll confirm stock and delivery shortly.'
            : 'Payment received. We\'re packing your bat now.'}
        </p>
        <div class="oid">${o.id}</div>
        <div style="text-align:left;border-top:1px solid var(--line);padding-top:18px;margin-top:6px">
          ${o.items.map(i => {
            const p = byId(i.id), v = variantName(p, i.variant);
            return `<div class="mini-item">
              <div class="mini-art">${batArt(p, { glow: false })}</div>
              <b>${esc(p.name)}${v ? ' — ' + esc(v) : ''}<br>
                <span style="color:var(--ink-50);font-weight:600;font-size:.78rem">Qty ${i.qty}</span></b>
              <i class="num">${hasPrice(p) ? fmt(p.price * i.qty) : '—'}</i>
            </div>`;
          }).join('')}
          ${o.off > 0 ? `<div class="sum"><span>Discount (${o.coupon})</span>
             <span class="off num">− ${fmt(o.off)}</span></div>` : ''}
          <div class="sum tot"><span>Total</span><span class="num">${fmt(o.total)}</span></div>
        </div>
        <div class="buy-row" style="margin-top:24px">
          <a href="#/shop" class="btn btn-ghost btn-block">Keep shopping</a>
          <a href="${waLink('Hi Toss Sports, checking on my order ' + o.id)}" target="_blank"
             rel="noopener" class="btn btn-wa btn-block">${ICON.whatsapp} Track on WhatsApp</a>
        </div>
      </div>
    </div>
  </section>`;
}

function viewNotFound() {
  return `<section class="co"><div class="wrap"><div class="empty">
    <b>Page not found</b><p>That bat may have moved.</p>
    <a href="#/shop" class="btn btn-primary btn-sm" style="margin-top:16px">Shop all bats</a>
  </div></div></section>`;
}

/* ---------------- cart drawer render ---------------- */
function renderCart() {
  const body = $('#cartBody'), foot = $('#cartFoot');
  if (!cart.length) {
    body.innerHTML = `<div class="empty" style="padding:60px 0">
      <b>Bag is empty</b><p>Nothing in here yet.</p>
      <a href="#/shop" class="btn btn-primary btn-sm" style="margin-top:16px" data-close>Shop Bats</a></div>`;
    foot.classList.add('hide');
    return;
  }
  body.innerHTML = cart.map(i => {
    const p = byId(i.id), v = variantName(p, i.variant);
    return `<div class="ci">
      <a class="ci-art" href="#/product/${p.id}" data-close>${batArt(p, { glow: false })}</a>
      <div class="ci-b">
        <h4><a href="#/product/${p.id}" data-close>${esc(p.name)}</a></h4>
        ${v ? `<div class="v">${esc(v)}</div>` : ''}
        <div class="ci-foot">
          <div class="qty">
            <button data-q="-1" data-key="${i.key}" aria-label="Decrease">−</button>
            <i class="num">${i.qty}</i>
            <button data-q="1" data-key="${i.key}" aria-label="Increase">+</button>
          </div>
          <span class="ci-price num">${hasPrice(p) ? fmt(p.price * i.qty) : 'On request'}</span>
        </div>
        <button class="ci-rm" data-rm="${i.key}">Remove</button>
      </div>
    </div>`;
  }).join('');

  const sub = cartSubtotal(), sh = shipFee(), off = couponOff();
  foot.classList.remove('hide');
  foot.innerHTML = `<div style="width:100%">
    <div class="sum"><span>Subtotal</span><span class="num">${fmt(sub)}</span></div>
    <div class="sum"><span>Shipping</span><span class="${sh === 0 ? 'free' : 'num'}">${sh === 0 ? 'FREE' : fmt(sh)}</span></div>
    ${off > 0 ? `<div class="sum"><span>Discount (${coupon})</span><span class="off num">− ${fmt(off)}</span></div>` : ''}
    <div class="sum tot"><span>Total</span><span class="num">${fmt(sub + sh - off)}</span></div>
    <a href="#/checkout" class="btn btn-primary btn-block" style="margin-top:14px" data-close>
      Checkout ${ICON.arrow}</a>
    <a href="${waLink(cartWaText(null))}" target="_blank" rel="noopener"
       class="btn btn-wa btn-block" style="margin-top:9px">${ICON.whatsapp} Order on WhatsApp</a>
  </div>`;
}

/* ---------------- drawers ---------------- */
function openDrawer(sel) {
  $(sel).classList.add('open');
  document.body.classList.add('no-scroll');
}
function closeDrawers() {
  $$('.drawer').forEach(d => d.classList.remove('open'));
  document.body.classList.remove('no-scroll');
}

/* ---------------- search ---------------- */
function runSearch(q) {
  const box = $('#sResults');
  q = q.trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = `<p style="color:var(--ink-50);font-size:.85rem">Type at least 2 letters.</p>`; return; }
  const hay = p => [p.name, p.tagline, WOOD[p.wood] && WOOD[p.wood].label,
    PROFILE[p.profile] && PROFILE[p.profile].label, p.finish, p.handle, p.description,
    (p.features || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
  const hits = PRODUCTS.filter(p => hay(p).includes(q)).slice(0, 8);
  const art = p => prodCat(p) === 'bats'
    ? batArt(p, { glow: false })
    : ((p.images || [])[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : '📦');
  box.innerHTML = hits.length
    ? hits.map(p => `<a class="ci" href="#/product/${p.id}" data-close style="text-decoration:none">
        <div class="ci-art">${art(p)}</div>
        <div class="ci-b"><h4>${esc(p.name)}</h4>
          <div class="v">${prodCat(p) === 'bats'
            ? `${WOOD[p.wood].short} · ${PROFILE[p.profile].label}`
            : esc((typeof CATEGORIES !== 'undefined' &&
                (CATEGORIES.find(c => c.id === prodCat(p)) || {}).name) || '')}</div>
          <span class="ci-price num" style="margin:0">${hasPrice(p) ? fmt(p.price) : 'On request'}</span>
        </div></a>`).join('')
    : `<p style="color:var(--ink-50);font-size:.85rem">Nothing matched “${esc(q)}”. Try “scoop” or “kashmir”.</p>`;
}

/* ---------------- checkout logic ---------------- */
let payMethod = 'wa';

function readForm() {
  return {
    name:   $('#cName').value.trim(),
    phone:  $('#cPhone').value.trim(),
    pin:    $('#cPin').value.trim(),
    address:$('#cAddr').value.trim(),
    city:   $('#cCity').value.trim(),
    state:  $('#cState').value.trim(),
    notes:  $('#cNotes').value.trim()
  };
}
function validate() {
  const rules = [
    ['#cName',  v => v.length >= 2,          'Please enter your name'],
    ['#cPhone', v => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10 digit number'],
    ['#cPin',   v => /^\d{6}$/.test(v),      'Enter a valid 6 digit PIN code'],
    ['#cPin',   v => pinServed(v),           'Our couriers do not reach this PIN code yet — message us on WhatsApp'],
    ['#cAddr',  v => v.length >= 8,          'Please enter your address'],
    ['#cCity',  v => v.length >= 2,          'Enter your city'],
    ['#cState', v => v.length >= 2,          'Enter your state']
  ];
  let ok = true, first = null;
  rules.forEach(([sel, test, msg]) => {
    const el = $(sel), m = el.parentElement.querySelector('.msg');
    if (!test(el.value.trim())) {
      el.classList.add('err'); m.textContent = msg; m.classList.remove('hide');
      ok = false; if (!first) first = el;
    } else {
      el.classList.remove('err'); m.classList.add('hide');
    }
  });
  if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); first.focus({ preventScroll: true }); }
  return ok;
}
function newOrderId() {
  return 'TOSS-' + Date.now().toString(36).toUpperCase().slice(-6) +
         '-' + Math.floor(Math.random() * 900 + 100);
}
function completeOrder(method, info) {
  lastOrder = {
    id: newOrderId(), method, info,
    items: cart.slice(),
    subtotal: cartSubtotal(), shipping: shipFee(),
    total: grandTotal(),
    coupon: couponOff() > 0 ? couponCode() : null, off: couponOff()
  };
  /* fire and forget — a network problem must not cost the customer their order */
  if (typeof pushOrder === 'function') pushOrder(lastOrder);
  cart = []; saveCart(); syncCart();
  coupon = null; saveCoupon();          /* a code is single-use */
  route();
  window.scrollTo(0, 0);
}
function payOnline(info) {
  const amount = grandTotal() * 100;
  if (RAZORPAY_KEY.includes('REPLACE')) {
    toast('Demo mode — add your Razorpay key to go live');
    setTimeout(() => completeOrder('online', info), 900);
    return;
  }
  const rzp = new window.Razorpay({
    key: RAZORPAY_KEY,
    amount, currency: 'INR',
    name: 'Toss Sports',
    description: cart.map(i => byId(i.id).name).join(', ').slice(0, 200),
    prefill: { name: info.name, contact: info.phone },
    notes: { address: info.address + ', ' + info.city + ' ' + info.pin },
    theme: { color: '#FF8A1E' },
    handler: () => completeOrder('online', info)
  });
  rzp.open();
}
function loadRazorpay() {
  if (window.Razorpay || $('#rzpJs')) return;
  const s = document.createElement('script');
  s.id = 'rzpJs';
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  document.head.appendChild(s);
}

/* ---------------- router ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const q = {};
  if (qs) qs.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) q[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { path, q };
}

function route(keepScroll) {
  const { path, q } = parseHash();
  const parts = path.split('/').filter(Boolean);
  const page = parts[0] || 'home';

  /* shop deep links replace filter state entirely — never accumulate */
  if (page === 'shop' && !keepScroll) applyShopQuery(q);

  /* leaving checkout retires the confirmation screen */
  if (page !== 'checkout') lastOrder = null;

  let html, dark = false;
  if (page === 'home')            { html = viewHome();          dark = true; }
  else if (page === 'shop')       { html = viewShop();          dark = true; }
  else if (page === 'product')    { html = viewProduct(parts[1]); dark = true; }
  else if (page === 'finder')     { html = viewFinder();        dark = true; }
  else if (page === 'game')       { html = viewGame();          dark = true; }
  else if (page === 'checkout')   { html = viewCheckout();      dark = false; }
  else if (page === 'service')    { html = viewService(parts[1]); dark = true; }
  else if (page === 'track')      { html = viewTrack();         dark = true; }
  else if (page === 'junior')     { html = viewJunior();        dark = true; }
  else                            { html = viewNotFound();      dark = false; }

  stopCarousel();
  if (page !== 'game') TossCricket.destroy();
  app.innerHTML = html;
  $('#hdr').classList.toggle('onDark', dark);
  document.body.classList.toggle('pdp-open', page === 'product');

  $$('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + path));

  if (!keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (typeof trackPage === 'function') trackPage();
  mount(page, parts);
  observeReveal();
  onScroll();
}

/* ---------------- hero carousel ---------------- */
let car = null, hvParallax = null;
const CAR_MS = 6500;

function stopCarousel() {
  if (car && car.timer) clearInterval(car.timer);
  car = null;
  if (hvParallax) { window.removeEventListener('pointermove', hvParallax); hvParallax = null; }
}

function wireHero() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* pointer parallax on the coded slide — the bat leans a few px toward
     the cursor, the light cones drift the other way */
  const stage = $('#hvStage'), hero = $('#heroLive');
  if (hero && stage && !reduce && matchMedia('(pointer:fine)').matches) {
    const cones = $$('#heroLive .hv-cone');
    hvParallax = e => {
      const r = hero.getBoundingClientRect();
      if (e.clientY > r.bottom || r.bottom < 0 || r.width === 0) return;
      const nx = (e.clientX / innerWidth - .5) * 2;
      stage.style.transform = `translateX(${nx * 9}px)`;
      cones.forEach(c => c.style.transform =
        `${c.classList.contains('l') ? 'rotate(20deg)' : 'rotate(-20deg)'} translateX(${nx * -6}px)`);
    };
    window.addEventListener('pointermove', hvParallax);
  }

  /* the slide-across engine — one slide pushes out the last, exactly the
     Amazon motion: autoplay, arrows, dots, swipe with an axis lock,
     progress bar, and inert on hidden slides so nothing invisible can be
     focused or clicked */
  const root = $('#car'), track = $('#carTrack');
  if (!root || !track) return;
  const slides = $$('.car-slide', track);
  const dots = $$('#carDots button');
  const bar = $('#carBar');

  car = { i: 0, n: slides.length, timer: null, t0: 0 };

  function paint() {
    track.style.transform = `translateX(-${car.i * 100}%)`;
    dots.forEach((d, k) => d.classList.toggle('on', k === car.i));
    slides.forEach((s, k) => {
      const off = k !== car.i;
      s.setAttribute('aria-hidden', off ? 'true' : 'false');
      if (off) s.setAttribute('inert', ''); else s.removeAttribute('inert');
    });
    root.scrollLeft = 0; track.scrollLeft = 0;
  }
  function go(i, manual) {
    car.i = (i + car.n) % car.n;
    paint();
    if (manual) restart();
  }
  function tick() { go(car.i + 1); }
  function restart() {
    if (!car) return;
    if (car.timer) clearInterval(car.timer);
    if (reduce) return;
    car.t0 = performance.now();
    car.timer = setInterval(tick, CAR_MS);
  }

  $('#carPrev').onclick = () => go(car.i - 1, true);
  $('#carNext').onclick = () => go(car.i + 1, true);
  dots.forEach(d => d.onclick = () => go(+d.dataset.go, true));

  root.addEventListener('mouseenter', () => car && car.timer && clearInterval(car.timer));
  root.addEventListener('mouseleave', () => car && restart());

  /* swipe — only hijacks a gesture that's clearly horizontal */
  let x0 = null, y0 = null, dx = 0, lock = null;
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; lock = null;
    if (car && car.timer) clearInterval(car.timer);
  });
  root.addEventListener('pointermove', e => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (lock === 'x') root.classList.add('dragging');
    }
    if (lock === 'x') {
      e.preventDefault();
      track.style.transform = `translateX(calc(-${car.i * 100}% + ${dx}px))`;
    }
  }, { passive: false });
  function endDrag() {
    if (x0 === null) return;
    root.classList.remove('dragging');
    if (lock === 'x' && Math.abs(dx) > 55) go(car.i + (dx < 0 ? 1 : -1));
    else paint();
    x0 = null; lock = null;
    restart();
  }
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('pointerleave', endDrag);

  /* a banner is one big link — unless the tap was a swipe, or landed on a
     real button inside the mobile overlay */
  $$('.car-slide[data-href]', track).forEach(s => {
    const open = () => {
      const h = s.dataset.href;
      if (s.dataset.ext) window.open(h, '_blank', 'noopener');
      else location.hash = h.slice(1);
    };
    s.addEventListener('click', e => {
      if (Math.abs(dx) > 10) return;
      if (e.target.closest('a, button')) return;
      open();
    });
    s.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  go(car.i - 1, true);
    if (e.key === 'ArrowRight') go(car.i + 1, true);
  });

  /* progress bar */
  (function frame() {
    if (!car) return;
    if (bar) bar.style.width = car.timer
      ? Math.min(100, ((performance.now() - car.t0) % CAR_MS) / CAR_MS * 100) + '%'
      : '0%';
    requestAnimationFrame(frame);
  })();

  paint();
  restart();
}

/* ---------------- per-view wiring ---------------- */
function mount(page, parts) {
  clearInterval(BOARD_TIMER);   /* the big screen only runs on the game page */
  if (page === 'home') { wireHero(); wireTrust(); }
  if (page === 'service') wireService(parts[1]);
  if (page === 'track')   wireTrack();

  if (page === 'game') {
    BOARD_TIMER = setInterval(boardTick, 250);
    const host = $('#gameHost');
    TossCricket.mount(host, {
      onEnd: res => {
        localStorage.setItem('toss_played', JSON.stringify(readLS('toss_played', 0) + 1));

        /* coupons — resolved from the bundled table straight away so the
           screen never stalls, then upgraded if the database answers.
           This callback must stay synchronous: the game uses its return
           value to draw the end-of-innings message. */
        const wonAll = [];
        const grant = code => {
          if (!code || unlocked.includes(code)) return null;
          unlocked.push(code); saveUnlocked();
          wonAll.push(code);
          return code;
        };
        let won = null;
        Object.keys(COUPONS).forEach(code => {
          if (res.runs >= COUPONS[code].runs) won = grant(code) || won;
        });

        const refresh = w => {
          $('#rewards').innerHTML = rewardHTML(w);
          const b = $('#bdBest'); if (b) b.textContent = bestScore() || '–';
          if (w) runReveals();
        };
        refresh(won);
        /* the board reveals quietly behind; the splash is the moment */
        if (wonAll.length) {
          rewardSplash(wonAll);
          document.dispatchEvent(new CustomEvent('toss:reward'));
        }

        /* the database is the authority on what a score earns; if it grants
           something the bundled table did not, reveal that too */
        if (typeof claimRewardRemote === 'function') {
          claimRewardRemote(res.runs).then(rows => {
            if (!rows) return;
            let extra = null;
            rows.forEach(r => { extra = grant(r.code) || extra; });
            if (extra) {
              refresh(extra);
              rewardSplash([extra]);
              if (TossCricket.state) TossCricket.state.coupon = extra;
            }
          });
        }

        /* name prompt on top of the board */
        $('#lbBox').innerHTML = `
          <p class="lb-just">You scored <b>${res.runs}/${res.wkts}</b> off ${res.balls} balls.</p>
          <div class="namebox">
            <input id="lbName" placeholder="Your name" maxlength="12">
            <button class="btn btn-primary btn-sm" id="lbSave">Save</button>
          </div>
          <div style="margin-top:14px">${leaderboardHTML()}</div>`;
        $('#lbSave').onclick = () => {
          const n = ($('#lbName').value || 'Player').trim() || 'Player';
          saveScore(n, res.runs, res.wkts);
          if (typeof pushScore === 'function') pushScore(n, res.runs, res.wkts, res.balls);
          $('#lbBox').innerHTML = leaderboardHTML();
          refresh();
          toast('Score saved');
        };
        return won;
      }
    });
  }

  if (page === 'shop') {
    const side = $('#sideFilters');
    if (side) side.innerHTML = filterPanelHTML();
    $('#fBody').innerHTML = filterPanelHTML();

    const sort = $('#sortSel');
    if (sort) sort.onchange = e => { filters.sort = e.target.value; pushFilters(); };

    const fo = $('#fOpen'); if (fo) fo.onclick = () => openDrawer('#filterDrawer');
    const ca = $('#clearAll'); if (ca) ca.onclick = clearFilters;

    $$('[data-chip]').forEach(b => b.onclick = () => {
      const [g, v] = b.dataset.chip.split(':'); toggleFilter(g, v);
    });
  }

  if (page === 'product') {
    /* thumbnail strip swaps the main image; only present once photos exist */
    $$('.pdp-th').forEach(t => t.onclick = () => {
      const main = $('#pdpMain');
      if (main && main.tagName === 'IMG') main.src = t.dataset.img;
      $$('.pdp-th').forEach(x => x.classList.toggle('on', x === t));
    });

    /* zoom — the photo itself and the button both open it, at whichever
       shot is currently showing */
    (function wireZoom() {
      const p = byId(parts[1]);
      const imgs = (p && p.images || []).filter(Boolean);
      if (!imgs.length) return;
      const openHere = () => {
        const cur = $('#pdpMain');
        const at = Math.max(0, imgs.findIndex(s => cur && cur.src.endsWith(s)));
        openZoom(imgs, at, p.name);
      };
      const main = $('#pdpMain');
      if (main && main.tagName === 'IMG') main.onclick = openHere;
      const zb = $('#pdpZoom');
      if (zb) zb.onclick = openHere;
    })();
    /* the review screenshot opens full size, same lightbox as the trust band */
    $$('.pdp-rev [data-note], .pdp-rev-img').forEach(b => b.onclick = () => {
      const src = b.dataset.note || b.querySelector('img').src;
      const box = document.createElement('div');
      box.className = 'tb-lb';
      box.innerHTML = `<img src="${src}" alt="Customer message">
                       <button class="tb-lb-x" aria-label="Close">${ICON.close}</button>`;
      document.body.appendChild(box);
      document.body.classList.add('no-scroll');
      const close = () => { box.remove(); document.body.classList.remove('no-scroll'); };
      box.onclick = close;
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
      });
    });

    const p = byId(parts[1]);
    if (!p) return;
    let variant = p.variants ? p.variants[1].id : null;

    $$('#variants .opt').forEach(b => b.onclick = () => {
      $$('#variants .opt').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      variant = b.dataset.v;
    });

    /* engraving: the text box only exists once the option is on */
    const engOn = $('#engOn'), engTxt = $('#engTxt');
    if (engOn && engTxt) {
      engOn.onchange = () => {
        engTxt.classList.toggle('hide', !engOn.checked);
        if (engOn.checked) engTxt.focus();
      };
    }
    const engraving = () => (engOn && engOn.checked ? engTxt.value : '');

    const add = () => {
      if (engOn && engOn.checked && !engTxt.value.trim()) {
        engTxt.classList.add('err'); engTxt.focus();
        toast('Type what you want engraved');
        return;
      }
      addToCart(p.id, variant, engraving());
    };
    ['#addBtn', '#addBtn2'].forEach(s => { const el = $(s); if (el) el.onclick = add; });

    wireQA(p.id);

    const wa = () => {
      if (!hasPrice(p)) { enquire(p); return; }
      const v = variantName(p, variant);
      window.open(waLink(
        `Hi Toss Sports 👋\n\nI want to order:\n*${p.name}*${v ? '\nEdition: ' + v : ''}\nPrice: ${fmt(p.price)}\n\nIs it in stock?`
      ), '_blank');
    };
    ['#waBtn', '#waBtn2'].forEach(s => { const el = $(s); if (el) el.onclick = wa; });
  }

  if (page === 'finder') {
    $$('.q-opt').forEach(b => b.onclick = () => {
      quizAns[QUIZ[quizStep].key] = b.dataset.q;
      quizStep++;
      route(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    const back = $('#qBack');
    if (back) back.onclick = () => { quizStep = Math.max(0, quizStep - 1); route(true); };
    const rs = $('#qRestart');
    if (rs) rs.onclick = () => { quizStep = 0; quizAns = {}; route(true); };
  }

  if (page === 'checkout') {
    /* Serviceability and the delivery estimate resolve while the field is
       being typed in. Finding out we cannot reach you AFTER paying is the
       worst possible moment to learn it. */
    const pin = $('#cPin'), pinNote = $('#cPinNote');
    if (pin && pinNote) {
      const showPin = () => { pinNote.innerHTML = deliveryNote(pin.value); };
      pin.addEventListener('input', showPin);
      showPin();
    }
    trackEvent('begin_checkout', { value: grandTotal(), currency: 'INR' });
    payMethod = 'wa';
    loadRazorpay();

    $$('.pay-opt').forEach(o => o.onclick = () => {
      $$('.pay-opt').forEach(x => x.classList.remove('on'));
      o.classList.add('on');
      payMethod = o.dataset.pay;
      const btn = $('#placeBtn');
      if (!btn) return;
      if (payMethod === 'wa') {
        btn.className = 'btn btn-wa btn-block';
        btn.innerHTML = ICON.whatsapp + ' Send Order on WhatsApp';
      } else {
        btn.className = 'btn btn-primary btn-block';
        btn.innerHTML = ICON.rupee + ' Pay ' + fmt(grandTotal());
      }
    });

    const apply = $('#applyCoupon');
    if (apply) apply.onclick = async () => {
      const box = $('#couponMsg');
      const say = (t, ok) => {
        box.textContent = t;
        box.className = 'coupon-msg ' + (ok ? 'ok' : 'no');
      };
      if (coupon) { coupon = null; couponMeta = null; saveCoupon(); route(true); toast('Discount removed'); return; }

      const code = ($('#cCoupon').value || '').trim().toUpperCase();
      if (!code) return say('Enter a code first', false);

      /* Ask the database first — it holds the real discount rules and never
         exposes the coupon list. Only fall back to the bundled table offline. */
      if (typeof validateCouponRemote === 'function') {
        apply.disabled = true;
        const r = await validateCouponRemote(code, cartSubtotal());
        apply.disabled = false;
        if (r) {
          if (!r.valid) return say(r.reason || 'That code cannot be used', false);
          coupon = code;
          couponMeta = { off: r.off, min: 0 };   /* server already checked the minimum */
          if (!unlocked.includes(code)) { unlocked.push(code); saveUnlocked(); }
          saveCoupon(); route(true);
          return toast((r.label || 'Discount') + ' applied');
        }
      }

      const c = COUPONS[code];
      if (!c)                       return say('That code doesn\'t exist', false);
      if (!unlocked.includes(code)) return say('Score ' + c.runs + ' in Gully Cricket to unlock this code', false);
      if (cartSubtotal() < c.min)   return say(code + ' needs a subtotal of ' + fmt(c.min) + ' or more', false);

      coupon = code; couponMeta = null; saveCoupon();
      route(true);
      toast(c.label + ' applied');
    };

    const place = $('#placeBtn');
    if (place) place.onclick = () => {
      if (!validate()) { toast('Please check the highlighted fields'); return; }
      const info = readForm();
      if (payMethod === 'wa') {
        window.open(waLink(cartWaText(info)), '_blank');
        completeOrder('wa', info);
      } else {
        payOnline(info);
      }
    };
  }
}

/* ---------------- global wiring ---------------- */
function onScroll() {
  const y = window.scrollY;
  const hdr = $('#hdr');
  hdr.classList.toggle('solid', y > 24);

  /* The announcement bar is a normal block that scrolls away, but the header
     is fixed at top:34px to sit below it. Left alone that offset persists
     after the bar is gone, leaving a 34px strip of the page showing above
     the header. Track the bar on the way out, then pin to the top. */
  const annc = document.querySelector('.annc');
  if (annc && document.body.classList.contains('has-annc')) {
    const h = annc.offsetHeight || 34;
    hdr.style.top = Math.max(0, h - y) + 'px';
  }

  const bb = $('#buybar');
  if (bb) bb.classList.toggle('show', y > 420);
}

let io;
function observeReveal() {
  if (io) io.disconnect();
  io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
  $$('.rv').forEach(el => io.observe(el));
}

document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) { e.preventDefault(); addToCart(add.dataset.add); return; }

  const q = e.target.closest('[data-q]');
  if (q) { setQty(q.dataset.key, +q.dataset.q); return; }

  const rm = e.target.closest('[data-rm]');
  if (rm) { removeItem(rm.dataset.rm); return; }

  if (e.target.closest('[data-close]')) { closeDrawers(); return; }

  const chk = e.target.closest('.chk input');
  if (chk) { setTimeout(() => toggleFilter(chk.dataset.f, chk.value), 0); return; }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('hashchange', () => { closeDrawers(); route(); });

/* boot */
(function init() {
  $('#searchBtn').innerHTML = ICON.search;
  $('#cartIco').innerHTML   = ICON.cart;
  $('#cartClose').innerHTML = ICON.close;
  $('#fClose').innerHTML    = ICON.close;
  $('#sClose').innerHTML    = ICON.close;
  $('#fInsta').innerHTML    = ICON.insta;
  $('#fWa').innerHTML       = ICON.whatsapp;
  $('#yr').textContent      = new Date().getFullYear();

  $('#cartBtn').onclick   = () => { renderCart(); openDrawer('#cartDrawer'); };
  $('#searchBtn').onclick = () => { openDrawer('#searchDrawer'); setTimeout(() => $('#sInput').focus(), 320); runSearch(''); };
  $('#sInput').oninput    = e => runSearch(e.target.value);
  $('#fReset').onclick    = () => { clearFilters(); };

  syncCart();
  route();

  /* the playful bits, mounted last so nothing above depends on them */
  if (typeof NavPlay !== 'undefined') NavPlay.mount();
  /* after first paint — measurement must never delay the page it measures */
  if (typeof loadAnalytics === 'function') requestAnimationFrame(loadAnalytics);
  if (typeof Bot !== 'undefined') Bot.mount();

  /* Live data is fetched AFTER the page is already interactive.
     This used to be awaited at the top of init(), which meant one hanging
     request to Supabase stopped the entire site from rendering — no icons,
     no routing, no nav, no bot. The shop must never wait on the network:
     it renders from the bundled catalogue immediately and quietly upgrades
     itself if live data arrives. */
  (async () => {
    try {
      if (typeof syncStore === 'function') {
        const live = await syncStore();
        if (live && (live.products || live.settings || live.categories)) route(true);
      }
    } catch (e) { console.warn('catalogue sync skipped:', e.message); }

    try {
      if (typeof fetchScores === 'function') {
        const s = await fetchScores(8);
        if (s) localStorage.setItem('toss_scores', JSON.stringify(s));
      }
    } catch (e) { console.warn('leaderboard sync skipped:', e.message); }
  })();
})();
