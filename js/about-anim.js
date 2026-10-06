/* ============================================================
   TOSS — motion for the story page

   The design is editorial, so the motion is too: restrained,
   and aimed at the things a printed page cannot do.

   TEXT DOES NOT ANIMATE. No reveals, no masks, no staggered
   words. Every headline, label and paragraph is at full opacity
   the moment its spread is on screen. What moves:

     · the running header, which reports the spread you are in
     · the poster plates, wiped open once and drifting after
     · the hero counters, which arrive at their value
     · the progress hairline

   PROGRESSIVE ENHANCEMENT. Nothing is hidden by CSS. Every
   starting state is set here, after GSAP has arrived. Blocked
   CDN, 404, or reduced-motion preference and the page is the
   same page — a tall editorial layout with every word visible
   and both posters up.
   ============================================================ */
(function () {
  'use strict';

  if (!window.gsap || !window.ScrollTrigger) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);

  /* Mobile browsers resize the viewport when the address bar hides. Left
     alone that re-measures every trigger mid-scroll and the page shifts
     under the finger. */
  ScrollTrigger.config({ ignoreMobileResize: true });

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* The spread this page was opened at, if it was opened at one. Read
     from the URL rather than handed over by the homepage, so it is the
     same answer whether the plate was morphed in from the story band or
     the link was pasted in cold. */
  var arrivedAt = (location.hash || '').slice(1);

  /* Archivo Black is far wider than the fallback, so every measurement
     taken before it lands is wrong by a line or two. */
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () { build(); ScrollTrigger.refresh(); });

  function build() {
    progress();
    runningHeader();
    plates();
    counters();
    rollLight();

    /* A lazy poster arriving after its trigger was measured shifts
       everything below it. */
    $$('.ed-fig img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', function () { ScrollTrigger.refresh(); });
    });
  }

  /* ---------- progress hairline ---------- */
  function progress() {
    var bar = document.createElement('div');
    bar.className = 'ed-progress';
    document.body.appendChild(bar);
    gsap.to(bar, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: .3 }
    });
  }

  /* ============================================================
     THE RUNNING HEADER

     A magazine repeats its section name on every leaf. This does the
     same thing, except it can keep up — the label swaps as each spread
     takes the screen, and swaps back on the way up.

     The swap is a two-step fade on the LABEL ELEMENT only. It is a
     changing readout, not a reveal of page copy, which is why it is the
     one piece of type here allowed to move.
     ============================================================ */
  function runningHeader() {
    var out = $('#edNow');
    if (!out) return;

    var spreads = $$('.ed-sp');
    var current = null;

    function show(sec) {
      if (!sec) return;
      var text = sec.dataset.num + ' — ' + sec.dataset.label;
      if (text === current) return;
      current = text;
      gsap.timeline()
        .to(out, { opacity: 0, y: -6, duration: .16, ease: 'power2.in' })
        .add(function () { out.textContent = text; })
        .to(out, { opacity: 1, y: 0, duration: .22, ease: 'power2.out' });
    }

    /* Which spread is "current" is decided by asking, on every scroll
       frame, which one crosses the reading line — not by a per-section
       enter/leave pair.

       Enter/leave was the first attempt and it silently skipped a spread
       at 1280x800: the handlers fire in DOM order, so on any frame where
       two boundaries move past at once the later one wins and the spread
       between them never gets announced. Reading the position instead
       cannot skip, because there is exactly one answer per frame. */
    var LINE = .45;

    function pick() {
      var y = window.innerHeight * LINE;
      var hit = null;
      for (var i = 0; i < spreads.length; i++) {
        var r = spreads[i].getBoundingClientRect();
        if (r.top <= y && r.bottom > y) { hit = spreads[i]; break; }
      }
      /* Above the first spread or past the last, hold the nearest rather
         than blanking the readout. */
      if (!hit) hit = window.scrollY < 10 ? spreads[0] : null;
      show(hit);
    }

    ScrollTrigger.create({
      trigger: document.body, start: 'top top', end: 'bottom bottom',
      onUpdate: pick, onRefresh: pick
    });
    pick();
  }

  /* ============================================================
     THE PLATES

     Each poster is wiped open from its base once, the way a printed
     plate is pulled, then drifts against the type for as long as it is
     on screen. Two separate animations on purpose: the wipe is a moment,
     the drift is a condition.

     The wipe is a clip-path on the FIGURE, so the image itself is never
     faded — at no point is there a half-transparent poster on screen,
     which is what makes it read as printing rather than loading.
     ============================================================ */
  function plates() {
    $$('.ed-fig').forEach(function (fig) {
      /* A plate that was arrived at by morphing in from the homepage is
         already whole and already on screen — it was just flown here.
         Pulling it open again would clip it back to nothing on the frame
         after it landed. The head of the page records which spread was
         landed on; this leaves that one open and lets the drift below
         pick it up as normal. */
      var sec = fig.closest('.ed-sp');
      if (arrivedAt && sec && sec.id === arrivedAt) {
        gsap.set(fig, { clipPath: 'inset(0% 0% 0% 0%)' });
      } else {
        gsap.fromTo(fig,
          { clipPath: 'inset(0% 0% 100% 0%)' },
          {
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: 1.15, ease: 'power3.inOut',
            scrollTrigger: { trigger: fig, start: 'top 88%' }
          });
      }

      var img = $('img', fig);
      if (!img) return;

      /* Scale slightly over-size first so the drift never exposes an
         edge, then move it less than the page moves. */
      gsap.fromTo(img,
        { scale: 1.08, yPercent: -3 },
        {
          scale: 1.08, yPercent: 3, ease: 'none',
          scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: 1 }
        });
    });
  }

  /* ============================================================
     THE LIGHT ON THE ROW

     Writes the pointer's position along a row into --mx, which about.css
     uses as the centre of both the gradient clipped to the letterforms
     and the glow behind them. The word lights where the cursor is.

     Set straight onto the element rather than through GSAP: this runs on
     pointermove and the value must land on the same frame as the pointer.
     A tween here would smear the highlight behind the cursor, which is
     the one thing it must not do.

     Skipped entirely on devices without hover — there is no pointer to
     follow, and on iOS a :hover state sticks after a tap.
     ============================================================ */
  function rollLight() {
    if (!window.matchMedia('(hover:hover)').matches) return;

    $$('.ed-roll li').forEach(function (row) {
      row.addEventListener('pointermove', function (e) {
        var r = row.getBoundingClientRect();
        row.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%');
      });
      /* Leave it where it exited rather than snapping to centre, so the
         fade-out carries on from where the light actually was. */
    });
  }

  /* ---------- the cover counters ----------
     Not a reveal: the numbers are on screen throughout, they simply
     arrive at their value. Keeps whatever is wrapped around the number
     — the K on 36.9K — and matches the decimals already written there,
     so 36.9 does not tick through 36.94382. */
  function counters() {
    $$('[data-count]').forEach(function (el) {
      var m = el.textContent.trim().match(/^([^\d]*)([\d.,]+)(.*)$/);
      if (!m) return;

      var pre = m[1], numText = m[2], post = m[3];
      var target = parseFloat(numText.replace(/,/g, ''));
      if (!isFinite(target)) return;

      var dot = numText.indexOf('.');
      var places = dot < 0 ? 0 : numText.length - dot - 1;
      var grouped = numText.indexOf(',') > -1;
      var obj = { v: 0 };

      gsap.to(obj, {
        v: target, duration: 1.5, ease: 'power2.out', delay: .3,
        onUpdate: function () {
          var n = obj.v.toFixed(places);
          if (grouped) n = Number(n).toLocaleString('en-IN');
          el.textContent = pre + n + post;
        }
      });
    });
  }
})();
