/* ============================================================
   TOSS — SERVICES

   Bat Doctor, custom bat, jersey, wholesale, trade-in and the
   customer video reward, plus order tracking and the public Q&A
   on product pages.

   The six request forms are one renderer driven by a spec, not
   six screens. They differ in their questions and almost nothing
   else: each collects a name and a phone, most take photos, all
   of them end as a row in `requests` and a WhatsApp handoff. Six
   hand-written forms would be six places to fix the day the
   phone field needs validating.

   Everything here degrades rather than fails. If the database is
   unreachable the WhatsApp handoff still works, because that is
   how this business actually takes orders — losing the enquiry
   would be worse than losing the record of it.
   ============================================================ */

/* ============================================================
   SERVICE IDENTITY

   Six services that were six identical white cards. Each now has
   a colour and a drawing of its own, carried from the card
   straight through to its form, so arriving on a page feels like
   arriving somewhere rather than at another form.

   Orange and navy still run the site — these are accents, used on
   an icon, a rule and a header, never on a primary button. The
   brand does not become six brands.

   Every colour was solved against WCAG relative luminance rather
   than picked by eye, and clears 4.5:1 BOTH on white and on its
   own 10% tint, which is the background it actually sits on. The
   lowest of the six is 4.51.

   The drawings are line art in one stroke weight on a 48-unit
   grid, matching the icon set already in ICON. currentColor
   throughout, so each inherits its service's accent and there is
   one copy of each shape rather than six coloured variants.
   ============================================================ */

