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
      { k: 'issue', t: 'radios', label: 'What is wrong?', req: true,
        opts: () => SERVICES.batDoctor.issues.map(i => ({
          v: i.id, label: i.label,
          note: i.from ? `₹${i.from}–${i.to} typically` : 'We will quote after seeing it' })) },
      { k: 'bat', t: 'text', label: 'Which bat is it?', ph: 'Toss Power X, or another brand', req: true },
      { k: 'age', t: 'select', label: 'How old is it?', req: true,
        opts: () => ['Under 6 months', '6–12 months', '1–2 years', 'Over 2 years'].map(v => ({ v, label: v })) },
      { k: 'note', t: 'textarea', label: 'Anything else we should know?', ph: 'When it happened, how it plays now…' }
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
      { k: 'wood', t: 'radios', label: 'Wood', req: true, opts: () => [
        { v: 'srilankan', label: 'Sri Lankan wood', note: 'Hardest hitting, heaviest' },
        { v: 'kashmir',   label: 'Kashmir Willow',  note: 'Balanced, the all-rounder' },
        { v: 'poplar',    label: 'Poplar',          note: 'Lightest pickup, softest' } ] },
      { k: 'profile', t: 'radios', label: 'Blade profile', req: true, opts: () => [
        { v: 'standard', label: 'Standard' }, { v: 'scoop', label: 'Scoop' },
        { v: 'flat', label: 'Flat' }, { v: 'bigedge', label: 'Big edge' },
        { v: 'mongoose', label: 'Mongoose' }, { v: 'multi', label: 'Double / triple blade' } ] },
      { k: 'weight', t: 'select', label: 'Weight', req: true,
        opts: () => ['Light — 650–699g', 'Medium — 700–760g', 'Heavy — 790–860g', 'Not sure, advise me']
          .map(v => ({ v, label: v })) },
      { k: 'ball', t: 'radios', label: 'Which ball?', req: true, opts: () => [
        { v: 'soft', label: 'Soft tennis ball' },
        { v: 'medium', label: 'Medium / hard tennis ball' } ] },
      { k: 'handle', t: 'select', label: 'Handle',
        opts: () => ['Single piece', 'Joint handle', 'Cane handle', 'Whatever suits the spec']
          .map(v => ({ v, label: v })) },
      { k: 'engraving', t: 'text', label: 'Engraving (optional)',
        ph: 'A name, a number, a team', max: () => SERVICES.engraving.maxChars,
        hint: () => `Up to ${SERVICES.engraving.maxChars} characters · +₹${SERVICES.engraving.price}` },
      { k: 'note', t: 'textarea', label: 'How do you play?', ph: 'Where you play, what you struggle with, anything you want us to know.' }
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
      { k: 'team', t: 'text', label: 'Team name', req: true, ph: 'As it should print' },
      { k: 'qty', t: 'number', label: 'How many jerseys?', req: true, min: 1, ph: '11' },
      { k: 'sizes', t: 'text', label: 'Size breakdown', req: true,
        ph: '2 S, 5 M, 3 L, 1 XL', hint: () => 'Available: ' + SERVICES.jersey.sizes.join(', ') },
      { k: 'names', t: 'textarea', label: 'Names and numbers',
        ph: 'One per line — Karthik 07, Arun 18…', hint: 'You can send this later if it is not final.' },
      { k: 'when', t: 'text', label: 'Needed by', ph: 'Tournament date, if there is one' }
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
      { k: 'org', t: 'text', label: 'Club, academy or shop name', req: true },
      { k: 'qty', t: 'number', label: 'How many bats?', req: true, min: 1, ph: '25',
        hint: () => `Bulk rates start at ${SERVICES.wholesale.min}.` },
      { k: 'mix', t: 'textarea', label: 'Which bats?', ph: 'Model names, or just a budget per bat and we will suggest.' },
      { k: 'gst', t: 'text', label: 'GSTIN (optional)', ph: 'For a tax invoice' },
      { k: 'when', t: 'text', label: 'Needed by' }
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
      { k: 'bat', t: 'text', label: 'What bat is it?', req: true, ph: 'Brand and model' },
      { k: 'condition', t: 'radios', label: 'Honest condition', req: true,
        opts: () => SERVICES.tradeIn.bands.map(b => ({
          v: b.id, label: b.label, note: `Usually ₹${b.from}–${b.to}` })) },
      { k: 'age', t: 'select', label: 'How long have you had it?', req: true,
        opts: () => ['Under 6 months', '6–12 months', '1–2 years', 'Over 2 years'].map(v => ({ v, label: v })) },
      { k: 'want', t: 'text', label: 'Which Toss bat do you want?', ph: 'Or leave it and we will suggest' }
    ]
  },

  video: {
    slug: 'video',
    title: 'Send us a video, get money off',
    eyebrow: 'Customer films',
    lede: () => `Film yourself playing with your Toss bat. If we use it, you get ` +
                `${SERVICES.video.rewardOff}% off your next order.`,
    cta: 'Submit my video',
    photos: { min: 1, max: 1, label: 'Your video', hint: () =>
      `At least ${SERVICES.video.minSeconds} seconds. Shot sideways (landscape) works best.`,
      accept: 'video/*' },
    consent: true,
    fields: [
      { k: 'bat', t: 'text', label: 'Which Toss bat is in the video?', req: true },
      { k: 'order', t: 'text', label: 'Your order number (optional)', ph: 'Speeds up the reward' },
      { k: 'insta', t: 'text', label: 'Instagram handle (optional)', ph: '@yourname — so we can credit you' }
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
  } else {
    input = `<input id="${id}" type="text" placeholder="${esc(f.ph || '')}"
      ${f.max ? `maxlength="${val(f.max)}"` : ''}>`;
  }

  return `<div class="svc-f" data-k="${f.k}" data-t="${f.t}"${f.req ? ' data-req="1"' : ''}>
    <label${f.t === 'radios' ? '' : ` for="${id}"`}>${esc(f.label)}${req}</label>
    ${input}${hint}
  </div>`;
}

