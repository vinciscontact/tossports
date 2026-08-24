/* ============================================================
   TOSS — the living navbar

   A short passage of play on loop. The bowler runs in from the
   left pocket, the ball crosses behind the centred links, the
   batsman plays at it in the right pocket, and a fielder chases
   whatever comes back. Four, caught, or bowled — then they reset
   and go again.

   Safety rules, so play never costs usability:
     · the scene is pointer-events:none and sits BEHIND the links,
       so it can never intercept a nav click. Only the players
       themselves take a click, and that only toggles pause.
     · off entirely under prefers-reduced-motion
     · off when the nav is hidden (mobile)
     · pauses when a drawer is open, the tab is hidden, or the
       header is scrolled away
     · the pause choice is remembered
   ============================================================ */

const NavPlay = (function () {
  let arena, scene, ball, ground, bowler, bat, field, raf = null;
  let running = false, offByUser = false;
  let st = null, t0 = 0, outcome = null;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const navVisible = () => {
    const n = document.querySelector('.nav');
    return n && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 120;
  };

  /* ---------- sprites ---------- */
  /* Big head, noodly limbs, stubby legs. Those proportions are what let a
     44px figure read as a person rather than a smudge. */
  function person(shirt, opts) {
    opts = opts || {};
    return `
    <svg viewBox="0 0 44 58" class="fl-svg">
      <ellipse class="fl-shadow" cx="22" cy="55" rx="13" ry="3"/>
      <g class="fl-body">
        <g class="fl-legs">
          <rect class="fl-leg l" x="16" y="38" width="5" height="15" rx="2.5"/>
          <rect class="fl-leg r" x="23" y="38" width="5" height="15" rx="2.5"/>
        </g>
        <rect x="13" y="24" width="18" height="17" rx="6" fill="${shirt}"/>
        <g class="fl-arms">
          <rect class="fl-arm l" x="7"  y="26" width="5" height="15" rx="2.5" fill="${shirt}"/>
          <rect class="fl-arm r" x="32" y="26" width="5" height="15" rx="2.5" fill="${shirt}"/>
        </g>
        ${opts.bat ? '<rect class="fl-willow" x="36" y="24" width="4" height="19" rx="1.5" fill="#d9a441"/>' : ''}
        <circle cx="22" cy="14" r="12" fill="#e8b088"/>
        <path d="M10 12a12 12 0 0 1 24 0z" fill="${opts.helmet || '#1b1b3d'}"/>
        ${opts.helmet ? '<rect x="9" y="12" width="26" height="2.4" rx="1.2" fill="#c9ccd8"/>' : ''}
        <circle class="fl-eye l" cx="18" cy="15" r="2.1" fill="#1b1b3d"/>
        <circle class="fl-eye r" cx="26" cy="15" r="2.1" fill="#1b1b3d"/>
        <path class="fl-mouth" d="M19 20q3 2.5 6 0" stroke="#1b1b3d" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function makeActor(cls, shirt, opts) {
    const el = document.createElement('div');
    el.className = 'actor ' + cls;
    el.innerHTML = person(shirt, opts);
    el.title = 'Click to pause the players — a stump icon appears to bring them back';
    el.onclick = e => { e.preventDefault(); togglePause(); };
    scene.appendChild(el);
    return el;
  }

  /* ------------------------------------------------------------
     The way back.

     Pausing used to be a one-way door. Clicking any player wrote
     'off' and hid the scene — which removed the only thing that
     could be clicked to undo it. There was no control anywhere
     else on the site, so a single accidental click on a figure
     labelled "click to pause" silenced the navbar permanently on
     that browser, and the only cure was clearing site data.

     The choice is still remembered, because someone who turned
     the players off meant it. But a small stump chip is left
     behind in their place, so the door opens from both sides.
     ------------------------------------------------------------ */
  function restoreChip(show) {
    /* Lives inside .hdr-act as an ordinary flex item, not absolutely
       positioned in the header. Pinned to the right edge it sat on top of
       the search and cart buttons and swallowed their clicks — the cart is
       not something a decorative control gets to cover. As a sibling it
       takes its own space and pushes nothing out of reach. */
    const host = document.querySelector('.hdr-act') || arena;
    let chip = host.querySelector('.nav-back');
    if (!show) { if (chip) chip.remove(); return; }
    if (chip) return;
    chip = document.createElement('button');
    chip.className = 'nav-back';
    chip.type = 'button';
    chip.title = 'Bring the players back';
    chip.setAttribute('aria-label', 'Bring the cricket players back to the navigation bar');
    chip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
      <path d="M14.5 3.5 20 9l-8.5 8.5-5.5-5.5z"/><path d="m6 12-2.5 2.5 4 4L10 16"/></svg>`;
    chip.onclick = e => { e.preventDefault(); togglePause(); };
    host.insertBefore(chip, host.firstChild);
  }

  function togglePause() {
    offByUser = !offByUser;
    localStorage.setItem('toss_nav_play', offByUser ? 'off' : 'on');
    restoreChip(offByUser);
    if (offByUser) stop(true); else { scene.classList.remove('hide'); start(); }
  }

  /* ---------- geometry ----------
     The links are centred, so the two pockets either side of them are the
     playing area. Measured live so a fielder can never stand on the logo,
     the links or the cart icons however the header is sized. */
  function zones() {
    const base = arena.getBoundingClientRect();
    const brand = document.querySelector('.brand');
    const nav = document.querySelector('.nav');
    const act = document.querySelector('.hdr-act');
    const r = el => el ? el.getBoundingClientRect() : null;
    const b = r(brand), n = r(nav), a = r(act);

    let lo = (b ? b.right - base.left : 0) + 10;
    let hi = (a ? a.left - base.left : base.width) - 10;
    let navL = n ? n.left - base.left : base.width * 0.4;
    let navR = n ? n.right - base.left : base.width * 0.6;

    /* fall back to simple thirds if the pockets are too tight to use */
    if (navL - lo < 70 || hi - navR < 70) { navL = base.width * 0.42; navR = base.width * 0.58; }
    return { lo, hi, navL, navR, h: base.height };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - t, 2);
  const place = (el, x, y, extra) => {
    el.style.transform = `translate(${x}px, ${y}px) ${extra || ''}`;
  };

  /* ---------- the over ---------- */
  function reset() {
    st = 'runup'; t0 = performance.now(); outcome = null;
    bowler.dataset.pose = 'run';
    bat.dataset.pose = 'stance';
    field.dataset.pose = 'idle';
    ball.style.opacity = '1';
  }

  function say(text, kind, x, gy) {
    const s = document.createElement('span');
    s.className = 'nav-pop ' + kind;
    s.textContent = text;
    s.style.top = (gy - 52) + 'px';
    s.style.left = x + 'px';
    scene.appendChild(s);
    /* keep the shout clear of the logo and the links it might land on */
    const z = zones();
    const half = s.getBoundingClientRect().width / 2;
    let L = x;
    if (L - half < z.lo) L = z.lo + half;
    if (L + half > z.hi) L = z.hi - half;
    s.style.left = L + 'px';
    setTimeout(() => s.remove(), 1100);
  }

  function step(now) {
    if (!running) return;
    const z = zones();
    const gy = z.h - 9;                      // the painted ground line
    const el = now - t0;

    const bowlFrom = z.lo + 16;              // start of the run-up
    const release  = Math.max(z.lo + 40, z.navL - 26);
    const batAt    = Math.min(z.hi - 34, z.navR + 30);

    place(bat, batAt - 22, gy - 58);
    bat.style.setProperty('--flip', '-1');

    if (st === 'runup') {
      const t = Math.min(1, el / 900);
      place(bowler, lerp(bowlFrom, release, ease(t)) - 22, gy - 58);
      place(ball, lerp(bowlFrom, release, ease(t)) - 5, gy - 34);
      if (t >= 1) { st = 'flight'; t0 = now; bowler.dataset.pose = 'deliver'; }
    }

    else if (st === 'flight') {
      const t = Math.min(1, el / 780);
      const x = lerp(release, batAt - 14, t);
      const bounce = Math.abs(Math.sin(t * Math.PI * 1.6)) * 16;
      place(ball, x - 5, gy - 12 - bounce, `rotate(${t * 540}deg)`);
      if (t > 0.6) bat.dataset.pose = 'lift';
      if (t >= 1) {
        bat.dataset.pose = 'swing';
        const roll = Math.random();
        outcome = roll < 0.5 ? 'four' : roll < 0.8 ? 'caught' : 'bowled';
        st = outcome; t0 = now;
        if (outcome === 'bowled') { bat.dataset.pose = 'beaten'; say('BOWLED!', 'bad', batAt, gy); }
        if (outcome === 'four') {
          say('FOUR!', 'good', batAt, gy);
          /* the ball has left the bar — tell the page, so a fielder can
             come down and chase it. Fired as an event rather than a
             direct call so the navbar keeps working with or without him. */
          document.dispatchEvent(new CustomEvent('toss:four'));
        }
        if (outcome === 'caught') field.dataset.pose = 'run';
      }
    }

    /* driven back past the bowler for four */
    else if (st === 'four') {
      const t = Math.min(1, el / 1100);
      const x = lerp(batAt - 14, z.lo - 30, ease(t));
      const hop = Math.abs(Math.sin(t * Math.PI * 4)) * (1 - t) * 20;
      place(ball, x - 5, gy - 12 - hop, `rotate(${-t * 900}deg)`);
      place(field, lerp(z.navL - 60, z.lo + 10, ease(t)) - 22, gy - 58);
      field.dataset.pose = 'run';
      if (t >= 1) { st = 'over'; t0 = now; ball.style.opacity = '0'; field.dataset.pose = 'idle'; }
    }

    /* skied — the fielder gets under it */
    else if (st === 'caught') {
      const t = Math.min(1, el / 1000);
      const to = z.navR + 46;
      const x = lerp(batAt - 14, to, t);
      const arc = Math.sin(t * Math.PI) * (z.h * 0.75);
      place(ball, x - 5, gy - 26 - arc, `rotate(${t * 720}deg)`);
      place(field, lerp(z.hi - 40, to, ease(t)) - 22, gy - 58);
      if (t > 0.6) field.dataset.pose = 'dive';
      if (t >= 1) {
        field.dataset.pose = 'celebrate';
        say('CAUGHT!', 'good', to, gy);
        st = 'over'; t0 = now;
      }
    }

    else if (st === 'bowled') {
      const t = Math.min(1, el / 700);
      place(ball, lerp(batAt - 14, batAt + 26, t) - 5, gy - 10 - Math.sin(t * Math.PI) * 8);
      if (t >= 1) { st = 'over'; t0 = now; }
    }

    else if (st === 'over') {
      if (el > 1000) {
        place(field, z.hi - 60, gy - 58);
        place(bowler, bowlFrom - 22, gy - 58);
        reset();
      }
    }

    raf = requestAnimationFrame(step);
  }

  /* ---------- lifecycle ---------- */
  function start() {
    if (running || offByUser || reduced() || !navVisible() || !scene) return;
    running = true;
    scene.classList.remove('hide');
    if (!st) reset();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }
  function stop(hide) {
    running = false;
    cancelAnimationFrame(raf);
    if (hide && scene) scene.classList.add('hide');
  }
  function blocked() {
    return document.querySelector('.drawer.open') || document.hidden || window.scrollY > 140;
  }
  function tick() {
    if (offByUser || reduced() || !navVisible()) { stop(true); return; }
    if (blocked()) stop(false); else start();
  }

  function mount() {
    arena = document.querySelector('.hdr-in');
    /* Build regardless of the current width and let tick() decide whether to
       show it — gating construction on the viewport left the header
       permanently empty if you loaded narrow and then widened. */
    if (!arena || reduced()) return;
    offByUser = localStorage.getItem('toss_nav_play') === 'off';

    scene = document.createElement('div');
    scene.className = 'nav-scene';
    scene.innerHTML = `
      <span class="nav-light l"></span><span class="nav-light r"></span>
      <span class="nav-ground"></span>
      <span class="nav-crease a"></span><span class="nav-crease b"></span>`;
    arena.appendChild(scene);

    bowler = makeActor('a-bowl', '#5b8cff');
    bat    = makeActor('a-bat',  '#FF8A1E', { bat: true, helmet: '#22224a' });
    field  = makeActor('a-field', '#7ee787');

    ball = document.createElement('div');
    ball.className = 'nav-ball';
    scene.appendChild(ball);

    reset();
    /* Someone arriving with the players already switched off from a previous
       visit needs the chip too, not just the person who clicks it now. */
    restoreChip(offByUser);
    window.addEventListener('resize', tick, { passive: true });
    window.addEventListener('scroll', tick, { passive: true });
    document.addEventListener('visibilitychange', tick);
    setInterval(tick, 900);
    tick();
  }

  return { mount };
})();