const SVC_ART = (() => {
  const w = p => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    class="svc-art-svg" aria-hidden="true">${p}</svg>`;
  return {
    /* a blade with a split down it and a dressing across the split */
    bat_doctor: w(`<path d="M20 6h8v9l3 4v20a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3V19l3-4z"/>
      <path d="M24 21v14" stroke-dasharray="3 3"/>
      <rect x="14" y="24" width="20" height="8" rx="2" transform="rotate(-14 24 28)"/>
      <path d="M20.5 26.5v3M27.5 26.5v3" transform="rotate(-14 24 28)"/>`),

    /* a blade being measured — calipers across the edge */
    custom_bat: w(`<path d="M20 8h8v9l3 4v19h-14V21l3-4z"/>
      <path d="M13 21h-4M39 21h-4M13 40h-4M39 40h-4"/>
      <path d="M11 21v19M37 21v19" stroke-dasharray="2 3"/>
      <path d="M24 17v23" stroke-dasharray="2 3"/>`),

    /* one bat handed over for another — the loop between them */
    trade_in: w(`<path d="M15 10h6v7l2 3v18h-10V20l2-3z"/>
      <path d="M27 10h6v7l2 3v18h-10V20l2-3z" opacity=".55"/>
      <path d="M20 30c3 3 5 3 8 0"/><path d="M28 30l-2.5-2M28 30l-2.5 2"/>`),

    /* a crate of them */
    wholesale: w(`<rect x="8" y="20" width="32" height="20" rx="2"/>
      <path d="M8 26h32"/><path d="M16 20v-4M24 20v-6M32 20v-4"/>
      <path d="M14 12h4v8h-4zM22 10h4v10h-4zM30 12h4v8h-4z"/>
      <path d="M18 33h12"/>`),

    /* a shirt with a number on it */
    jersey: w(`<path d="M18 9l-8 4 3 7 3-1v20h16V19l3 1 3-7-8-4a6 6 0 0 1-12 0z"/>
      <path d="M22 26h4v9M22 35h6"/>`),

    /* film frame with a play mark */
    video: w(`<rect x="7" y="12" width="34" height="24" rx="3"/>
      <path d="M7 18h4M7 24h4M7 30h4M37 18h4M37 24h4M37 30h4"/>
      <path d="M21 19l8 5-8 5z"/>`),

    /* an office block with a gift tag on it — corporate gifting */
    corporate: w(`<path d="M8 40V12a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v28"/>
      <path d="M26 40V22h12a2 2 0 0 1 2 2v16"/><path d="M5 40h38"/>
      <path d="M13 17h6M13 24h6M13 31h6M31 28h4M31 34h4"/>`)
  };
})();

/* ------------------------------------------------------------
   colour + the one-line promise each card carries

   `accent` is the dark, high-contrast version, for a service's own
   page on WHITE paper. It is the wrong tool on navy: dark red on
   dark blue has almost no luminance separation, which is why the
   homepage strip had to fill a solid block behind a white glyph
   just to be seen — seven solid blocks, seven directions for the
   eye, and orange no longer the loudest thing on the page.

   `lit` is the same HUE lifted to a common lightness (~L70) and a
   common chroma, for use ON the dark bands. Holding L and C fixed
   and varying only H is what turns seven arbitrary colours into a
   family: they read as one set of labels rather than seven
   competing signals, and none of them can outrank the orange CTA.
   ------------------------------------------------------------ */
const SVC_ID = {
  bat_doctor: { accent: '#CC2C23', lit: '#FF7A70', tint: '#FAEAE9', art: 'bat_doctor' },
  custom_bat: { accent: '#3D3DA8', lit: '#8C8CF0', tint: '#ECECF6', art: 'custom_bat' },
  trade_in:   { accent: '#007C41', lit: '#4FD48A', tint: '#E6F2EC', art: 'trade_in'   },
  wholesale:  { accent: '#9E5E00', lit: '#E8A63C', tint: '#F5EFE6', art: 'wholesale'  },
  jersey:     { accent: '#C0357A', lit: '#F27BB0', tint: '#F9EBF2', art: 'jersey'     },
  video:      { accent: '#6B3FC4', lit: '#B08CF5', tint: '#F0ECF9', art: 'video'      },
  /* Teal — the one hue left that clears 4.5:1 on white and on its own
     tint without colliding with the six above. Measured, not picked. */
  corporate:  { accent: '#00666E', lit: '#4FC7D1', tint: '#E4F1F2', art: 'corporate'  }
};

const svcId = k => SVC_ID[k] || { accent: 'var(--orange-700)', tint: 'var(--paper-alt)', art: null };

/* ---------- form specs ---------- */

const SVC = {
  bat_doctor: {
    slug: 'bat-doctor',
    title: 'Bat Doctor',
    eyebrow: 'Repair & maintenance',
    lede: 'Send us a photo of what is wrong. We will look at it and tell you what it costs ' +
          'before you post anything — no charge for the opinion.',
    cta: 'Send to the workshop',
    photos: { min: 1, max: 4, label: 'Photos of the damage', hint: 'At least one. The blade face, and a close-up of the problem.' },
    fields: [
      { k: 'issue', g: 'What is wrong', t: 'radios', label: 'What is wrong?', req: true,
        opts: () => SERVICES.batDoctor.issues.map(i => ({
          v: i.id, label: i.label,
          note: i.from ? `₹${i.from}–${i.to} typically` : 'We will quote after seeing it' })) },
      { k: 'bat', g: 'About the bat', t: 'text', label: 'Which bat is it?', ph: 'Toss Power X, or another brand', req: true },
      { k: 'age', g: 'About the bat', t: 'select', label: 'How old is it?', req: true,
        opts: () => ['Under 6 months', '6–12 months', '1–2 years', 'Over 2 years'].map(v => ({ v, label: v })) },
      { k: 'note', g: 'About the bat', t: 'textarea', label: 'Anything else we should know?', ph: 'When it happened, how it plays now…' }
    ]
  },

  custom_bat: {
    slug: 'custom',
    title: 'Build your own bat',
    eyebrow: 'Made to your spec',
    lede: 'Tell us how you play and we will shape it for you. Every bat is cut by hand in our ' +
          'own unit, so the spec is yours rather than whatever the batch produced.',
    cta: 'Send my spec',
    photos: { min: 0, max: 3, label: 'Reference photos', hint: 'Optional — a bat you liked, or a sticker design.' },
    fields: [
      { k: 'wood', g: 'The wood', t: 'radios', label: 'Wood', req: true, opts: () => [
        { v: 'srilankan', label: 'Sri Lankan wood', note: 'Hardest hitting, heaviest' },
        { v: 'kashmir',   label: 'Kashmir Willow',  note: 'Balanced, the all-rounder' },
        { v: 'poplar',    label: 'Poplar',          note: 'Lightest pickup, softest' } ] },
      { k: 'profile', g: 'The shape', t: 'radios', label: 'Blade profile', req: true, opts: () => [
        { v: 'standard', label: 'Standard' }, { v: 'scoop', label: 'Scoop' },
        { v: 'flat', label: 'Flat' }, { v: 'bigedge', label: 'Big edge' },
        { v: 'mongoose', label: 'Mongoose' }, { v: 'multi', label: 'Double / triple blade' } ] },
      { k: 'weight', g: 'The shape', t: 'select', label: 'Weight', req: true,
        opts: () => ['Light — 650–699g', 'Medium — 700–760g', 'Heavy — 790–860g', 'Not sure, advise me']
          .map(v => ({ v, label: v })) },
      { k: 'ball', g: 'How you play', t: 'radios', label: 'Which ball?', req: true, opts: () => [
        { v: 'soft', label: 'Soft tennis ball' },
        { v: 'medium', label: 'Medium / hard tennis ball' } ] },
      { k: 'handle', g: 'The shape', t: 'select', label: 'Handle',
        opts: () => ['Single piece', 'Joint handle', 'Cane handle', 'Whatever suits the spec']
          .map(v => ({ v, label: v })) },
      { k: 'engraving', g: 'Finishing touches', t: 'text', label: 'Engraving (optional)',
        ph: 'A name, a number, a team', max: () => SERVICES.engraving.maxChars,
        hint: () => `Up to ${SERVICES.engraving.maxChars} characters · +₹${SERVICES.engraving.price}` },
      { k: 'note', g: 'How you play', t: 'textarea', label: 'How do you play?', ph: 'Where you play, what you struggle with, anything you want us to know.' }
    ]
  },

  jersey: {
    slug: 'jersey',
    title: 'Team jerseys',
    eyebrow: 'Custom kit',
    lede: 'Names, numbers and your team crest. Tell us the sizes and we will come back with a ' +
          'price and a mock-up before anything is printed.',
    cta: 'Get a jersey quote',
    photos: { min: 0, max: 3, label: 'Team logo or design', hint: 'Highest quality file you have.' },
    minNote: () => `Minimum order ${SERVICES.jersey.min} jerseys.`,
    fields: [
      { k: 'team', g: 'The team', t: 'text', label: 'Team name', req: true, ph: 'As it should print' },
      /* Name, size and number per jersey. The total and the size
         breakdown are counted from these rows in collect(), so there is
         no separate quantity box to fall out of step with them. */
      { k: 'players', g: 'Sizes and names', t: 'roster', req: true,
        label: 'Name, size and number on each jersey',
        opts: () => SERVICES.jersey.sizes.map(v => ({ v, label: v })) },
      { k: 'when', g: 'Timing', t: 'text', label: 'Needed by', ph: 'Tournament date, if there is one' }
    ]
  },

  wholesale: {
    slug: 'wholesale',
    title: 'Bulk & wholesale',
    eyebrow: 'For clubs, academies and shops',
    lede: 'We make every bat in our own unit, so bulk goes straight to the bench with no ' +
          'middleman. Tell us the quantity and we will send a rate.',
    cta: 'Request a rate',
    photos: { min: 0, max: 0 },
    slabs: true,
    fields: [
      { k: 'org', g: 'Who you are', t: 'text', label: 'Club, academy or shop name', req: true },
      { k: 'qty', g: 'The order', t: 'number', label: 'How many bats?', req: true, min: 1, ph: '25',
        hint: () => `Bulk rates start at ${SERVICES.wholesale.min}.` },
      { k: 'mix', g: 'The order', t: 'textarea', label: 'Which bats?', ph: 'Model names, or just a budget per bat and we will suggest.' },
      { k: 'gst', g: 'Who you are', t: 'text', label: 'GSTIN (optional)', ph: 'For a tax invoice' },
      { k: 'when', g: 'Timing', t: 'text', label: 'Needed by' }
    ]
  },

  /* Corporate is deliberately NOT folded into wholesale. A club buying 25
     bats wants a rate; a company buying 25 wants them branded, invoiced to
     a PO and delivered before an event. Same quantity, different
     conversation, so different questions. */
  corporate: {
    slug: 'corporate',
    title: 'Corporate & gifting orders',
    eyebrow: 'For companies and events',
    lede: 'Bats for a tournament, a client gift or an employee event — branded with your logo ' +
          'and invoiced properly. Tell us what the occasion is and we will come back with a ' +
          'quote and a mock-up.',
    cta: 'Request a corporate quote',
    photos: { min: 0, max: 3, label: 'Your logo or brand guide',
      hint: 'Optional — the highest quality file you have.' },
    fields: [
      { k: 'company', g: 'Your company', t: 'text', label: 'Company name', req: true },
      { k: 'contact', g: 'Your company', t: 'text', label: 'Your role', ph: 'HR, admin, marketing…' },
      { k: 'gst',     g: 'Your company', t: 'text', label: 'GSTIN (optional)',
        ph: 'For a tax invoice' },
      { k: 'occasion', g: 'The order', t: 'radios', label: 'What is it for?', req: true, opts: () => [
        { v: 'gifting',    label: 'Client or employee gifting' },
        { v: 'tournament', label: 'Corporate tournament' },
        { v: 'event',      label: 'An event or launch' },
        { v: 'other',      label: 'Something else' } ] },
      { k: 'qty', g: 'The order', t: 'number', label: 'How many?', req: true, min: 1, ph: '25',
        hint: () => `Corporate pricing starts at ${SERVICES.corporate.min}.` },
      { k: 'branding', g: 'The order', t: 'radios', label: 'Branding needed?', req: true, opts: () => [
        { v: 'logo',     label: 'Our logo on the bat' },
        { v: 'engraved', label: 'Engraved names' },
        { v: 'both',     label: 'Both' },
        { v: 'none',     label: 'No branding' } ] },
      { k: 'budget', g: 'The order', t: 'text', label: 'Budget per piece (optional)',
        ph: '₹1,500 — helps us suggest the right bat' },
      { k: 'when', g: 'Timing', t: 'text', label: 'Needed by', req: true,
        ph: 'The event date — branding takes time' }
    ]
  },

  trade_in: {
    slug: 'trade-in',
    title: 'Trade in your old bat',
    eyebrow: 'Old bat, new bat',
    lede: 'Send photos of the bat you have. We will value it and give you that much off your ' +
          'next Toss bat. The old one gets repaired and passed on rather than thrown away.',
    cta: 'Get it valued',
    photos: { min: 2, max: 5, label: 'Photos of your bat', hint: 'Face, back, edge and toe. Be honest about the damage — it only slows things down otherwise.' },
    bands: true,
    fields: [
      { k: 'bat', g: 'The bat you have', t: 'text', label: 'What bat is it?', req: true, ph: 'Brand and model' },
      { k: 'condition', g: 'The bat you have', t: 'radios', label: 'Honest condition', req: true,
        opts: () => SERVICES.tradeIn.bands.map(b => ({
          v: b.id, label: b.label, note: `Usually ₹${b.from}–${b.to}` })) },
      { k: 'age', g: 'The bat you have', t: 'select', label: 'How long have you had it?', req: true,
        opts: () => ['Under 6 months', '6–12 months', '1–2 years', 'Over 2 years'].map(v => ({ v, label: v })) },
      { k: 'want', g: 'What you want next', t: 'text', label: 'Which Toss bat do you want?', ph: 'Or leave it and we will suggest' }
    ]
  },

  video: {
    slug: 'video',
    title: 'Send us a video, get money off',
    eyebrow: 'Customer films',
    lede: () => `Film yourself playing with your Toss bat. If we use it, you get ` +
                `${SERVICES.video.rewardMin}–${SERVICES.video.rewardOff}% off your next ` +
                `order — how much depends on how good the footage is.`,
    cta: 'Submit my video',
    photos: { min: 1, max: 1, label: 'Your video', hint: () =>
      `At least ${SERVICES.video.minSeconds} seconds. Shot sideways (landscape) works best.`,
      accept: 'video/*' },
    consent: true,
    fields: [
      { k: 'bat', g: 'About the film', t: 'text', label: 'Which Toss bat is in the video?', req: true },
      { k: 'order', g: 'About the film', t: 'text', label: 'Your order number (optional)', ph: 'Speeds up the reward' },
      { k: 'insta', g: 'Credit', t: 'text', label: 'Instagram handle (optional)', ph: '@yourname — so we can credit you' }
    ]
  }
};

const SVC_BY_SLUG = Object.keys(SVC).reduce((m, k) => (m[SVC[k].slug] = k, m), {});
const val = v => (typeof v === 'function' ? v() : v);

/* ---------- rendering ---------- */

function svcField(f) {
  const id = 'svc_' + f.k;
  const req = f.req ? ' <i>required</i>' : '';
  const hint = f.hint ? `<p class="svc-hint">${esc(val(f.hint))}</p>` : '';
  let input = '';

  if (f.t === 'radios') {
    input = `<div class="svc-radios">${val(f.opts).map((o, i) => `
      <label class="svc-radio">
        <input type="radio" name="${id}" value="${esc(o.v)}"${f.req && i === 0 ? '' : ''}>
        <span class="svc-radio-b">
          <b>${esc(o.label)}</b>
          ${o.note ? `<i>${esc(o.note)}</i>` : ''}
        </span>
      </label>`).join('')}</div>`;
  } else if (f.t === 'select') {
    input = `<select id="${id}">
      <option value="">Choose…</option>
      ${val(f.opts).map(o => `<option value="${esc(o.v)}">${esc(o.label)}</option>`).join('')}
    </select>`;
  } else if (f.t === 'textarea') {
    input = `<textarea id="${id}" rows="3" placeholder="${esc(f.ph || '')}"></textarea>`;
  } else if (f.t === 'number') {
    input = `<input id="${id}" type="number" inputmode="numeric" min="${f.min || 0}"
      placeholder="${esc(f.ph || '')}">`;
  } else if (f.t === 'roster') {
    /* One row per jersey: the name that gets printed, the size, and the
       number. This replaced a free-text "2 S, 5 M" breakdown plus a
       separate names box — two fields describing the same eleven people,
       which meant they could disagree and often did.

       A jersey IS a name, a size and a number, so that is the unit the
       form collects. The size breakdown and the total are counted from
       the rows rather than asked for again. */
    const sizes = val(f.opts);
    const row = `
      <div class="svc-row">
        <input type="text" data-r="name" placeholder="Name on jersey" aria-label="Name on jersey">
        <select data-r="size" aria-label="Size">
          <option value="">Size</option>
          ${sizes.map(o => `<option value="${esc(o.v)}">${esc(o.label)}</option>`).join('')}
        </select>
        <input type="text" data-r="num" inputmode="numeric" maxlength="3"
               placeholder="No." aria-label="Number on jersey">
        <button type="button" data-delrow aria-label="Remove this jersey">&times;</button>
      </div>`;
    input = `<div class="svc-roster">
      <div class="svc-rows" data-rows>${row.repeat(3)}</div>
      <button type="button" class="svc-addrow" data-addrow>+ Add another</button>
    </div>`;
  } else {
    input = `<input id="${id}" type="text" placeholder="${esc(f.ph || '')}"
      ${f.max ? `maxlength="${val(f.max)}"` : ''}>`;
  }

  return `<div class="svc-f" data-k="${f.k}" data-t="${f.t}"${f.req ? ' data-req="1"' : ''}>
    <label${f.t === 'radios' ? '' : ` for="${id}"`}>${esc(f.label)}${req}</label>
    ${input}${hint}
  </div>`;
}

/* Fields carry a group label, so the form is built by bucketing them in
   declaration order rather than by any layout logic here. Adding a question
   to a spec puts it in the right step automatically. */
function svcGroups(s) {
  const out = [], byName = {};
  s.fields.forEach(f => {
    const g = f.g || 'Details';
    if (!byName[g]) { byName[g] = []; out.push({ name: g, fields: byName[g] }); }
    byName[g].push(f);
  });
  return out;
}

function viewService(slug) {
  const kind = SVC_BY_SLUG[slug];
  const s = kind && SVC[kind];
  if (!s) return viewNotFound();

  const id = svcId(kind);
  const ph = s.photos || {};
  const wa = TOSS_LINKS.whatsapp;
  const groups = svcGroups(s);

  /* Photos and contact details are steps in their own right, numbered with
     the rest. Contact comes LAST on purpose: asking who someone is before
     asking what they want is the wrong way round, and it was the first
     thing on the page before. */
  const total = groups.length + (ph.max ? 1 : 0) + 1;
  let n = 0;
  const step = name => `<div class="svc-step"><span>${++n}</span><h2>${esc(name)}</h2></div>`;

  return `
  <section class="svc-top" style="--svc:${id.accent};--svc-tint:${id.tint}">
    <div class="wrap svc-top-in">
      <div>
        <nav class="crumbs"><a href="#/">Home</a> / <span>${esc(s.title)}</span></nav>
        <p class="eyebrow">${esc(s.eyebrow)}</p>
        <h1 class="d1">${esc(s.title)}</h1>
        <p class="lede">${esc(val(s.lede))}</p>
        <div class="svc-facts">
          ${kind === 'bat_doctor' ? `<span>${ICON.truck} ${esc(SERVICES.batDoctor.turnaround)}</span>` : ''}
          ${s.minNote ? `<span>${ICON.check} ${esc(val(s.minNote))}</span>` : ''}
          ${kind === 'trade_in' ? `<span>${ICON.rupee} Valued from photos, no obligation</span>` : ''}
          ${kind === 'video' ? `<span>${ICON.star} Up to ${SERVICES.video.rewardOff}% off your next order</span>` : ''}
          ${kind === 'custom_bat' ? `<span>${ICON.hammer} Shaped by hand in our own unit</span>` : ''}
          ${wa ? `<a href="https://wa.me/${wa}?text=${encodeURIComponent('Hi Toss, about ' + s.title + ' — ')}"
             target="_blank" rel="noopener">${ICON.whatsapp} Rather just ask?</a>` : ''}
        </div>
      </div>
      <span class="svc-hero-art">${SVC_ART[id.art] || ''}</span>
    </div>
    ${s.slabs ? `
      <div class="wrap"><div class="svc-slabs">
        ${SERVICES.wholesale.slabs.map(x => `
          <div class="svc-slab"><b>${x.off}% off</b>
            <span>${x.from}${x.to ? '–' + x.to : '+'} bats</span></div>`).join('')}
      </div></div>` : ''}
  </section>

  <section class="sec svc-formsec" style="--svc:${id.accent};--svc-tint:${id.tint}">
    <div class="wrap svc-wrap">
      <form class="svc-form" id="svcForm" data-kind="${kind}" novalidate>

        <!-- Fills as the required fields are answered. A four-step form
             feels shorter when you can see where the end is. -->
        <div class="svc-prog" id="svcProg">
          <span class="svc-prog-track" aria-hidden="true"><i id="svcProgFill"></i></span>
          <span class="svc-prog-txt" id="svcProgTxt"></span>
        </div>

        <!-- Filled in only when a submit fails. Outlining the field in place
             is no help if it is three screens up. -->
        <div class="svc-errbox hide" id="svcErr" role="alert" tabindex="-1"></div>


        ${groups.map(g => `
          <fieldset class="svc-group">
            <legend class="sr-only">${esc(g.name)}</legend>
            ${step(g.name)}
            <div class="svc-grid-auto">${g.fields.map(svcField).join('')}</div>
          </fieldset>`).join('')}

        ${ph.max ? `
        <fieldset class="svc-group">
          <legend class="sr-only">${esc(val(ph.label))}</legend>
          ${step(val(ph.label))}
          <div class="svc-f" data-k="__photos"${ph.min ? ' data-req="1"' : ''}>
            <div class="svc-up" id="svcUp">
              <input type="file" id="svcFile" accept="${ph.accept || 'image/*'}"
                     ${ph.max > 1 ? 'multiple' : ''} hidden>
              <button type="button" class="btn btn-ghost sm" id="svcPick">Choose file${ph.max > 1 ? 's' : ''}</button>
              <span class="svc-hint">${esc(val(ph.hint) || '')}</span>
            </div>
            <div class="svc-thumbs" id="svcThumbs"></div>
          </div>
        </fieldset>` : ''}

        <fieldset class="svc-group">
          <legend class="sr-only">How to reach you</legend>
          ${step('How to reach you')}
          <div class="svc-grid">
            <div class="svc-f" data-k="name" data-t="text" data-req="1">
              <label for="svc_name">Your name <i>required</i></label>
              <input id="svc_name" type="text" autocomplete="name">
            </div>
            <div class="svc-f" data-k="phone" data-t="tel" data-req="1">
              <label for="svc_phone">WhatsApp number <i>required</i></label>
              <input id="svc_phone" type="tel" inputmode="numeric" autocomplete="tel"
                     placeholder="10 digits">
              <p class="svc-hint">This is how we reply. We do not use it for anything else.</p>
            </div>
          </div>
          ${s.consent ? `
          <div class="svc-f svc-consent">
            <label class="svc-check">
              <input type="checkbox" id="svcConsent">
              <span>I am happy for Toss to use this video in their posts and adverts, and I
                filmed it myself.</span>
            </label>
          </div>` : ''}
        </fieldset>

        <div class="svc-actions">
          <button class="btn btn-primary" type="submit" id="svcSend">${esc(s.cta)}</button>
          <span class="svc-steps-note">${total} steps · takes about a minute</span>
        </div>
        <p class="svc-stat" id="svcStat" role="status"></p>
      </form>
    </div>
  </section>`;
}

/* ---------- upload ---------- */

/* Phone photos are 3–8MB and nothing here needs that. Images are resized in
   the browser before upload; video is sent as-is because re-encoding it
   client-side would take longer than the upload it saves. */
function svcShrink(file) {
  if (!/^image\//.test(file.type)) return Promise.resolve(file);
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b || file), 'image/webp', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function svcUpload(file, kind) {
  const blob = await svcShrink(file);
  const ext = /^video\//.test(file.type)
    ? (file.name.split('.').pop() || 'mp4').toLowerCase().slice(0, 4)
    : (blob.type === 'image/webp' ? 'webp' : 'jpg');
  const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/requests/${path}`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob
  });
  if (!res.ok) throw new Error('Upload failed — check your connection and try again.');
  /* The PATH, not a public URL. The `requests` bucket is private: it holds
     photos of people's homes and the videos the consent box asks about, and
     a public bucket is listable by anyone. The Maze Room signs these on
     demand, which is also what keeps them readable only by staff. */
  return path;
}

