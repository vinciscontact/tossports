/* ============================================================
   TOSS SPORTS — THE COOKIE CHOICE

   Nothing that measures a visitor runs until that visitor says yes.

   ─────────────────────────────────────────────────────────────
   WHAT ACTUALLY NEEDS ASKING

   This site sets no cookies of its own. The bag, the coupon and the
   game scores live in localStorage, are never sent anywhere, and are
   the shop doing what the shopper asked — no consent is owed for
   those, and a banner that claims otherwise is noise.

   Two things do need asking, and only one of them is ours:

     Google Analytics   measures visits. Not needed to sell a bat,
                        so it waits for a yes.
     Razorpay           sets its own cookies during a payment. That
                        is the transaction the customer started, so
                        it is necessary and is not gated here.

   ─────────────────────────────────────────────────────────────
   WHY THIS FILE IS SEPARATE, AND FIRST

   The shop is one page of JavaScript; the 75 landing pages Google
   sends people to are static HTML. Both have to honour the same
   answer, so the decision cannot live inside the shop's bundle. This
   file is small, has no dependencies, and is loaded by both.

   It also has to run BEFORE anything measuring loads, which is why
   the tag is no longer in the page head on the static pages: it is
   requested here, after a yes, and never otherwise.

   ─────────────────────────────────────────────────────────────
   WHAT IS REMEMBERED

   One value in localStorage: 'yes' or 'no'. No cookie is set to
   record that there is no consent for cookies, which would be a
   strange thing to do. A visitor who never answers is treated as
   no — the banner simply asks again next visit.
   ============================================================ */

(function () {
  'use strict';

  var KEY = 'toss_consent';
  /* config.js declares ANALYTICS with `const`, which makes a global binding
     but does NOT put it on `window` — so window.ANALYTICS is undefined and
     reading it that way silently found nothing, leaving the banner unasked
     and the measuring off. Classic scripts share one scope, so the name is
     simply read directly. TOSS_GA4 is the static pages, which have no
     config.js at all. */
  var GA4 = '';
  try { if (typeof ANALYTICS === 'object' && ANALYTICS) GA4 = ANALYTICS.ga4 || ''; } catch (e) {}
  if (!GA4) GA4 = window.TOSS_GA4 || '';

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private window; fine */ }
  }

  /* ---------- the measuring itself ---------- */
  var started = false;
  function startAnalytics() {
    if (started || !GA4) return;
    started = true;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4);
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('js', new Date());

    /* The shop is a hash router and sends its own page views, so automatic
       ones are off there. A static landing page has no router, so it needs
       the one page view gtag would have sent by itself. */
    var isShop = !!document.getElementById('app');
    gtag('config', GA4, isShop ? { send_page_view: false } : {});
    if (isShop && typeof window.trackPage === 'function') window.trackPage();
  }

  /* ---------- the banner ---------- */
  function depth() {
    /* A landing page sits one folder down (/cricket-bats-under-1500/), the
       shop sits at the root. Links have to work from both. */
    var p = location.pathname.replace(/\/[^/]*$/, '/');
    var n = (p.match(/\//g) || []).length - 1;
    return n > 0 ? new Array(n + 1).join('../') : '';
  }

  function ask() {
    var up = depth();
    var bar = document.createElement('div');
    bar.className = 'ck-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookies');
    bar.innerHTML =
      '<div class="ck-in">' +
        '<p>We would like to count visits to this shop, so we know which bats ' +
        'people look at. Nothing is measured unless you say yes. ' +
        '<a href="' + up + 'cookie-policy/">What we store</a></p>' +
        '<div class="ck-btns">' +
          '<button type="button" class="ck-no">No thanks</button>' +
          '<button type="button" class="ck-yes">Yes, that is fine</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('on'); });

    function close(answer) {
      write(answer);
      bar.classList.remove('on');
      setTimeout(function () { bar.remove(); }, 280);
      if (answer === 'yes') startAnalytics();
    }
    bar.querySelector('.ck-yes').onclick = function () { close('yes'); };
    bar.querySelector('.ck-no').onclick  = function () { close('no'); };
  }

  /* ---------- what happens on every page ---------- */
  var answer = read();
  if (answer === 'yes') startAnalytics();

  /* A visitor who has not answered gets asked — but only once the page has
     drawn, so the banner never competes with the first paint. */
  if (!answer && GA4) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ask);
    } else {
      ask();
    }
  }

  /* Changing your mind, from the footer link on any page. */
  window.tossCookieChoice = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (!document.querySelector('.ck-bar')) ask();
  };
  window.tossConsentGiven = function () { return read() === 'yes'; };
})();
