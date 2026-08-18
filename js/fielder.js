/* ============================================================
   TOSS — the fielder who leaves the navbar

   When the batsman up in the header middles one, the ball drops onto
   the page and a fielder sprints in from the edge to chase it down,
   takes the catch, and throws it back up to the bar. He also reacts to
   what YOU do: appeals when a bat goes in the bag, raises the bat when
   a reward unlocks, applauds when an order is placed.

   The rules that keep a mascot from becoming an irritation:
     · Home and shop only. Nothing moves on the product page, the
       finder or checkout, where somebody is deciding or typing.
     · Rare on purpose — page load, then only on a real FOUR from the
       navbar, roughly every 30–40 seconds. Reactions are extra.
     · Never covers anything. He runs along the very bottom of the
       viewport, in a strip nothing else occupies, and is
       pointer-events:none apart from the figure itself.
     · Off entirely for reduced-motion, on small screens, while a
       drawer or modal is open, and when the tab is hidden.
     · One at a time. A second trigger while he is out is ignored
       rather than stacking sprites.
   ============================================================ */

const Fielder = (function () {

  const PAGES = ['home', 'shop'];        /* where he is allowed to appear */
  let host = null, guy = null, ball = null, bubble = null;
  let busy = false, page = '', mounted = false;

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tooSmall = () => innerWidth < 720;
  const blocked = () =>
    document.querySelector('.drawer.open, .modal, .win-splash, .tb-lb') !== null;

  const canPlay = () =>
    mounted && !busy && !reduced() && !tooSmall() && !blocked() &&
    PAGES.indexOf(page) > -1 && document.visibilityState === 'visible';

  /* ---------- the sprite ----------
     Deliberately the same construction as the navbar players — big head,
     noodly limbs — so this reads as one of them who came downstairs,
     not a different mascot. */
  function sprite(shirt) {
    return `
    <svg viewBox="0 0 44 58" class="fd-svg" aria-hidden="true">
      <ellipse class="fd-shadow" cx="22" cy="55" rx="13" ry="3"/>
      <g class="fd-body">
        <g class="fd-legs">
          <rect class="fd-leg l" x="16" y="38" width="5" height="15" rx="2.5"/>
          <rect class="fd-leg r" x="23" y="38" width="5" height="15" rx="2.5"/>
        </g>
        <rect x="13" y="24" width="18" height="17" rx="6" fill="${shirt}"/>
        <g class="fd-arms">
          <rect class="fd-arm l" x="7"  y="26" width="5" height="15" rx="2.5" fill="${shirt}"/>
          <rect class="fd-arm r" x="32" y="26" width="5" height="15" rx="2.5" fill="${shirt}"/>
        </g>
        <circle cx="22" cy="14" r="12" fill="#e8b088"/>
        <path d="M10 12a12 12 0 0 1 24 0z" fill="#1b1b3d"/>
        <circle class="fd-eye l" cx="18" cy="15" r="2.1" fill="#1b1b3d"/>
        <circle class="fd-eye r" cx="26" cy="15" r="2.1" fill="#1b1b3d"/>
        <path class="fd-mouth" d="M19 20q3 2.5 6 0" stroke="#1b1b3d" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function build() {
    host = document.createElement('div');
    host.className = 'fd-stage';
    host.innerHTML =
      `<div class="fd-ball"></div>
       <button class="fd-guy" type="button" aria-label="Play Gully Cricket">
         ${sprite('#7ee787')}
         <span class="fd-bubble" role="status"></span>
       </button>`;
    document.body.appendChild(host);

    guy = host.querySelector('.fd-guy');
    ball = host.querySelector('.fd-ball');
    bubble = host.querySelector('.fd-bubble');

    /* clicking him is a route into the game, which is the thing that
       already earns customers — not a dead flourish */
    guy.addEventListener('click', () => {
      say('Fancy a bat?');
      setTimeout(() => { location.hash = '/game'; }, 420);
    });
  }

  function say(text, hold) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.add('on');
    clearTimeout(say._t);
    say._t = setTimeout(() => bubble.classList.remove('on'), hold || 1800);
  }

  /* ---------- the chase ----------
     Enters from whichever side the ball is NOT on, so he always runs
     TOWARDS it rather than away and back. */
  function chase(fromRight) {
    if (!canPlay()) return;
    busy = true;

    const w = innerWidth;
    const landX = fromRight ? Math.round(w * 0.28) : Math.round(w * 0.72);
    const startX = fromRight ? w + 60 : -60;

    host.classList.add('on');
    guy.style.setProperty('--flip', fromRight ? '-1' : '1');

    /* the ball falls out of the header and bounces once */
    ball.style.setProperty('--bx', landX + 'px');
    ball.classList.remove('drop'); void ball.offsetWidth;
    ball.classList.add('drop');

    /* he sprints in, arrives just after the ball lands */
    guy.style.setProperty('--gx', startX + 'px');
    guy.dataset.pose = 'run';
    guy.classList.remove('in', 'out'); void guy.offsetWidth;
    guy.style.setProperty('--gx-end', (landX - 22) + 'px');
    guy.classList.add('in');

    setTimeout(() => {
      guy.dataset.pose = 'catch';
      ball.classList.remove('drop');
      ball.classList.add('caught');
      say(pick(['Got it!', 'Mine!', 'Taken.']));
    }, 1150);

    /* throw it back up to the bar, then jog off the way he came */
    setTimeout(() => {
      guy.dataset.pose = 'throw';
      ball.classList.remove('caught');
      ball.classList.add('thrown');
    }, 1850);

    setTimeout(() => {
      guy.dataset.pose = 'run';
      guy.classList.remove('in');
      guy.classList.add('out');
      ball.className = 'fd-ball';
    }, 2350);

    setTimeout(() => {
      host.classList.remove('on');
      guy.className = 'fd-guy';
      busy = false;
    }, 3300);
  }

  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------- reactions to what the visitor does ----------
     A short pop-in at the corner rather than a full chase, so it never
     interrupts the action that triggered it. */
  function react(kind) {
    if (!mounted || reduced() || tooSmall() || busy) return;
    if (document.visibilityState !== 'visible') return;

    const lines = {
      cart:   ['Howzat!', 'Good pick.', 'Shot.'],
      reward: ['Take a bow!', 'Well played!', 'Sixer.'],
      order:  ['Great knock.', 'See you at the ground.', 'Enjoy it.']
    }[kind] || ['Nice.'];

    busy = true;
    host.classList.add('on', 'corner');
    guy.dataset.pose = kind === 'reward' ? 'appeal' : kind === 'order' ? 'clap' : 'appeal';
    guy.classList.add('pop');
    say(pick(lines), 2200);

    setTimeout(() => {
      guy.classList.remove('pop');
      setTimeout(() => {
        host.classList.remove('on', 'corner');
        guy.className = 'fd-guy';
        busy = false;
      }, 420);
    }, 2000);
  }

  /* ---------- wiring ---------- */
  function mount() {
    if (mounted) return;
    build();
    mounted = true;

    /* the navbar tells us when the batsman middles one */
    document.addEventListener('toss:four', () => {
      if (canPlay()) chase(Math.random() < 0.5);
    });

    /* things the visitor does */
    document.addEventListener('toss:cart',   () => react('cart'));
    document.addEventListener('toss:reward', () => react('reward'));
    document.addEventListener('toss:order',  () => react('order'));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' && busy) {
        host.classList.remove('on', 'corner');
        guy.className = 'fd-guy';
        ball.className = 'fd-ball';
        busy = false;
      }
    });
  }

  /* the router tells us which page we are on */
  function setPage(p) {
    page = p;
    if (PAGES.indexOf(p) === -1 && busy) {
      host.classList.remove('on', 'corner');
      guy.className = 'fd-guy';
      ball.className = 'fd-ball';
      busy = false;
    }
  }

  /* one appearance shortly after landing, so a first-time visitor sees
     it happen at least once without waiting for the navbar */
  function greet() {
    setTimeout(() => { if (canPlay()) chase(true); }, 2600);
  }

  return { mount, setPage, greet, chase, react };
})();