/* ---------- wiring ---------- */

function wireService(slug) {
  const kind = SVC_BY_SLUG[slug];
  const s = kind && SVC[kind];
  if (!s) return;

  const form = $('#svcForm'), stat = $('#svcStat'), send = $('#svcSend');
  if (!form) return;
  const ph = s.photos || {};
  let files = [];

  const pick = $('#svcPick'), input = $('#svcFile'), thumbs = $('#svcThumbs');
  if (pick) {
    pick.onclick = () => input.click();
    input.onchange = () => {
      for (const f of input.files) {
        if (files.length >= ph.max) break;
        files.push(f);
      }
      paint();
      input.value = '';
    };
  }

  function paint() {
    if (!thumbs) return;
    thumbs.innerHTML = files.map((f, i) => `
      <figure class="svc-th">
        ${/^video\//.test(f.type)
          ? `<span class="svc-vid">▶</span>`
          : `<img src="${URL.createObjectURL(f)}" alt="">`}
        <figcaption>${esc(f.name.slice(0, 14))}</figcaption>
        <button type="button" data-rm="${i}" aria-label="Remove">&times;</button>
      </figure>`).join('');
    $$('[data-rm]', thumbs).forEach(b => b.onclick = () => {
      files.splice(+b.dataset.rm, 1); paint();
    });
    /* Photos are a required step on most of these forms, and they arrive
       through the picker rather than a form field, so the bar has to be told
       here or it would sit one step behind all the way to submit. */
    if (typeof paintProgress === 'function') paintProgress();
  }

  /* Read every field back off the DOM by its declared key, so adding a
     question to a spec above needs no change here. */
  function collect() {
    const out = {};
    $$('.svc-f', form).forEach(box => {
      const k = box.dataset.k;
      if (!k || k === '__photos') return;
      const t = box.dataset.t;
      let v = '';
      if (t === 'radios') {
        const on = $('input:checked', box);
        v = on ? on.value : '';
      } else if (t === 'roster') {
        /* Flattened to one readable line per jersey. It has to be a
           STRING, not an array: both the WhatsApp handoff and the Maze
           Room render payload values with String(), so an array of
           objects would reach staff as "[object Object]".

           The size breakdown and the total are derived here and written
           alongside, so the supplier gets "3 M, 2 L" without anybody
           counting rows by hand. */
        const rows = [], bySize = {};
        $$('.svc-row', box).forEach(r => {
          const g = sel => { const el = $(sel, r); return el ? el.value.trim() : ''; };
          const nm = g('[data-r="name"]'), sz = g('[data-r="size"]'), no = g('[data-r="num"]');
          if (!nm && !sz && !no) return;              // untouched row
          rows.push(`${nm || '—'} · ${sz || '—'} · ${no || '—'}`);
          if (sz) bySize[sz] = (bySize[sz] || 0) + 1;
        });
        v = rows.join('\n');
        out.sizes = Object.keys(bySize).map(s => bySize[s] + ' ' + s).join(', ');
        out.qty   = rows.length ? String(rows.length) : '';
      } else {
        const el = $('input,select,textarea', box);
        v = el ? el.value.trim() : '';
      }
      out[k] = v;
    });
    return out;
  }

  /* Every required box, with whether it is satisfied and what to call it if
     it is not. One pass feeds both the progress bar and the error list, so
     the two can never disagree about what is outstanding. */
  function requiredState(data) {
    const out = [];
    $$('.svc-f', form).forEach(box => {
      if (!box.dataset.req) return;
      const k = box.dataset.k;
      const label = (($('label', box) || {}).textContent || k || 'This')
        .replace(/\s*required\s*$/i, '').trim();
      if (k === '__photos') { out.push({ box, ok: files.length >= ph.min, label: val(ph.label) }); return; }
      let ok = !!data[k];
      if (k === 'phone' && ok) ok = data.phone.replace(/\D/g, '').length >= 10;
      out.push({ box, ok, label });
    });
    if (s.consent) {
      const box = $('.svc-consent', form);
      if (box) out.push({ box, ok: $('#svcConsent').checked, label: 'Permission to use the video' });
    }
    return out;
  }

  function firstMissing(data) {
    const bad = requiredState(data).find(r => !r.ok);
    return bad ? bad.box : null;
  }

  /* Redrawn on every input, so it tracks typing rather than only submits. */
  function paintProgress() {
    const fill = $('#svcProgFill'), txt = $('#svcProgTxt');
    if (!fill) return;
    const st = requiredState(collect());
    const done = st.filter(r => r.ok).length;
    const pct = st.length ? Math.round((done / st.length) * 100) : 0;
    fill.style.width = pct + '%';
    txt.textContent = done === st.length
      ? 'All set — send it over'
      : done + ' of ' + st.length + ' answered';
    $('#svcProg').classList.toggle('done', done === st.length);
  }

  function addRosterRow() {
    const rows = $('[data-rows]', form);
    if (!rows) return;
    const first = $('.svc-row', rows);
    if (!first) return;
    const clone = first.cloneNode(true);
    $$('input,select', clone).forEach(el => { el.value = ''; });
    rows.appendChild(clone);
    const nm = $('[data-r="name"]', clone);
    if (nm) nm.focus();
  }

  /* input covers typing, change covers radios, selects and the file picker.
     Both are needed: a radio fires change but never input. */
  form.addEventListener('input', paintProgress);
  form.addEventListener('change', paintProgress);
  form.addEventListener('click', e => {
    if (e.target.closest('[data-addrow]')) { addRosterRow(); return; }
    const del = e.target.closest('[data-delrow]');
    if (del) {
      const rows = $('[data-rows]', form);
      /* Never leave nothing to type into — the last row is emptied
         rather than removed. */
      if ($$('.svc-row', rows).length > 1) del.closest('.svc-row').remove();
      else $$('input,select', del.closest('.svc-row')).forEach(el => { el.value = ''; });
      paintProgress();
    }
  });
  paintProgress();

  form.onsubmit = async e => {
    e.preventDefault();
    const data = collect();

    const state = requiredState(data);
    const missing = state.filter(r => !r.ok);
    const errBox = $('#svcErr');

    if (missing.length) {
      $$('.svc-f', form).forEach(b => b.classList.remove('err'));
      missing.forEach(r => r.box.classList.add('err'));

      /* Say everything that is outstanding, up here, with a jump to each.
         Marking fields in place only helps if you can see them. */
      errBox.innerHTML =
        `<b>${missing.length === 1 ? 'One thing is missing' : missing.length + ' things are missing'}</b>
         <ul>${missing.map((r, i) =>
           `<li><button type="button" data-jump="${i}">${esc(r.label)}</button></li>`).join('')}</ul>`;
      errBox.classList.remove('hide');
      $$('[data-jump]', errBox).forEach(b => b.onclick = () => {
        const r = missing[+b.dataset.jump];
        r.box.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const el = $('input,select,textarea', r.box);
        if (el) setTimeout(() => el.focus({ preventScroll: true }), 260);
      });
      errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      errBox.focus({ preventScroll: true });

      stat.textContent = '';
      stat.className = 'svc-stat';
      return;
    }
    errBox.classList.add('hide');
    $$('.svc-f', form).forEach(b => b.classList.remove('err'));

    send.disabled = true;
    const customer = { name: data.name, phone: data.phone };
    delete data.name; delete data.phone;

    try {
      const urls = [];
      for (let i = 0; i < files.length; i++) {
        stat.className = 'svc-stat';
        stat.textContent = `Uploading ${i + 1} of ${files.length}…`;
        urls.push(await svcUpload(files[i], kind));
      }
      stat.textContent = 'Sending…';
      await supa('requests', { method: 'POST', body: { kind, customer, payload: data, photos: urls } });
      form.innerHTML = svcDone(s, customer);
    } catch (err) {
      /* The enquiry matters more than our record of it. If the database
         refuses, hand the whole thing to WhatsApp rather than asking
         someone to retype it. */
      send.disabled = false;
      stat.className = 'svc-stat bad';
      const wa = TOSS_LINKS.whatsapp;
      stat.innerHTML = wa
        ? `Could not send that (${esc(err.message)}). ` +
          `<a target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${
            encodeURIComponent(svcAsText(s, customer, data))}">Send it on WhatsApp instead</a>`
        : `Could not send that — ${esc(err.message)}`;
    }
  };
}

