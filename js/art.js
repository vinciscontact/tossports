/* ============================================================
   TOSS SPORTS — PROCEDURAL BAT RENDERER
   Draws a bat from a product's own spec fields, and hands over to
   real photography the moment a product has any. See batArt().
   ============================================================ */

/* ------------------------------------------------------------
   batArt — the one place that decides "photo or drawing".

   The drawing is a stand-in, not a house style. It exists so a bat
   with no photography yet still renders as something rather than an
   empty box, and it should step aside as soon as a real photo is
   uploaded in the Maze Room. 28 of 29 bats are still drawn today,
   so both paths stay live for a while.

   The photo it reaches for is the "-cut" variant: same shot with the
   white studio sweep knocked out and the empty margin trimmed off
   (see seo/cutout-photos.js). That matters because the raw studio
   file is ~88% white backdrop, so on a dark section it would read as
   a white card with a small bat marooned in it — the drawn art it
   replaces floats free, and the photo has to do the same to be a
   drop-in. If the cut file is somehow missing we fall back to the
   original rather than showing a broken image.

   It carries class="bat-art" deliberately: every sizing rule on the
   site already targets that class, so a photo lands at the right
   height in the hero, the flagship band, a card or the cart with no
   per-context CSS at all.

   Call sites that COMPARE or MORPH bats keep calling batSVG directly
   — the Find My Bat bench redraws the blade as you answer and the
   weight chooser scales it to true relative size. A photograph can
   do neither, so a photo there would be a downgrade, not an upgrade.

   If the cut file is missing the fallback is the DRAWING, not the
   original photo. That looks backwards until you picture it: these
   slots are all dark bands, and an uncut studio shot there is a
   white slab with a small bat adrift in it — visibly worse than the
   art it replaced. Falling back to the drawing means the worst case
   is exactly today's page, never something broken. Photos uploaded
   before the knockout existed can be backfilled from the Maze Room.
   ------------------------------------------------------------ */
const _batArtPending = {};

function batArt(p, opts) {
  opts = opts || {};
  const photo = ((p && p.images) || []).filter(Boolean)[0];
  if (!photo) return batSVG(p, opts);

  const a = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                          .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cut = photo.replace(/\.(webp|png|jpe?g)$/i, '-cut.webp');

  /* Park the drawing rather than inlining it in an attribute — the SVG is
     several kB of quotes and angle brackets, and no amount of escaping
     makes that a sane thing to put inside onerror="". */
  const key = 'k' + (_artUid++);
  _batArtPending[key] = batSVG(p, opts);

  return `<img class="bat-art bat-photo" src="${a(cut)}" alt="${a(p.name || '')}"
    data-fallback="${key}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async">`;
}

/* One delegated listener instead of an onerror attribute on every image.
   Inline handlers resolve against the page's global object, which is not
   somewhere a plain function declaration can be relied on to appear, and
   they are the first thing a Content-Security-Policy blocks. Image errors
   do not bubble, so this listens in the capture phase. */
document.addEventListener('error', e => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset || !img.dataset.fallback) return;
  const svg = _batArtPending[img.dataset.fallback];
  delete _batArtPending[img.dataset.fallback];
  if (svg && img.parentNode) { img.insertAdjacentHTML('afterend', svg); img.remove(); }
}, true);

/* A page can render many bats before any of them fail. Nothing here is
   large, but there is no reason to hold drawings for images that already
   loaded, so release each one on success too. */
document.addEventListener('load', e => {
  const img = e.target;
  if (img && img.tagName === 'IMG' && img.dataset && img.dataset.fallback) {
    delete _batArtPending[img.dataset.fallback];
    img.removeAttribute('data-fallback');
  }
}, true);

const WOOD_TONE = {
  srilankan: { lo: '#8E5A28', mid: '#C9884A', hi: '#E7B87E', grain: '#7A4A1E' },
  kashmir:   { lo: '#B0925F', mid: '#DFC79B', hi: '#F4E6C6', grain: '#9A7C4C' },
  poplar:    { lo: '#C0B08A', mid: '#E7DCC0', hi: '#F8F1DF', grain: '#A8966F' }
};

