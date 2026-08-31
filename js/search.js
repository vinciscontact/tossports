/* ============================================================
   TOSS — SEARCH

   What this replaces: one includes() against every field of every
   product mashed into a single string, capped at eight, returned
   in catalogue order. That meant "kashmir scoop" found nothing —
   the two words never appear adjacent — a single typo found
   nothing, a search for "repair" found nothing because Bat Doctor
   is not a product, and when something did match, the order it
   came back in was an accident of the array.

   Three things are different now.

   1. IT LOOKS IN MORE PLACES. Products, the seven service pages,
      and a small table of everyday questions — warranty, delivery,
      "where is my order". A shop's search box is where people put
      what they want, and most of what they want is not a SKU.

   2. IT TOLERATES HOW PEOPLE ACTUALLY TYPE. Words in any order,
      partial words, and near-misses inside a bounded edit
      distance. "scop", "kashmiri", "mongose" all land.

   3. IT RANKS. A hit on the NAME outweighs a hit buried in a
      feature list, and the closer the match the more it counts,
      so the best answer is first rather than whichever product
      happens to sit earliest in products.js.

   Deliberately NOT here: parsing sentences like "light bat under
   2000", a synonym table, and keyboard navigation. Each was
   offered and each was left out, so the surface stays small
   enough to reason about. There is no index to invalidate and no
   library: 30 products scored on every keystroke is well under a
   millisecond, and the catalogue is refreshed from Supabase at
   runtime — anything precomputed would need rebuilding when it
   lands, for no gain at this size.
   ============================================================ */

/* ------------------------------------------------------------
   Text handling.

   Normalise before anything else: lower case, strip accents, and
   treat every non-alphanumeric as a break. That last one matters
   more than it looks — "big-edge", "big edge" and "bigedge" are
   the same request, and the catalogue spells it all three ways.
   ------------------------------------------------------------ */
function sNorm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // é → e
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sWords(s) {
  const n = sNorm(s);
  return n ? n.split(' ') : [];
}

/* Words too small to carry meaning here. Kept short on purpose: an
   over-eager stop list throws away real queries, and "no" and "pro"
   are both things somebody might genuinely be looking for. */
const S_STOP = { a:1, an:1, the:1, of:1, for:1, and:1, or:1, to:1, in:1, on:1,
                 with:1, my:1, me:1, i:1, is:1, it:1 };

/* ------------------------------------------------------------
   Bounded edit distance.

   Full Levenshtein, but abandoned as soon as an entire row of the
   matrix exceeds the budget — no candidate can improve after that,
   and it means a long word compared against a short one costs
   almost nothing. Called a few thousand times per keystroke in the
   worst case, which is why it bails early rather than being
   elegant.
   ------------------------------------------------------------ */
function sEdits(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (a === b) return 0;

  let prev = new Array(lb + 1);
  let cur  = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let best = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;      // whole row is already too far
    const t = prev; prev = cur; cur = t;
  }
  return prev[lb];
}

/* How wrong a word is allowed to be before it stops counting.
   Short words get no slack at all — at three letters an edit
   distance of one turns "bat" into "bag", "cat" and "bad", which
   is not tolerance, it is noise. */
function sBudget(len) {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

/* ------------------------------------------------------------
   Scoring one query word against one indexed field.

   The four tiers are ordered by how much confidence each deserves:
   somebody typing the exact word means it, a prefix is usually a
   word half-typed, a substring is a decent guess, and an edit
   away is a rescue. Weighted by which field matched, so "Scoop" in
   a product NAME beats "scoop" mentioned in a feature line.
   ------------------------------------------------------------ */
function sFieldScore(token, field) {
  const words = field.w;
  let best = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === token) { best = Math.max(best, 1); break; }         // nothing beats exact
    if (w.length > token.length && w.startsWith(token)) best = Math.max(best, .78);
    else if (w.indexOf(token) >= 0)                     best = Math.max(best, .55);
  }

  /* Only pay for the fuzzy pass when nothing literal matched. It is by
     far the most expensive branch and by far the least trustworthy. */
  if (best === 0) {
    const budget = sBudget(token.length);
    if (budget > 0) {
      for (let i = 0; i < words.length; i++) {
        const d = sEdits(token, words[i], budget);
        if (d <= budget) {
          /* One edit out is worth more than two. */
          best = Math.max(best, .42 - (d - 1) * .12);
        }
      }
    }
  }

  return best * field.f;
}