function svcAsText(s, customer, data) {
  return `Hi Toss — ${s.title}\n\n` +
    `Name: ${customer.name}\nPhone: ${customer.phone}\n` +
    Object.keys(data).filter(k => data[k]).map(k => `${k}: ${data[k]}`).join('\n');
}

function svcDone(s, customer) {
  const wa = TOSS_LINKS.whatsapp;
  return `
    <div class="svc-done">
      <span class="svc-tick">${ICON.check}</span>
      <h2 class="d2">Got it, ${esc((customer.name || '').split(' ')[0])}.</h2>
      <p>We will look at this and reply on WhatsApp at
        <b>${esc(customer.phone)}</b>. Usually the same day.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#/shop">Keep looking around</a>
        ${wa ? `<a class="btn btn-ghost" target="_blank" rel="noopener"
          href="https://wa.me/${wa}">Message us now</a>` : ''}
      </div>
    </div>`;
}

/* ============================================================
   ORDER TRACKING

   No account, no password. The order number plus the phone the
   order was placed with — which is what the customer has, and
   what makes walking the id space useless. The check runs in the
   database (track_order), because `orders` is admin-read-only and
   must stay that way.
   ============================================================ */

const TRACK_STEPS = [
  { k: 'new',      label: 'Order received',   note: 'We have it, and it is queued for the bench.' },
  { k: 'making',   label: 'On the bench',     note: 'Being shaped, finished and checked.' },
  { k: 'packed',   label: 'Packed',           note: 'Wrapped and waiting for pickup.' },
  { k: 'shipped',  label: 'On its way',       note: 'Handed to the courier.' },
  { k: 'delivered',label: 'Delivered',        note: 'Enjoy it. Tell us how it plays.' }
];

