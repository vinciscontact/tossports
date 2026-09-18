/* ============================================================
   TOSS SPORTS — CONTACT US

   Required for Meta Business Verification, and the page a customer
   looks for the moment something has gone wrong. Three rules shape
   it, and all three are about the page telling the truth:

     · The name, address, phone and email printed here must be
       character-for-character what the site footer says. A reviewer
       comparing the two IS the test. Both read BUSINESS in
       seo/seo-data.js, so they cannot drift apart.

     · The form has to actually deliver. It posts straight to
       Supabase with the publishable key — the same key and the same
       row policies the shop already uses — so an enquiry becomes a
       row staff can see in the Maze Room, not an email hoping a
       mailbox exists. There is no MX record on this domain today,
       so anything built on email would arrive nowhere at all.

     · It has to degrade. If the script never runs, the phone,
       address and WhatsApp link are still printed on the page, and
       the form says plainly that it could not send rather than
       thanking somebody for a message that went nowhere.

   Exported as a function rather than inlined in build-seo.js so the
   page can be read, and argued with, on its own.
   ============================================================ */

const fs = require('fs');
const path = require('path');

/* The publishable key, read from the file the browser already loads, so there
   is one copy of it in the repository rather than two that can disagree.
   It is publishable by design — what protects the data is the row policies in
   sql/, not the secrecy of this string. */
function supaConfig(root) {
  const src = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
  const url = /const\s+SUPA_URL\s*=\s*'([^']+)'/.exec(src);
  const key = /const\s+SUPA_KEY\s*=\s*'([^']+)'/.exec(src);
  if (!url || !key) {
    throw new Error('contact-page: could not read SUPA_URL / SUPA_KEY from js/config.js');
  }
  return { url: url[1], key: key[1] };
}

/* `deps` is what build-seo.js already has: its shell, its escapers and its
   constants. Passing them keeps this module from re-implementing any of it. */