/* ------------------------------------------------------------
   Scoring a whole entry.

   Every query word has to land SOMEWHERE, which is what makes
   "kashmir scoop" narrow rather than widen. A word that matches
   nothing disqualifies the entry outright — the alternative, an
   OR, returns every bat the moment somebody types the word "bat".
   ------------------------------------------------------------ */
function sScore(entry, tokens) {
  let total = 0;
  for (let t = 0; t < tokens.length; t++) {
    let best = 0;
    for (let f = 0; f < entry.fields.length; f++) {
      const s = sFieldScore(tokens[t], entry.fields[f]);
      if (s > best) best = s;
    }
    if (best === 0) return 0;            // one miss and the entry is out
    total += best;
  }
  /* A whisper of popularity, purely to break ties between two products
     that matched identically. Small enough that it can never lift a
     weaker match above a stronger one. */
  return total + (entry.pop || 0) * 0.0008;
}

/* ------------------------------------------------------------
   Building the searchable entries.

   Rebuilt on every open rather than cached: the catalogue is
   synced from Supabase after first paint, so a cache built at boot
   would be a cache of the bundled fallback. Thirty products is a
   few hundred string operations — cheaper than the bug.

   The `f` on each field is its weight.
   ------------------------------------------------------------ */
function sFields(pairs) {
  return pairs
    .filter(p => p[0])
    .map(p => ({ w: sWords(p[0]), f: p[1] }))
    .filter(p => p.w.length);
}

/* Everyday questions that are not products and not services. Without
   these, "warranty" and "where is my order" — two of the things people
   most want from a shop — returned nothing at all. */
const S_HELP = [
  { title: 'Track your order',      sub: 'No account needed', href: '#/track',
    terms: 'track tracking where is my order delivery status courier parcel shipped dispatch consignment' },
  { title: 'Your account',          sub: 'Orders, repairs and saved details', href: '#/account',
    terms: 'account login log in sign in signup sign up register password order history profile address' },
  { title: 'Warranty',              sub: '3 and 6 month cover, added at checkout', href: '#/checkout',
    terms: 'warranty guarantee cover breakage broken replace replacement insurance protection add on' },
  { title: 'Delivery and shipping', sub: 'Free over ₹1,500', href: '#/checkout',
    terms: 'delivery shipping courier free postage charges pin code pincode serviceable how long days' },
  { title: 'Find My Bat',           sub: 'Answer a few questions, get a shortlist', href: '#/finder',
    terms: 'find my bat which bat recommend recommendation help me choose suggest right bat quiz size weight' },
  { title: 'Play Gully Cricket',    sub: 'Score runs, unlock a discount', href: '#/game',
    terms: 'game play win gully cricket discount coupon code offer leaderboard score runs free' }
];

/* One product, as a scorable entry. Exported separately because the shop
   page scores products with it too — "See all N products" has to rank the
   full list the same way the panel ranked the top few, or the first row of
   the shop would disagree with the row the person just clicked past. */