function viewTrack() {
  return `
  <section class="svc-top dark">
    <div class="wrap">
      <nav class="crumbs"><a href="#/">Home</a> / <span>Track order</span></nav>
      <p class="eyebrow">Where is my bat?</p>
      <h1 class="d1">Track your order</h1>
      <p class="lede">Your order number and the phone you ordered with. No account needed.</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap svc-wrap">
      <form class="svc-form" id="trkForm" novalidate>
        <div class="svc-grid">
          <div class="svc-f">
            <label for="trkId">Order number</label>
            <input id="trkId" type="text" placeholder="TOSS-1234" autocomplete="off">
          </div>
          <div class="svc-f">
            <label for="trkPh">Phone used to order</label>
            <input id="trkPh" type="tel" inputmode="numeric" placeholder="10 digits">
          </div>
        </div>
        <div class="svc-actions">
          <button class="btn btn-primary" type="submit">Find my order</button>
        </div>
        <p class="svc-stat" id="trkStat" role="status"></p>
      </form>
      <div id="trkOut"></div>
    </div>
  </section>`;
}

function wireTrack() {
  const form = $('#trkForm'); if (!form) return;
  const stat = $('#trkStat'), out = $('#trkOut');

  form.onsubmit = async e => {
    e.preventDefault();
    const id = $('#trkId').value.trim(), phone = $('#trkPh').value.trim();
    out.innerHTML = '';
    if (!id || phone.replace(/\D/g, '').length < 10) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'Both the order number and the phone number, please.';
      return;
    }
    stat.className = 'svc-stat'; stat.textContent = 'Looking…';
    try {
      const rows = await supaRpc('track_order', { p_id: id, p_phone: phone });
      const o = Array.isArray(rows) ? rows[0] : rows;
      if (!o) {
        stat.className = 'svc-stat bad';
        stat.textContent = 'No order matches that pair. Check the number, or message us on WhatsApp.';
        return;
      }
      stat.textContent = '';
      out.innerHTML = trackHTML(o);
    } catch (err) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'Could not check just now — ' + err.message;
    }
  };
}