/* blade geometry per profile */
const GEO = {
  standard: { hEnd: 200, bx0: 62, bx1: 158 },
  scoop:    { hEnd: 200, bx0: 60, bx1: 160 },
  flat:     { hEnd: 205, bx0: 56, bx1: 164 },
  bigedge:  { hEnd: 195, bx0: 48, bx1: 172 },
  mongoose: { hEnd: 288, bx0: 62, bx1: 158 },
  multi:    { hEnd: 200, bx0: 56, bx1: 164 }
};

let _artUid = 0;

/* Catalogue extremes, used to draw each bat at its true relative size.
   Height only spans 34–36in (a 6% spread) so blade LENGTH barely moves —
   that's honest, not a bug. Weight spans 550–950g (73%), and a heavier bat
   really does carry more wood, so blade WIDTH is what visibly separates
   one model from the next. */
const SCALE_REF = { wMin: 550, wMax: 950, hMin: 34, hMax: 36 };

function batSVG(p, opts) {
  opts = opts || {};
  const uid = 'b' + (_artUid++);
  const tone = WOOD_TONE[p.wood] || WOOD_TONE.srilankan;
  const g = GEO[p.profile] || GEO.standard;
  let hEnd = g.hEnd, bx0 = g.bx0, bx1 = g.bx1;
  let bladeBot = 546;

  if (opts.trueScale && p.weight && p.height) {
    const R = SCALE_REF;
    const wMid = (p.weight[0] + p.weight[1]) / 2;
    const hMid = (p.height[0] + p.height[1]) / 2;
    const wT = Math.max(0, Math.min(1, (wMid - R.wMin) / (R.wMax - R.wMin)));
    const hT = Math.max(0, Math.min(1, (hMid - R.hMin) / (R.hMax - R.hMin)));
    const cx0 = (bx0 + bx1) / 2;
    const widthK = 0.88 + wT * 0.30;          // heavier = visibly broader blade
    const lenK   = 0.97 + hT * 0.06;          // the real 6% height spread
    bx0 = cx0 - (cx0 - bx0) * widthK;
    bx1 = cx0 + (bx1 - cx0) * widthK;
    bladeBot = Math.round(546 * lenK);
    hEnd = Math.round(hEnd * (2 - lenK));      // longer blade starts higher
  }

  const bw = bx1 - bx0;
  const cx = (bx0 + bx1) / 2;
  const bladeTop = hEnd + 26;
  const glow = opts.glow !== false;

  const bladePath =
    `M 96 ${hEnd - 12}
     L ${bx0 + 8} ${bladeTop}
     Q ${bx0} ${bladeTop + 10} ${bx0} ${bladeTop + 24}
     L ${bx0} ${bladeBot - 20}
     Q ${bx0} ${bladeBot} ${bx0 + 20} ${bladeBot}
     L ${bx1 - 20} ${bladeBot}
     Q ${bx1} ${bladeBot} ${bx1} ${bladeBot - 20}
     L ${bx1} ${bladeTop + 24}
     Q ${bx1} ${bladeTop + 10} ${bx1 - 8} ${bladeTop}
     L 124 ${hEnd - 12} Z`;

  /* wood grain */
  let grain = '';
  for (let i = 0; i < 11; i++) {
    const x = bx0 + 9 + (i * (bw - 18)) / 10;
    const o = 0.05 + (i % 3) * 0.045;
    const wob = (i % 2 ? 5 : -4);
    grain += `<path d="M ${x} ${bladeTop + 16} Q ${x + wob} ${(bladeTop + bladeBot) / 2} ${x} ${bladeBot - 14}"
              stroke="${tone.grain}" stroke-width="${1 + (i % 2) * 0.6}" fill="none" opacity="${o}"/>`;
  }

  /* spine highlight */
  let spine = '';
  if (p.spine !== false) {
    spine = `<rect x="${cx - 16}" y="${bladeTop + 14}" width="32" height="${bladeBot - bladeTop - 34}"
             rx="14" fill="url(#sp${uid})" opacity="0.55"/>`;
  }

  /* scoop cavity */
  let scoop = '';
  if (p.profile === 'scoop') {
    const sy = bladeTop + 46, sh = bladeBot - bladeTop - 110;
    scoop = `<rect x="${cx - 24}" y="${sy}" width="48" height="${sh}" rx="22"
             fill="${tone.lo}" opacity="0.42"/>
             <rect x="${cx - 24}" y="${sy}" width="48" height="${sh}" rx="22"
             fill="none" stroke="${tone.grain}" stroke-width="1.4" opacity="0.35"/>
             <rect x="${cx - 15}" y="${sy + 12}" width="12" height="${sh - 24}" rx="6"
             fill="${tone.hi}" opacity="0.16"/>`;
  }

  /* lamination seams for multi-blade */
  let seams = '';
  if (p.profile === 'multi') {
    const n = (p.blades || 2) - 1;
    for (let i = 1; i <= n; i++) {
      const x = bx0 + (bw * i) / (n + 1);
      seams += `<line x1="${x}" y1="${bladeTop + 12}" x2="${x}" y2="${bladeBot - 10}"
                stroke="${tone.lo}" stroke-width="2.4" opacity="0.5"/>
                <line x1="${x + 2}" y1="${bladeTop + 12}" x2="${x + 2}" y2="${bladeBot - 10}"
                stroke="${tone.hi}" stroke-width="1" opacity="0.35"/>`;
    }
  }

  /* thick / big edges */
  let edges = '';
  if (p.profile === 'bigedge' || /thick|big/i.test(p.edge || '')) {
    edges = `<rect x="${bx0}" y="${bladeTop + 20}" width="11" height="${bladeBot - bladeTop - 42}"
             rx="5" fill="${tone.lo}" opacity="0.45"/>
             <rect x="${bx1 - 11}" y="${bladeTop + 20}" width="11" height="${bladeBot - bladeTop - 42}"
             rx="5" fill="${tone.lo}" opacity="0.45"/>`;
  }

  /* toe guard */
  let toe = '';
  if (p.toeGuard) {
    toe = `<path d="M ${bx0} ${bladeBot - 34} L ${bx1} ${bladeBot - 34} L ${bx1} ${bladeBot - 20}
           Q ${bx1} ${bladeBot} ${bx1 - 20} ${bladeBot} L ${bx0 + 20} ${bladeBot}
           Q ${bx0} ${bladeBot} ${bx0} ${bladeBot - 20} Z" fill="#15153C" opacity="0.85"/>`;
  }

  /* burnt finish overlay */
  let burnt = '';
  if (/burnt/i.test(p.finish || '')) {
    burnt = `<rect x="${bx0}" y="${bladeTop}" width="${bw}" height="${bladeBot - bladeTop}"
             rx="16" fill="url(#burn${uid})" opacity="0.55"/>`;
  }

  /* varnish gloss sweep */
  let gloss = '';
  if (/varnish|gloss|polish|furnish/i.test(p.finish || '')) {
    gloss = `<path d="M ${bx0 + 6} ${bladeTop + 18} L ${bx0 + 26} ${bladeTop + 18}
             L ${bx0 + 10} ${bladeBot - 24} L ${bx0 + 2} ${bladeBot - 40} Z"
             fill="#fff" opacity="0.17"/>`;
  }

  /* handle: cane / joint / wood */
  const isJoint = /joint/i.test(p.handle || '');
  const isCane  = /cane/i.test(p.handle || '');
  const gripTop = 18;
  const gripBot = hEnd - 6;
  const gripFill = isCane ? '#20204F' : '#191940';

  let splits = '';
  if (/3 split|3-piece|3 piece/i.test(p.handle || '')) {
    splits = `<line x1="104" y1="${gripBot - 46}" x2="104" y2="${gripBot}" stroke="${tone.lo}" stroke-width="1.6" opacity=".7"/>
              <line x1="116" y1="${gripBot - 46}" x2="116" y2="${gripBot}" stroke="${tone.lo}" stroke-width="1.6" opacity=".7"/>`;
  }
  let jointBand = '';
  if (isJoint) {
    jointBand = `<rect x="90" y="${gripBot - 34}" width="40" height="12" rx="4" fill="#FF8A1E" opacity="0.9"/>`;
  }

  let ridges = '';
  for (let y = gripTop + 16; y < gripBot - 40; y += 13) {
    ridges += `<rect x="93" y="${y}" width="34" height="4" rx="2" fill="#0B0B24" opacity="0.5"/>`;
  }

  /* brand flash sticker */
  const flashY = bladeTop + (bladeBot - bladeTop) * 0.34;
  const flash = `
    <g opacity="0.95">
      <path d="M ${bx0 + 8} ${flashY} L ${bx1 - 8} ${flashY - 16} L ${bx1 - 8} ${flashY + 12}
               L ${bx0 + 8} ${flashY + 28} Z" fill="#FF8A1E"/>
      <path d="M ${bx0 + 8} ${flashY + 28} L ${bx1 - 8} ${flashY + 12} L ${bx1 - 8} ${flashY + 18}
               L ${bx0 + 8} ${flashY + 34} Z" fill="#1B1B4D"/>
      <text x="${cx}" y="${flashY + 12}" text-anchor="middle"
            font-family="Anton, Impact, sans-serif" font-size="21" fill="#0B0B24"
            letter-spacing="2" transform="rotate(-4 ${cx} ${flashY + 12})">TOSS</text>
    </g>`;

  return `
<svg class="bat-art" viewBox="0 0 220 570" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="${p.name} cricket bat">
  <defs>
    <linearGradient id="w${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${tone.lo}"/>
      <stop offset="26%"  stop-color="${tone.mid}"/>
      <stop offset="52%"  stop-color="${tone.hi}"/>
      <stop offset="78%"  stop-color="${tone.mid}"/>
      <stop offset="100%" stop-color="${tone.lo}"/>
    </linearGradient>
    <linearGradient id="sp${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${tone.hi}" stop-opacity="0"/>
      <stop offset="50%"  stop-color="${tone.hi}"/>
      <stop offset="100%" stop-color="${tone.hi}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="burn${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#3A1E08" stop-opacity="0.75"/>
      <stop offset="45%"  stop-color="#5C3410" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#2A1405" stop-opacity="0.8"/>
    </linearGradient>
    <filter id="sh${uid}" x="-60%" y="-20%" width="220%" height="150%">
      <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#0B0B24" flood-opacity="0.35"/>
    </filter>
  </defs>

  ${glow ? `<ellipse cx="110" cy="300" rx="118" ry="250" fill="#3D3DA8" opacity="0.13"/>` : ''}

  <g filter="url(#sh${uid})">
    <!-- handle -->
    <rect x="93" y="${gripTop}" width="34" height="${gripBot - gripTop}" rx="15" fill="${gripFill}"/>
    <rect x="93" y="${gripTop}" width="12" height="${gripBot - gripTop}" rx="6" fill="#fff" opacity="0.08"/>
    ${ridges}
    <rect x="89" y="${gripTop - 4}" width="42" height="14" rx="7" fill="#FF8A1E"/>
    ${jointBand}

    <!-- blade -->
    <path d="${bladePath}" fill="url(#w${uid})" stroke="${tone.grain}" stroke-width="1.2" stroke-opacity="0.35"/>
    ${grain}
    ${spine}
    ${scoop}
    ${seams}
    ${edges}
    ${burnt}
    ${gloss}
    ${splits}
    ${toe}
    ${flash}
  </g>
</svg>`;
}

/* small inline icon set */
const ICON = {
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 012.41 5.83c0 4.54-3.7 8.24-8.25 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.65-1.23-1.46-1.38-1.71-.14-.24-.01-.37.11-.49.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.47-.28z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="14" height="11" rx="1"/><path d="M15 9h4l3 3.5V17h-7z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2l8 3.5v6c0 5-3.4 9.2-8 10.5-4.6-1.3-8-5.5-8-10.5v-6z"/><path d="M9 12l2 2 4-4" stroke-linecap="round"/></svg>',
  hammer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5l5 5-3 3-5-5z"/><path d="M11 8L3 16l3 3 8-8"/></svg>',
  rupee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 4h10M7 9h10M16 4c0 4-3.5 5-6.5 5H7l8 11"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>'
};