function prodEntry(p) {
  const cats  = (typeof CATEGORIES !== 'undefined' && CATEGORIES) || [];
  const isBat = prodCat(p) === 'bats';
  const wood  = (WOOD[p.wood] || {});
  const prof  = (PROFILE[p.profile] || {});
  const cat   = cats.find(c => c.id === prodCat(p)) || {};

  return {
    kind: 'product',
    p,
    href: '#/product/' + p.id,
    title: p.name,
    sub: isBat
      ? [wood.short, prof.label].filter(Boolean).join(' · ')
      : (cat.name || ''),
    pop: p.popularity || 0,
    fields: sFields([
      [p.name, 10],
      [p.tagline, 5],
      /* The words a shopper actually reaches for: a wood, a shape, a
         category. Weighted just under the name because they describe
         a whole group rather than one bat. */
      [[wood.label, wood.short, prof.label, cat.name, p.finish, p.edge,
        p.handle, (p.badges || []).join(' ')].filter(Boolean).join(' '), 6],
      [prof.blurb, 3],
      [p.usage, 3],
      [(p.features || []).join(' '), 2.5],
      [p.description, 2.5],
      /* Price and weight as bare digits, so "950" or "700g" finds
         something. Not a range query — just the numbers themselves. */
      [[hasPrice(p) ? p.price : '', (p.weight || []).join(' '),
        (typeof TIER_LABEL !== 'undefined' && TIER_LABEL[p.tier]) || '']
        .filter(Boolean).join(' '), 2]
    ])
  };
}

function sBuild() {
  const out = [];

  /* ---- products ---- */
  (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).forEach(p => out.push(prodEntry(p)));

  /* ---- services ---- */
  const svc = (typeof SVC !== 'undefined' && SVC) || {};
  Object.keys(svc).forEach(k => {
    const s = svc[k];
    out.push({
      kind: 'service',
      href: '#/service/' + s.slug,
      title: s.title,
      sub: s.eyebrow || '',
      icon: k,
      pop: 0,
      fields: sFields([
        [s.title, 10],
        [s.eyebrow, 6],
        [k.replace(/_/g, ' '), 6],
        [s.lede, 3]
      ])
    });
  });

  /* ---- help ---- */
  S_HELP.forEach(h => {
    out.push({
      kind: 'help',
      href: h.href,
      title: h.title,
      sub: h.sub,
      pop: 0,
      fields: sFields([[h.title, 9], [h.terms, 5], [h.sub, 3]])
    });
  });

  return out;
}

/* ------------------------------------------------------------
   The query.
   ------------------------------------------------------------ */
const S_MAX_PER_GROUP = 6;
const S_MAX_TOTAL     = 14;

function sQuery(raw) {
  let tokens = sWords(raw).filter(t => !S_STOP[t]);
  /* If somebody typed nothing BUT stop words, use them rather than
     answering an apparently non-empty box with nothing. */
  if (!tokens.length) tokens = sWords(raw);
  if (!tokens.length) return [];

  const hits = [];
  sBuild().forEach(e => {
    const s = sScore(e, tokens);
    if (s > 0) hits.push({ e, s });
  });
  hits.sort((a, b) => b.s - a.s);
  return hits;
}

/* ------------------------------------------------------------
   Rendering.
   ------------------------------------------------------------ */
const S_GROUPS = [
  ['product', 'Products'],
  ['service', 'Services'],
  ['help',    'Help']
];

function sRowHTML(e) {
  if (e.kind === 'product') {
    const t = prodTile(e.p);
    return `<a class="ci sr-row" href="${e.href}" data-close>
      <span class="${t.cls}">${t.art}</span>
      <span class="ci-b">
        <b class="sr-t">${esc(e.title)}</b>
        ${e.sub ? `<span class="v">${esc(e.sub)}</span>` : ''}
        <span class="ci-price num sr-p">${hasPrice(e.p) ? fmt(e.p.price) : 'On request'}</span>
      </span>
    </a>`;
  }

  /* Services carry their own key from the index, so the drawing comes
     straight out of SVC_ART rather than being reverse-looked-up from the
     slug in the href. */
  const glyph = (e.kind === 'service' && typeof SVC_ART !== 'undefined' && SVC_ART[e.icon])
    || (e.kind === 'service' ? ICON.hammer : ICON.search);

  return `<a class="ci sr-row sr-row--flat" href="${e.href}" data-close>
    <span class="sr-ico sr-ico--${e.kind}">${glyph}</span>
    <span class="ci-b">
      <b class="sr-t">${esc(e.title)}</b>
      ${e.sub ? `<span class="v">${esc(e.sub)}</span>` : ''}
    </span>
    <span class="sr-go">${ICON.arrow}</span>
  </a>`;
}