function trackHTML(o) {
  const at = Math.max(0, TRACK_STEPS.findIndex(s => s.k === o.status));
  const done = o.status === 'delivered';
  const items = Array.isArray(o.items) ? o.items : [];
  return `
  <div class="trk">
    <div class="trk-head">
      <div>
        <p class="eyebrow">Order ${esc(o.id)}</p>
        <h2 class="d2">${esc(o.name || 'Your order')}</h2>
      </div>
      <b class="trk-total">${fmt(o.total)}</b>
    </div>
    <ol class="trk-steps">
      ${TRACK_STEPS.map((s, i) => `
        <li class="trk-step${i < at ? ' past' : ''}${i === at ? ' now' : ''}">
          <span class="trk-dot">${i < at || done ? ICON.check : ''}</span>
          <div><b>${esc(s.label)}</b><i>${esc(s.note)}</i></div>
        </li>`).join('')}
    </ol>
    ${o.tracking_no ? `
      <div class="trk-courier">
        <div>
          <p class="eyebrow">${esc((DELIVERY.couriers[o.courier] || {}).label || 'Courier')}</p>
          <b>${esc(o.tracking_no)}</b>
        </div>
        ${(o.tracking_url || (DELIVERY.couriers[o.courier] || {}).url)
          ? `<a class="btn btn-ghost sm" target="_blank" rel="noopener"
               href="${esc(o.tracking_url || DELIVERY.couriers[o.courier].url)}">
               Track with the courier ${ICON.arrow}</a>` : ''}
      </div>` : ''}
    ${items.length ? `<ul class="trk-items">${items.map(i =>
      `<li><span>${esc(i.name || i.id)}</span><b>× ${i.qty || 1}</b></li>`).join('')}</ul>` : ''}
    <p class="trk-foot">Placed ${new Date(o.created_at).toLocaleDateString('en-IN',
      { day: 'numeric', month: 'short', year: 'numeric' })} ·
      ${esc((o.method || '').toUpperCase())}</p>
  </div>`;
}