function viewService(slug) {
  const kind = SVC_BY_SLUG[slug];
  const s = kind && SVC[kind];
  if (!s) return viewNotFound();

  const ph = s.photos || {};
  const wa = TOSS_LINKS.whatsapp;

  return `
  <section class="svc-top dark">
    <div class="wrap">
      <nav class="crumbs"><a href="#/">Home</a> / <span>${esc(s.title)}</span></nav>
      <p class="eyebrow">${esc(s.eyebrow)}</p>
      <h1 class="d1">${esc(s.title)}</h1>
      <p class="lede">${esc(val(s.lede))}</p>
      ${s.slabs ? `
        <div class="svc-slabs">
          ${SERVICES.wholesale.slabs.map(x => `
            <div class="svc-slab">
              <b>${x.off}% off</b>
              <span>${x.from}${x.to ? '–' + x.to : '+'} bats</span>
            </div>`).join('')}
        </div>` : ''}
      ${s.minNote ? `<p class="svc-min">${esc(val(s.minNote))}</p>` : ''}
      ${kind === 'bat_doctor' ? `<p class="svc-min">Turnaround: ${esc(SERVICES.batDoctor.turnaround)}</p>` : ''}
    </div>
  </section>

  <section class="sec">
    <div class="wrap svc-wrap">
      <form class="svc-form" id="svcForm" data-kind="${kind}" novalidate>

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

        ${s.fields.map(svcField).join('')}

        ${ph.max ? `
        <div class="svc-f" data-k="__photos"${ph.min ? ' data-req="1"' : ''}>
          <label>${esc(val(ph.label))}${ph.min ? ' <i>required</i>' : ''}</label>
          <div class="svc-up" id="svcUp">
            <input type="file" id="svcFile" accept="${ph.accept || 'image/*'}"
                   ${ph.max > 1 ? 'multiple' : ''} hidden>
            <button type="button" class="btn btn-ghost sm" id="svcPick">Choose file${ph.max > 1 ? 's' : ''}</button>
            <span class="svc-hint">${esc(val(ph.hint) || '')}</span>
          </div>
          <div class="svc-thumbs" id="svcThumbs"></div>
        </div>` : ''}

        ${s.consent ? `
        <div class="svc-f svc-consent">
          <label class="svc-check">
            <input type="checkbox" id="svcConsent">
            <span>I am happy for Toss to use this video in their posts and adverts, and I
              filmed it myself.</span>
          </label>
        </div>` : ''}

        <div class="svc-actions">
          <button class="btn btn-primary" type="submit" id="svcSend">${esc(s.cta)}</button>
          ${wa ? `<a class="btn btn-ghost" target="_blank" rel="noopener"
             href="https://wa.me/${wa}?text=${encodeURIComponent('Hi Toss, about ' + s.title + ' — ')}">
             Ask on WhatsApp instead</a>` : ''}
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
  return `${SUPA_URL}/storage/v1/object/public/requests/${path}`;
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
      } else {
        const el = $('input,select,textarea', box);
        v = el ? el.value.trim() : '';
      }
      out[k] = v;
    });
    return out;
  }

  function firstMissing(data) {
    for (const box of $$('.svc-f', form)) {
      if (!box.dataset.req) continue;
      const k = box.dataset.k;
      if (k === '__photos') { if (files.length < ph.min) return box; continue; }
      if (!data[k]) return box;
    }
    if (data.phone && data.phone.replace(/\D/g, '').length < 10) return $('[data-k="phone"]', form);
    if (s.consent && !$('#svcConsent').checked) return $('.svc-consent', form);
    return null;
  }

  form.onsubmit = async e => {
    e.preventDefault();
    const data = collect();

    const bad = firstMissing(data);
    if (bad) {
      $$('.svc-f', form).forEach(b => b.classList.remove('err'));
      bad.classList.add('err');
      bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const el = $('input,select,textarea', bad); if (el) el.focus({ preventScroll: true });
      stat.textContent = bad.classList.contains('svc-consent')
        ? 'Please tick the permission box so we can use the video.'
        : 'Fill this in and we can send it.';
      stat.className = 'svc-stat bad';
      return;
    }

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
  <section class="sec comm">
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

function servicesBandHTML() {
  const S = SERVICES;
  const cards = [
    S.batDoctor.enabled && { href: '#/service/bat-doctor', t: 'Bat Doctor',
      d: 'Cracked, loose or dead? Send a photo, get a price before you post it.', i: ICON.hammer },
    S.customBat.enabled && { href: '#/service/custom', t: 'Build your own',
      d: 'Your wood, your profile, your weight. Cut by hand to your spec.', i: ICON.star },
    S.tradeIn.enabled && { href: '#/service/trade-in', t: 'Trade in your old bat',
      d: 'We value it, you get that much off a new one.', i: ICON.rupee },
    S.wholesale.enabled && { href: '#/service/wholesale', t: 'Bulk & wholesale',
      d: `Club and academy rates from ${S.wholesale.min} bats.`, i: ICON.truck },
    S.jersey.enabled && { href: '#/service/jersey', t: 'Team jerseys',
      d: 'Names, numbers and your crest, printed to order.', i: ICON.shield },
    S.video.enabled && { href: '#/service/video', t: `Send a video, get ${S.video.rewardOff}% off`,
      d: 'Film yourself playing. If we use it, you get money off.', i: ICON.insta }
  ].filter(Boolean);
  if (!cards.length) return '';

  return `
  <section class="sec svcband">
    <div class="wrap">
      <div class="sec-head rv"><div>
        <p class="eyebrow">More than a shop</p>
        <h2 class="d2">We also fix, build and kit out</h2>
      </div>
      <a href="#/track" class="link-arrow">Track an order ${ICON.arrow}</a></div>
      <div class="svcband-grid">
        ${cards.map(c => `
          <a class="svcband-card rv" href="${c.href}">
            <span class="svcband-ico">${c.i}</span>
            <b>${esc(c.t)}</b>
            <p>${esc(c.d)}</p>
            <span class="svcband-go">${ICON.arrow}</span>
          </a>`).join('')}
      </div>
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