/* What the panel shows before a single letter is typed. It used to be
   an empty white rectangle with "Type at least 2 letters" in it —
   a whole screen of nothing at the exact moment somebody is deciding
   what they want. */
const S_POPULAR = ['scoop', 'kashmir', 'big edge', 'flat bat', 'mongoose',
                   'repair', 'jersey', 'under 1500'];

function sIdleHTML() {
  const cats = (typeof CATEGORIES !== 'undefined' && CATEGORIES) || [];
  const top = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : [])
    .filter(p => prodCat(p) === 'bats' && hasPrice(p))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 3);

  return `
    <div class="sr-sec">
      <p class="sr-h">Popular searches</p>
      <div class="sr-chips">
        ${S_POPULAR.map(t => `<button type="button" class="sr-chip" data-q="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
    </div>

    ${cats.length ? `<div class="sr-sec">
      <p class="sr-h">Browse</p>
      <div class="sr-chips">
        ${cats.map(c => `<a class="sr-chip" href="#/shop?cat=${esc(c.id)}" data-close>${esc(c.name)}</a>`).join('')}
      </div>
    </div>` : ''}

    ${top.length ? `<div class="sr-sec">
      <p class="sr-h">Best sellers</p>
      ${top.map(p => sRowHTML({ kind: 'product', p, href: '#/product/' + p.id,
        title: p.name,
        sub: [(WOOD[p.wood] || {}).short, (PROFILE[p.profile] || {}).label]
               .filter(Boolean).join(' · ') })).join('')}
    </div>` : ''}`;
}

function sEmptyHTML(q) {
  return `
    <div class="sr-none">
      <b>Nothing matched “${esc(q)}”.</b>
      <p>Try a wood, a shape, or what you want done with it.</p>
      <div class="sr-chips">
        ${['kashmir', 'scoop', 'big edge', 'repair', 'jersey']
          .map(t => `<button type="button" class="sr-chip" data-q="${t}">${t}</button>`).join('')}
      </div>
    </div>`;
}

function runSearch(q) {
  const box = $('#sResults');
  if (!box) return;

  const raw = String(q || '').trim();
  if (raw.length < 2) { box.innerHTML = sIdleHTML(); sWire(); return; }

  const hits = sQuery(raw);
  if (!hits.length) { box.innerHTML = sEmptyHTML(raw); sWire(); return; }

  /* Grouped, because a repair service and a bat in one flat list read as
     the same kind of thing and they are not. Products first — that is
     what the box is mostly for — then services, then help. */
  let shown = 0;
  const html = S_GROUPS.map(([kind, label]) => {
    const rows = hits.filter(h => h.e.kind === kind).slice(0, S_MAX_PER_GROUP);
    if (!rows.length || shown >= S_MAX_TOTAL) return '';
    const use = rows.slice(0, S_MAX_TOTAL - shown);
    shown += use.length;
    const total = hits.filter(h => h.e.kind === kind).length;
    return `<div class="sr-sec">
      <p class="sr-h">${label}${total > use.length ? ` <i>${use.length} of ${total}</i>` : ''}</p>
      ${use.map(h => sRowHTML(h.e)).join('')}
    </div>`;
  }).join('');

  const bats = hits.filter(h => h.e.kind === 'product').length;
  box.innerHTML = html + (bats > S_MAX_PER_GROUP
    ? `<a class="sr-all" href="#/shop?q=${encodeURIComponent(raw)}" data-close>
         See all ${bats} products ${ICON.arrow}</a>`
    : '');
  sWire();
}

/* The chips are buttons, not links, so they need rebinding after every
   repaint — innerHTML replaces the nodes the last pass wired up. */
function sWire() {
  $$('#sResults [data-q]').forEach(b => b.onclick = () => {
    const input = $('#sInput');
    if (!input) return;
    input.value = b.dataset.q;
    input.focus();
    runSearch(input.value);
  });
}