/* ============================================================
   PRODUCT Q&A

   An answer here is permanent page content. The same question
   answered on WhatsApp helps one person and disappears.
   Questions are held unpublished until a person answers them,
   so the page can never fill with unanswered noise.
   ============================================================ */

function qaHTML(productId) {
  return `
  <section class="sec qa" id="qaSec" data-product="${esc(productId)}">
    <div class="wrap">
      <div class="sec-head"><div>
        <p class="eyebrow">Questions</p>
        <h2 class="d2">Ask about this bat</h2>
      </div></div>
      <div id="qaList" class="qa-list"><p class="qa-empty">Loading questions…</p></div>
      <form class="qa-form" id="qaForm">
        <label for="qaQ">Your question</label>
        <textarea id="qaQ" rows="2" placeholder="Will this handle a hard tennis ball?"></textarea>
        <div class="qa-row">
          <input id="qaName" type="text" placeholder="First name">
          <button class="btn btn-primary sm" type="submit">Ask</button>
        </div>
        <p class="svc-stat" id="qaStat" role="status"></p>
      </form>
    </div>
  </section>`;
}

async function wireQA(productId) {
  const sec = $('#qaSec'); if (!sec) return;
  const list = $('#qaList'), form = $('#qaForm'), stat = $('#qaStat');

  try {
    const rows = await supa('product_questions?select=asker,question,answer,answered_at' +
      '&product_id=eq.' + encodeURIComponent(productId) +
      '&published=is.true&order=answered_at.desc&limit=20');
    list.innerHTML = (rows && rows.length)
      ? rows.map(r => `
        <div class="qa-item">
          <p class="qa-q">${esc(r.question)}</p>
          <p class="qa-a">${esc(r.answer)}</p>
          <p class="qa-by">${r.asker ? esc(r.asker) + ' asked' : 'Asked'} ·
            answered by Toss</p>
        </div>`).join('')
      : `<p class="qa-empty">No questions yet. Ask the first one — we answer within a day.</p>`;
  } catch (e) {
    list.innerHTML = `<p class="qa-empty">Questions are unavailable right now.</p>`;
  }

  form.onsubmit = async e => {
    e.preventDefault();
    const question = $('#qaQ').value.trim(), asker = $('#qaName').value.trim();
    if (question.length < 8) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'A little more detail and we can answer properly.';
      return;
    }
    stat.className = 'svc-stat'; stat.textContent = 'Sending…';
    try {
      await supa('product_questions', { method: 'POST',
        body: { product_id: productId, asker: asker || null, question } });
      form.innerHTML = `<p class="qa-thanks">${ICON.check} Asked. We answer within a day, and
        it will appear here for everyone once we do.</p>`;
    } catch (err) {
      stat.className = 'svc-stat bad';
      stat.textContent = 'Could not send that — ' + err.message;
    }
  };
}

/* ============================================================
   COMMUNITY

   Both cards hide themselves when their link is empty, so this
   ships before the groups exist and appears the moment the links
   are pasted into config.js.
   ============================================================ */

function communityHTML() {
  const c = TOSS_LINKS.community, o = TOSS_LINKS.offers;
  if (!c && !o) return '';
  return `
  <section class="sec sec--band comm">
    <div class="wrap">
      <div class="comm-grid">
        ${c ? `
        <a class="comm-card rv" href="${esc(c)}" target="_blank" rel="noopener">
          <span class="comm-ico">${ICON.whatsapp}</span>
          <div>
            <p class="eyebrow">Toss Brothers</p>
            <h3>Join the community</h3>
            <p>Match talk, gear questions, and first word on what comes off the bench.</p>
          </div>
          <span class="comm-go">${ICON.arrow}</span>
        </a>` : ''}
        ${o ? `
        <a class="comm-card rv" href="${esc(o)}" target="_blank" rel="noopener">
          <span class="comm-ico">${ICON.whatsapp}</span>
          <div>
            <p class="eyebrow">Offers &amp; updates</p>
            <h3>Get the drops first</h3>
            <p>Limited runs, discounts and restocks. Only when there is something worth sending.</p>
          </div>
          <span class="comm-go">${ICON.arrow}</span>
        </a>` : ''}
      </div>
    </div>
  </section>`;
}

/* ============================================================
   SERVICES BAND

   One entry point on the homepage for everything that is not
   "buy a bat off the shelf". These were the features most likely
   to be built and then never found.
   ============================================================ */

/* ------------------------------------------------------------
   THE TILE ROW — directly under the hero.

   The same six services as the band below, compressed to what fits
   on one line: the artwork, the name, two words of promise and an
   arrow. It is navigation, not persuasion — someone who arrives
   knowing they want a repair should not have to scroll past the
   whole shop to find out repairs exist.

   Reuses SVC_ID and SVC_ART — the accent colour and line drawing
   each service already owns — so a tile looks like the form it
   leads to, and a seventh service needs a colour rather than a
   stylesheet. This replaced the taller six-card band that used to
   sit further down the page.

   `short` is separate from the band's longer `d` because the tile
   has room for about four words. Truncating the long one with an
   ellipsis would put the interesting half off-screen.
   ------------------------------------------------------------ */
function serviceTilesHTML() {
  const S = SERVICES;
  /* Seven of these share one row, so each gets roughly 110px of text.
     Both lines are kept to a SINGLE WORD wherever the language allows —
     a two-word label wraps, and a wrapped label in a 12px tile is what
     made this row look broken. The longer phrasing still exists on the
     service page each tile opens. */
  const tiles = [
    S.batDoctor.enabled && { k: 'bat_doctor', href: '#/service/bat-doctor',
      t: 'Bat Doctor',   short: 'Repairs' },
    S.customBat.enabled && { k: 'custom_bat', href: '#/service/custom',
      t: 'Custom bat',   short: 'Your spec' },
    S.tradeIn.enabled   && { k: 'trade_in',   href: '#/service/trade-in',
      t: 'Trade in',     short: 'Old for new' },
    S.wholesale.enabled && { k: 'wholesale',  href: '#/service/wholesale',
      t: 'Bulk',         short: `${S.wholesale.min}+ bats` },
    S.jersey.enabled    && { k: 'jersey',     href: '#/service/jersey',
      t: 'Jerseys',      short: 'Printed kit' },
    S.video.enabled     && { k: 'video',      href: '#/service/video',
      t: 'Send a video', short: `Up to ${S.video.rewardOff}% off` },
    S.corporate.enabled && { k: 'corporate',  href: '#/service/corporate',
      t: 'Corporate',    short: 'Gifting' }
  ].filter(Boolean);
  if (!tiles.length) return '';

  /* One rail behind all seven, drawn once rather than as a border on each
     tile. It is what makes the row read as a single rack of tools instead
     of seven loose chips — which is the whole psychological complaint the
     coloured blocks caused. */
  return `
  <section class="svctiles">
    <div class="wrap svctiles-row">
      <span class="svctiles-rail" aria-hidden="true"></span>
      ${tiles.map(c => {
        const id = svcId(c.k);
        return `
        <a class="svctile" href="${c.href}"
           style="--svc:${id.accent};--svc-lit:${id.lit || id.accent};--svc-tint:${id.tint}">
          <span class="svctile-art" aria-hidden="true">${SVC_ART[id.art] || ICON.star}</span>
          <span class="svctile-txt"><b>${esc(c.t)}</b><i>${esc(c.short)}</i></span>
          <span class="svctile-go" aria-hidden="true">${ICON.arrow}</span>
        </a>`;
      }).join('')}
    </div>
  </section>`;
}