function contactPage(deps) {
  const { shell, esc, fitTitle, fitDesc, SITE, BUSINESS, ROOT } = deps;
  const SUPA = supaConfig(ROOT);

  const addr = a =>
    `${esc(a.street)}, ${esc(a.locality)}, ${esc(a.region)} ${esc(a.postal)}, India`;

  /* phones[0] is the workshop and registered business line; phones[1] is the
     WhatsApp number the shop publishes everywhere and the turf's own line.
     Both are printed and both are labelled — picking one and calling it "the"
     number would have meant guessing which of two real lines a reviewer
     should match against Meta Business Manager. */
  const PHONE = BUSINESS.phone;          /* primary — also the WhatsApp line */
  const WA_PHONE = BUSINESS.phone;
  const TURF_PHONE = BUSINESS.phone;
  const ALT_PHONE = BUSINESS.altPhone;

  const script = `
(function () {
  var URL = ${JSON.stringify(SUPA.url)};
  var KEY = ${JSON.stringify(SUPA.key)};
  var WA  = ${JSON.stringify(BUSINESS.whatsapp)};
  var PH  = ${JSON.stringify(WA_PHONE)};
  var f = document.getElementById('cuForm');
  if (!f) return;
  var out = document.getElementById('cuMsgOut');
  var btn = document.getElementById('cuSend');

  function say(t, bad) {
    out.textContent = t;
    out.className = 'contact-msg' + (bad ? ' bad' : ' good');
  }

  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = f.elements.name.value.trim();
    var msg  = f.elements.message.value.trim();
    var ph   = f.elements.phone.value.trim();
    var em   = f.elements.email.value.trim();

    if (!name) { say('Please tell us your name.', true); f.elements.name.focus(); return; }
    if (!msg)  { say('Please write a message.', true); f.elements.message.focus(); return; }
    if (!ph && !em) {
      say('Leave a phone number or an email, or we have no way to reply.', true);
      f.elements.phone.focus(); return;
    }

    btn.disabled = true;
    say('Sending\\u2026');

    fetch(URL + '/rest/v1/enquiries', {
      method: 'POST',
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        name: name,
        phone: ph || null,
        email: em || null,
        subject: f.elements.subject.value,
        message: msg,
        source: 'contact-page'
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var subject = f.elements.subject.value;
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { lead_source: 'contact_form', subject: subject });
      }
      f.reset();
      say('Thank you \\u2014 your message has reached us. We usually reply the same day.');

      /* The WhatsApp nudge is an OFFER, not an automatic redirect. The
         enquiry is already saved; opening a tab nobody asked for is what
         popup blockers exist to stop, and it would look like a failure. */
      if (!document.getElementById('cuWa')) {
        var a = document.createElement('a');
        a.id = 'cuWa';
        a.className = 'btn-seo contact-wa';
        a.target = '_blank';
        a.rel = 'noopener';
        a.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(
          'Hi Toss Sports, I have just sent an enquiry from your website about: ' +
          subject + '\\n\\n\\u2014 ' + name);
        a.textContent = 'Also send it on WhatsApp';
        out.parentNode.insertBefore(a, out.nextSibling);
      }
    }).catch(function () {
      /* Never claim it sent when it did not. Hand them the channel that
         works without us. */
      say('That did not send, and we are sorry. Please WhatsApp or call us on ' +
          PH + ' and we will pick it up straight away.', true);
    }).then(function () {
      btn.disabled = false;
    });
  });
})();`;

  const body = `
  <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Home</a> / <span>Contact us</span></nav>
  <h1>Contact ${esc(BUSINESS.legalName)}</h1>
  <p class="seo-lede">Questions about a bat, an order, a repair or a warranty claim — this
    reaches the people who actually make them. We answer fastest on WhatsApp.</p>

  <div class="contact-grid">

    <!-- Second in the source, first on a desktop: a phone should meet the
         form before the reference details. -->
    <section class="contact-card contact-card--form" aria-labelledby="cuH">
      <h2 id="cuH">Send us a message</h2>
      <p class="contact-sub">We reply the same day, seven days a week.</p>

      <form class="contact-form" id="cuForm" novalidate>
        <div class="contact-row">
          <div class="contact-field">
            <label for="cuName">Your name <span class="req" aria-hidden="true">*</span></label>
            <input id="cuName" name="name" type="text" required maxlength="120" autocomplete="name">
          </div>
          <div class="contact-field">
            <label for="cuPhone">Phone</label>
            <input id="cuPhone" name="phone" type="tel" maxlength="32" autocomplete="tel"
                   inputmode="tel" placeholder="So we can call you back">
          </div>
        </div>

        <div class="contact-row">
          <div class="contact-field">
            <label for="cuEmail">Email</label>
            <input id="cuEmail" name="email" type="email" maxlength="160" autocomplete="email"
                   placeholder="you@example.com">
          </div>
          <div class="contact-field">
            <label for="cuSubject">What is it about?</label>
            <select id="cuSubject" name="subject">
              <option>General enquiry</option>
              <option>About an order</option>
              <option>Warranty or replacement claim</option>
              <option>Bat repair (Bat Doctor)</option>
              <option>Custom or bulk order</option>
              <option>Turf booking</option>
            </select>
          </div>
        </div>

        <div class="contact-field">
          <label for="cuMsg">Message <span class="req" aria-hidden="true">*</span></label>
          <textarea id="cuMsg" name="message" required maxlength="4000" rows="6"
            placeholder="Tell us what you need. If it is about an order, include the order number."></textarea>
          <span class="hint">Leave a phone number or an email above, or we have no way to reply.</span>
        </div>

        <button type="submit" class="btn-seo" id="cuSend">Send message</button>
        <p class="contact-msg" id="cuMsgOut" role="status" aria-live="polite"></p>

        <p class="contact-alt">Prefer to talk?
          <a href="https://wa.me/${BUSINESS.whatsapp}" rel="noopener" target="_blank">Message us on WhatsApp</a>
          or call the workshop on <a href="tel:${PHONE}">${PHONE}</a>.</p>
      </form>
    </section>

    <section class="contact-card contact-card--info" aria-labelledby="cuD">
      <h2 id="cuD">Business details</h2>
      <p class="contact-sub">The registered details for ${esc(BUSINESS.legalName)}.</p>

      <dl class="contact-dl">
        <div><dt>Business</dt><dd>${esc(BUSINESS.legalName)}</dd></div>
        <div><dt>Address</dt><dd>${addr(BUSINESS.main)}</dd></div>
        <div><dt>Phone &amp; WhatsApp</dt><dd><a href="tel:${PHONE}">${PHONE}</a> ·
          <a href="https://wa.me/${BUSINESS.whatsapp}" rel="noopener" target="_blank">WhatsApp</a></dd></div>
        ${ALT_PHONE ? `<div><dt>Alternate</dt><dd><a href="tel:${ALT_PHONE}">${ALT_PHONE}</a></dd></div>` : ''}
        <div><dt>Email</dt><dd><a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a></dd></div>
        <div><dt>Hours</dt><dd>${esc(BUSINESS.hours)}</dd></div>
      </dl>

      <div class="contact-places">
        <div class="contact-place">
          <b>Workshop and store</b>
          <p>${addr(BUSINESS.main)}<br><a href="tel:${PHONE}">${PHONE}</a></p>
        </div>
        <div class="contact-place">
          <b>${esc(BUSINESS.turf.name)}</b>
          <p>${addr(BUSINESS.turf)}<br><a href="tel:${TURF_PHONE}">${TURF_PHONE}</a></p>
        </div>
      </div>
    </section>

  </div>

<script>${script}</script>`;

  return shell({
    path: '/contact-us/', depth: '../',
    /* The shell already appends the brand, so naming it here gave
       "Contact Us | Toss Sports, Chennai | Toss Sports". */
    title: fitTitle('Contact Us — Chennai Workshop'),
    h1: 'Contact ' + BUSINESS.legalName,
    desc: fitDesc('Call, WhatsApp, email or message ' + BUSINESS.legalName +
      ' in Chennai. Workshop address, phone number and a contact form for orders, ' +
      'repairs and warranty claims.'),
    body: body,
    schema: [
      {
        '@type': 'ContactPage',
        '@id': SITE + '/contact-us/#page',
        url: SITE + '/contact-us/',
        name: 'Contact ' + BUSINESS.legalName,
        about: { '@id': SITE + '/#organization' }
      }
    ]
  });
}

module.exports = { contactPage };