/* ============================================================
   JUNIOR

   Worth being straight about: every bat in the catalogue starts
   at 34 inches, which is full adult size. There is no junior
   stock, so a "junior" filter over the shop would return an
   empty grid and a size chart would be pointing at bats no child
   should use.

   What the workshop CAN do is cut one to size, which is real and
   already how custom orders work. So this page sizes the player
   honestly and hands off to the custom bench, rather than
   pretending to a range that does not exist.
   ============================================================ */

const JUNIOR_SIZES = [
  { size: 'Size 3',   age: '4–6 yrs',   height: 'Up to 4ft',        blade: '25 in' },
  { size: 'Size 4',   age: '6–7 yrs',   height: "4'0\" – 4'3\"",    blade: '26 in' },
  { size: 'Size 5',   age: '8–9 yrs',   height: "4'3\" – 4'6\"",    blade: '27 in' },
  { size: 'Size 6',   age: '9–11 yrs',  height: "4'6\" – 4'9\"",    blade: '28 in' },
  { size: 'Harrow',   age: '12–14 yrs', height: "4'9\" – 5'3\"",    blade: '31 in' },
  { size: 'Full size',age: '15+',       height: "Over 5'3\"",       blade: '34 in +' }
];

function viewJunior() {
  return `
  <section class="svc-top dark">
    <div class="wrap">
      <nav class="crumbs"><a href="#/">Home</a> / <span>Junior players</span></nav>
      <p class="eyebrow">Young players</p>
      <h1 class="d1">The right size bat<span class="hl-2">for a growing player.</span></h1>
      <p class="lede">A bat that is too long or too heavy teaches a child to drag the handle and
        play across the line. Size it properly and the technique looks after itself.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap svc-wrap">
      <h2 class="d3">Find the size</h2>
      <p class="svc-sub">Go by height rather than age — children of the same age vary enormously.
        If they are between two sizes, take the smaller one.</p>
      <div class="jr-table-wrap">
        <table class="jr-table">
          <thead><tr><th>Size</th><th>Typical age</th><th>Height</th><th>Blade</th></tr></thead>
          <tbody>
            ${JUNIOR_SIZES.map(r => `<tr${r.size === 'Full size' ? ' class="jr-full"' : ''}>
              <td><b>${esc(r.size)}</b></td><td>${esc(r.age)}</td>
              <td>${esc(r.height)}</td><td>${esc(r.blade)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="jr-check">
        <h3>The two-second check</h3>
        <p>Stand the bat upright beside them with the toe on the ground. The top of the handle
          should reach roughly the top of their hip — not their waist, and never their chest.
          Then have them pick it up one-handed: if the toe drops, it is too heavy.</p>
      </div>

      <!-- Honest about stock. Our range starts at 34in, so anything below
           Harrow is made to order rather than picked off a shelf. -->
      <div class="jr-cta">
        <div>
          <p class="eyebrow">Made to size</p>
          <h3 class="d3">We cut junior bats to order</h3>
          <p>Our shelf range starts at full size, so anything smaller is shaped for the player
            on the bench. Tell us their height and how they play, and we will make one — same
            wood, same hands, scaled down.</p>
        </div>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#/service/custom">Order a junior bat ${ICON.arrow}</a>
          <a class="btn btn-ghost" href="#/shop?division=gully">See the lightest we stock</a>
        </div>
      </div>
    </div>
  </section>`;
}

/* ============================================================
   DELIVERY

   A pin code answers two questions at checkout: can we reach you
   at all, and roughly when. Both are answered before the order is
   placed rather than after, because "we don't deliver there" is
   the single worst thing to learn once you have already paid.
   ============================================================ */

/* Longest prefix wins, so '600' beats '6' beats ''. Sorting by length
   rather than trusting the order of the config means a zone added later
   cannot silently shadow a more specific one already there. */
function deliveryZone(pin) {
  const p = String(pin || '').replace(/\D/g, '');
  if (p.length !== 6) return null;
  return DELIVERY.zones
    .slice()
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(z => p.startsWith(z.prefix)) || null;
}

function pinServed(pin) {
  const p = String(pin || '').replace(/\D/g, '');
  if (p.length !== 6) return true;                 // not our job to validate length here
  return !DELIVERY.unserved.some(x => p.startsWith(String(x)));
}

/** The line shown under the PIN field at checkout. */
function deliveryNote(pin) {
  const p = String(pin || '').replace(/\D/g, '');
  if (p.length !== 6) return '';
  if (!pinServed(p)) {
    return `<span class="dv bad">Our couriers do not reach ${esc(p)} yet. ` +
      `Message us on WhatsApp — we can often still get a bat to you.</span>`;
  }
  const z = deliveryZone(p);
  if (!z) return '';
  return `<span class="dv ok">${ICON.truck} ${esc(z.label)} — usually ` +
    `<b>${esc(z.days)}</b> after dispatch</span>`;
}

/* ============================================================
   ANALYTICS

   Loads nothing at all until an ID exists in config. A tag that
   fires before anyone has decided to have analytics is a third
   party reading your visitors for no benefit.

   Loaded once, after first paint, so measurement never delays the
   page it is measuring.
   ============================================================ */

let _analyticsLoaded = false;

function loadAnalytics() {
  if (_analyticsLoaded) return;
  const { ga4, meta } = ANALYTICS || {};
  if (!ga4 && !meta) return;
  _analyticsLoaded = true;

  if (ga4) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('js', new Date());
    /* The site is a hash router, so GA would otherwise record one pageview
       for the whole visit. Automatic page_view is off and route() sends
       them instead. */
    gtag('config', ga4, { send_page_view: false });
    trackPage();
  }

  if (meta) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq('init', meta);
    fbq('track', 'PageView');
  }
}

function trackPage() {
  if (typeof gtag !== 'function') return;
  gtag('event', 'page_view', {
    page_location: location.href,
    page_path: location.hash.replace(/^#/, '') || '/',
    page_title: document.title
  });
}

/** Commerce events, ignored entirely when no analytics is configured. */
function trackEvent(name, params) {
  if (typeof gtag === 'function') gtag('event', name, params || {});
  if (typeof fbq === 'function') {
    const META = { add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout',
                   purchase: 'Purchase', view_item: 'ViewContent' };
    if (META[name]) fbq('track', META[name], params || {});
  }
}
