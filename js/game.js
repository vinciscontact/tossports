/* ============================================================
   TOSS GULLY CRICKET
   Canvas renders at 240x340 with smoothing off, then scales up.

   FIELD MODEL
   The earlier build conflated "shot direction" with "fielder
   position", so the straight fielder was drawn at the lane's x
   (dead centre) half way down the wicket — standing on the pitch,
   in the ball's flight path, on 67% of deliveries.

   Corrected: a SECTOR is the direction the batsman hits. Each
   sector has a real fielding position that is always OUTSIDE the
   pitch rectangle. Straight is long-on, BEYOND the bowler, because
   nobody fields in the middle of the wicket.

   PITCH is the strip between the two creases only. Everything past
   the bowler's stumps is outfield, which is what makes long-on a
   legal place to stand.

   Rules: 3 overs (18 balls) or 3 wickets. Two fielders per ball, so
   exactly one sector is always open. Perfect timing = six, good =
   four, but a four hit at a fielder is caught. Sixes clear anyone.
   ============================================================ */

const TossCricket = (function () {
  const W = 240, H = 340;

  /* the pitch: between the creases, nothing else */
  const PITCH = { x0: 89, x1: 151, y0: 84, y1: 298 };

  const BOWL_Y   = 96;    // bowler's delivery stride / stumps
  const CONTACT_Y = 268;  // batsman's feet
  const BAT_STUMPS = 282;
  const KEEPER_Y  = 306;

  /* Shot sectors. `pos` is where a fielder guarding that sector
     stands — verified off-pitch by the assertion below. */
  const SECTOR = [
    { key: 'leg',      name: 'Leg side',  spot: 'Midwicket', pos: [40, 188] },
    { key: 'straight', name: 'Straight',  spot: 'Long-on',   pos: [120, 44] },
    { key: 'off',      name: 'Off side',  spot: 'Cover',     pos: [200, 188] }
  ];

  const onPitch = (x, y) => x >= PITCH.x0 && x <= PITCH.x1 && y >= PITCH.y0 && y <= PITCH.y1;
  /* fail loudly in development if a fielding position ever lands on the wicket */
  SECTOR.forEach(s => {
    if (onPitch(s.pos[0], s.pos[1]))
      console.error('TossCricket: fielding position on the pitch —', s.spot, s.pos);
  });

  const MAX_BALLS = 18, MAX_WKTS = 3;

  const WIN = [
    { t: 32,  runs: 6, label: 'SIX!',     kind: 'six'  },
    { t: 62,  runs: 4, label: 'FOUR!',    kind: 'four' },
    { t: 105, runs: 2, label: 'TWO',      kind: 'run'  },
    { t: 155, runs: 1, label: 'SINGLE',   kind: 'run'  },
    { t: 215, runs: 0, label: 'DOT BALL', kind: 'dot'  }
  ];

  /* ---------- palette ---------- */
  const C = {
    grassA:'#2f7d32', grassB:'#37933b', outer:'#215c24', rope:'#f4f4f4',
    crowd:'#1d1d2e',
    pitch:'#d9bb92', pitchWorn:'#cdaa7d', crease:'#fbfbfb',
    skin:'#c98a4b', skinDark:'#a86f38',
    /* Toss batting kit */
    helmet:'#FF8A1E', grille:'#12123A', jersey:'#1B1B4D', trim:'#FF8A1E',
    pad:'#f2f2f2', padStrap:'#d8d8d8', glove:'#ffffff',
    batBlade:'#e3c089', batEdge:'#c39d63', batGrip:'#141414',
    /* opposition */
    oppTop:'#3EA6FF', oppLeg:'#eef4ff', oppCap:'#1c6fb8',
    ball:'#ffffff', ballShade:'#c8c8c8', stump:'#f7f7f7', bail:'#e0c060',
    shadow:'rgba(0,0,0,.22)'
  };

  let cv, ctx, raf, host, onEnd, S = null, keyHandler = null;

  const rnd = n => Math.floor(Math.random() * n);
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  /* boundary rope arc — gentle curve, higher in the middle */
  const ropeY = x => 16 + Math.pow(x - W / 2, 2) * 0.00085;

  /* ---------- state ---------- */
  function fresh() {
    return {
      runs: 0, wkts: 0, balls: 0, lane: 1,
      phase: 'ready', startT: 0, flightMs: 1400,
      swung: false, swingT: 0,
      fielders: [], gap: 1,
      msg: '', msgKind: '', sub: '', msgUntil: 0,
      shot: null, last: [], batSwing: 0,
      runUpT: 0, arm: 0, coupon: null
    };
  }

  function placeFielders() {
    S.gap = rnd(3);
    S.fielders = [0, 1, 2].filter(l => l !== S.gap);
  }

  function ballSpeed() {
    const f = S.balls / MAX_BALLS;
    return 1450 - f * 520 + (Math.random() * 120 - 60);
  }

  /* ---------- flow ---------- */
  function nextBall() {
    if (S.wkts >= MAX_WKTS || S.balls >= MAX_BALLS) return finish();
    S.phase = 'run-up';
    S.swung = false; S.shot = null; S.arm = 0;
    S.runUpT = performance.now();
    S.flightMs = ballSpeed();
    placeFielders();
    S.msg = ''; S.msgKind = '';
    setTimeout(() => {
      if (!S || S.phase !== 'run-up') return;
      S.phase = 'flight';
      S.startT = performance.now();
    }, 620);
  }

  function swing() {
    if (!S) return;
    if (S.phase === 'ready' || S.phase === 'over') { start(); return; }
    if (S.phase !== 'flight' || S.swung) return;
    S.swung = true;
    S.swingT = performance.now();
    S.batSwing = 1;
    resolve();
  }

  function resolve() {
    const d = Math.abs(S.swingT - (S.startT + S.flightMs));
    const w = WIN.find(x => d <= x.t);

    if (!w) return out('BOWLED!', 'MISTIMED');

    if (w.kind === 'dot') {
      S.balls++; S.last.push('•');
      show('DOT BALL', 'dot');
      flyShot(0.35, 'dot');
      return schedule();
    }

    /* a four straight at a fielder is pouched — a six goes over them */
    if (w.kind === 'four' && S.fielders.includes(S.lane)) {
      flyShot(0.85, 'four');
      return out('CAUGHT!', SECTOR[S.lane].spot);
    }

    S.runs += w.runs; S.balls++;
    S.last.push(String(w.runs));
    show(w.label, w.kind);
    flyShot(w.kind === 'six' ? 1.5 : w.kind === 'four' ? 1 : .55, w.kind);
    schedule();
  }

  function out(label, sub) {
    S.wkts++; S.balls++; S.last.push('W');
    show(label, 'out', sub);
    schedule();
  }
  function show(msg, kind, sub) {
    S.msg = msg; S.msgKind = kind; S.sub = sub || '';
    S.msgUntil = performance.now() + 1000;
  }
  function schedule() {
    S.phase = 'result';
    setTimeout(() => { if (S && S.phase === 'result') nextBall(); }, 1050);
  }

  /* ball travels toward the sector it was hit into */
  function flyShot(power, kind) {
    const t = SECTOR[S.lane].pos;
    const dx = t[0] - 120, dy = t[1] - CONTACT_Y;
    const len = Math.hypot(dx, dy) || 1;
    const sp = 2.2 + power * 3.4;
    S.shot = { x: 120, y: CONTACT_Y - 6, vx: dx / len * sp, vy: dy / len * sp, life: 1, kind };
  }

  function start() {
    S = fresh();
    S.phase = 'run-up';
    S.runUpT = performance.now();
    placeFielders();
    setTimeout(() => { if (S && S.phase === 'run-up') { S.phase = 'flight'; S.startT = performance.now(); } }, 800);
    paintHud();
  }

  function finish() {
    S.phase = 'over';
    paintHud();
    S.coupon = onEnd ? onEnd({ runs: S.runs, wkts: S.wkts, balls: S.balls }) : null;
    S.msg = 'INNINGS OVER'; S.msgKind = 'info'; S.sub = S.runs + ' runs off ' + S.balls;
  }

  /* ================= drawing ================= */

  function drawGround() {
    for (let y = 0; y < H; y += 18) px(0, y, W, 18, (y / 18) % 2 ? C.grassA : C.grassB);
    /* everything above the rope is out of play */
    for (let x = 0; x < W; x += 2) px(x, 0, 2, ropeY(x), C.outer);
    px(0, 0, W, 11, C.crowd);
    for (let i = 0; i < 46; i++) {          // crowd speckle (stable pattern)
      const x = (i * 37) % W, y = 2 + ((i * 13) % 7);
      px(x, y, 2, 2, ['#FF8A1E','#3EA6FF','#f2f2f2','#e5484d','#7ee787'][i % 5]);
    }
    for (let x = 0; x < W; x += 2) px(x, ropeY(x), 2, 2, C.rope);
  }

  function drawPitch() {
    px(PITCH.x0, PITCH.y0, PITCH.x1 - PITCH.x0, PITCH.y1 - PITCH.y0, C.pitch);
    px(PITCH.x0 + 20, PITCH.y0, 22, PITCH.y1 - PITCH.y0, C.pitchWorn);   // worn middle
    px(PITCH.x0, PITCH.y0, 1, PITCH.y1 - PITCH.y0, C.pitchWorn);
    px(PITCH.x1 - 1, PITCH.y0, 1, PITCH.y1 - PITCH.y0, C.pitchWorn);
    /* popping creases, with return creases at each END of them (not mid-pitch) */
    px(PITCH.x0 + 4,  BOWL_Y + 8,     54, 2, C.crease);
    px(PITCH.x0 + 4,  BAT_STUMPS + 6, 54, 2, C.crease);
    px(PITCH.x0 + 4,  BOWL_Y + 8,      2, 12, C.crease);
    px(PITCH.x0 + 56, BOWL_Y + 8,      2, 12, C.crease);
    px(PITCH.x0 + 4,  BAT_STUMPS - 6,  2, 12, C.crease);
    px(PITCH.x0 + 56, BAT_STUMPS - 6,  2, 12, C.crease);
  }

  function drawStumps(x, y) {
    px(x - 6, y, 2, 12, C.stump);
    px(x - 1, y, 2, 12, C.stump);
    px(x + 4, y, 2, 12, C.stump);
    px(x - 6, y - 2, 12, 2, C.bail);
  }

  /* generic cricketer sprite, ~22px tall, feet at (x,y) */
  function drawPlayer(x, y, k) {
    const helmet = k.helmet, cap = k.cap, top = k.top, leg = k.leg;
    px(x - 5, y + 1, 10, 2, C.shadow);                    // ground shadow
    /* legs / pads */
    px(x - 4, y - 7, 4, 7, leg);
    px(x + 1, y - 7, 4, 7, leg);
    if (k.pads) { px(x - 4, y - 7, 4, 2, C.padStrap); px(x + 1, y - 7, 4, 2, C.padStrap); }
    px(x - 4, y - 1, 4, 2, '#1a1a1a');                    // shoes
    px(x + 1, y - 1, 4, 2, '#1a1a1a');
    /* torso */
    px(x - 5, y - 15, 10, 9, top);
    if (k.trim) px(x - 5, y - 15, 10, 2, k.trim);
    /* arms */
    const ax = k.armX === undefined ? 0 : k.armX;
    px(x - 7, y - 14, 2, 7, top);
    px(x + 5 + ax, y - 14, 2, 7, top);
    if (!k.gloves) { px(x - 7, y - 8, 2, 2, C.skin); px(x + 5 + ax, y - 8, 2, 2, C.skin); }
    /* head */
    px(x - 3, y - 20, 6, 5, C.skin);
    if (helmet) {
      px(x - 4, y - 22, 8, 5, helmet);                    // shell
      px(x - 4, y - 17, 8, 2, C.grille);                  // grille
      px(x - 5, y - 20, 1, 3, helmet);
      px(x + 4, y - 20, 1, 3, helmet);
    } else if (cap) {
      px(x - 4, y - 22, 8, 3, cap);
      px(x - 5, y - 20, 10, 1, cap);
    }
  }

  function drawBatsman(now) {
    const x = 120, y = CONTACT_Y;
    if (S.batSwing > 0) S.batSwing -= 0.075;
    const swinging = S.batSwing > 0;
    const dir = S.lane === 0 ? -1 : S.lane === 2 ? 1 : 0;

    drawPlayer(x, y, {
      helmet: C.helmet, top: C.jersey, leg: C.pad, trim: C.trim, pads: true, gloves: true
    });
    /* gloves */
    px(x - 8, y - 9, 3, 3, C.glove);
    px(x + 5, y - 9, 3, 3, C.glove);

    /* bat — upright in stance, swung across on contact */
    if (swinging) {
      const s = 1 - S.batSwing;
      const bx = x + dir * (6 + s * 10) + (dir === 0 ? 0 : 0);
      const by = y - 12 + (dir === 0 ? -s * 8 : 0);
      px(bx - 2, by, 5, 3, C.batBlade);
      px(bx - 2, by, 5, 1, C.batEdge);
      px(x + dir * 4, y - 11, 3, 2, C.batGrip);
    } else {
      px(x + 6, y - 12, 2, 6, C.batGrip);                 // handle
      px(x + 5, y - 6, 4, 9, C.batBlade);                 // blade
      px(x + 5, y - 6, 1, 9, C.batEdge);
    }
    drawStumps(x, BAT_STUMPS);
  }

  function drawKeeper() {
    const x = 120, y = KEEPER_Y;
    px(x - 6, y + 1, 12, 2, C.shadow);
    px(x - 5, y - 6, 4, 6, C.oppLeg);                     // crouched legs
    px(x + 1, y - 6, 4, 6, C.oppLeg);
    px(x - 6, y - 13, 12, 8, C.oppTop);                   // wide crouched torso
    px(x - 3, y - 18, 6, 5, C.skin);
    px(x - 4, y - 20, 8, 3, C.oppCap);
    px(x - 9, y - 10, 4, 4, C.glove);                     // big gloves
    px(x + 5, y - 10, 4, 4, C.glove);
  }

  function drawFielders() {
    S.fielders.forEach(l => {
      const p = SECTOR[l].pos;
      drawPlayer(p[0], p[1], { cap: C.oppCap, top: C.oppTop, leg: C.oppLeg });
    });
  }

  function drawBowler(now) {
    let y = BOWL_Y, arm = 0, stride = 0;

    if (S.phase === 'run-up') {
      const p = Math.min(1, (now - S.runUpT) / 620);
      y = 40 + p * (BOWL_Y - 40);                        // runs in to the crease
      stride = Math.floor(p * 8) % 2;
      arm = p > 0.7 ? (p - 0.7) / 0.3 : 0;               // arm starts coming over
    } else if (S.phase === 'flight') {
      const p = Math.min(1, (now - S.startT) / 220);
      arm = 1 - p * 0.6;                                  // follow through
    }

    px(120 - 5, y + 1, 10, 2, C.shadow);
    drawPlayer(120, y, { cap: C.oppCap, top: C.oppTop, leg: C.oppLeg, armX: stride });

    /* bowling arm rotating over the top */
    if (arm > 0) {
      const a = -Math.PI / 2 + arm * Math.PI * 0.9;
      const sx = 120 + 5, sy = y - 14;
      for (let i = 1; i <= 4; i++) {
        px(sx + Math.cos(a) * i * 2, sy + Math.sin(a) * i * 2, 2, 2, C.oppTop);
      }
    }
    drawStumps(120, BOWL_Y + 4);
  }

  function drawBall(now) {
    if (S.phase !== 'flight' || S.swung) return;
    const p = Math.min(1, (now - S.startT) / S.flightMs);
    const y = BOWL_Y + 6 + p * (CONTACT_Y - 6 - BOWL_Y - 6);
    const sway = Math.sin(p * 3.1) * 4;                   // slight seam movement
    const x = 120 + sway;
    px(x - 2, y + 3, 4, 2, C.shadow);
    px(x - 2, y - 2, 4, 4, C.ball);
    px(x - 2, y - 2, 4, 1, C.ballShade);
  }

  function drawShot() {
    if (!S.shot) return;
    const s = S.shot;
    s.x += s.vx; s.y += s.vy; s.life -= 0.011;
    if (s.life <= 0 || s.y < -10 || s.x < -10 || s.x > W + 10) { S.shot = null; return; }
    px(s.x - 2, s.y - 2, 4, 4, C.ball);
  }

  function drawMsg(now) {
    if (!S.msg) return;
    if (S.phase !== 'over' && now > S.msgUntil) { S.msg = ''; return; }
    ctx.textAlign = 'center';
    const tone = S.msgKind === 'out' ? '#ff6b6b'
               : S.msgKind === 'six' ? '#ffd166'
               : S.msgKind === 'four' ? '#7ee787' : '#ffffff';

    if (S.phase === 'over') {
      /* end of innings dims the whole board rather than sitting on the field */
      ctx.fillStyle = 'rgba(7,7,26,.8)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#FF8A1E';
      ctx.font = 'bold 20px "Courier New",monospace';
      ctx.fillText(S.msg, W / 2, H / 2 - 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Courier New",monospace';
      ctx.fillText(S.sub, W / 2, H / 2 + 10);
      if (S.coupon) {
        /* deliberately does not print the code — the reward ticket
           does the reveal, so the surprise lands in one place */
        ctx.fillStyle = '#7ee787';
        ctx.font = 'bold 11px "Courier New",monospace';
        ctx.fillText('MYSTERY REWARD UNLOCKED', W / 2, H / 2 + 30);
      }
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = 'bold 9px "Courier New",monospace';
      ctx.fillText('PRESS SWING TO PLAY AGAIN', W / 2, H / 2 + 52);
      return;
    }

    /* in-play banner sits in the band between the fielders (y~188)
       and the batsman (y~246) so it never paints over a player */
    const top = 202, h = 38;
    ctx.fillStyle = 'rgba(11,11,36,.88)';
    ctx.fillRect(14, top, W - 28, h);
    ctx.fillStyle = '#FF8A1E';
    ctx.fillRect(14, top, W - 28, 2);
    ctx.fillStyle = tone;
    ctx.font = 'bold 16px "Courier New",monospace';
    ctx.fillText(S.msg, W / 2, top + 22);
    if (S.sub) {
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.font = 'bold 9px "Courier New",monospace';
      ctx.fillText(S.sub, W / 2, top + 33);
    }
  }

  /* highlight the open sector so the field is readable at a glance */
  function drawGapHint() {
    if (S.phase !== 'run-up' && S.phase !== 'flight') return;
    const p = SECTOR[S.gap].pos;
    ctx.strokeStyle = 'rgba(126,231,135,.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(p[0], p[1] - 8, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function loop() {
    const now = performance.now();
    drawGround();
    drawPitch();
    drawGapHint();
    drawFielders();
    drawBowler(now);
    drawKeeper();
    drawBatsman(now);
    drawBall(now);
    drawShot();

    if (S.phase === 'flight' && !S.swung && now - S.startT > S.flightMs + WIN[WIN.length - 1].t) {
      out('BOWLED!', 'NO SHOT');
    }
    drawMsg(now);
    paintHud();
    raf = requestAnimationFrame(loop);
  }

  /* ---------- HUD ---------- */
  function paintHud() {
    if (!host || !S) return;
    const set = (sel, v) => { const e = host.querySelector(sel); if (e) e.textContent = v; };
    set('[data-score]', S.runs + '/' + S.wkts);
    set('[data-overs]', Math.floor(S.balls / 6) + '.' + (S.balls % 6));
    set('[data-lane]', SECTOR[S.lane].name);
    set('[data-gap]', SECTOR[S.gap].spot + ' open');
    const strip = host.querySelector('[data-strip]');
    if (strip) strip.innerHTML = S.last.slice(-6).map(b =>
      `<i class="gb ${b === 'W' ? 'w' : b === '•' ? 'd' : (b === '6' || b === '4') ? 'big' : ''}">${b}</i>`).join('');
    host.querySelectorAll('[data-lanebtn]').forEach(b =>
      b.classList.toggle('on', +b.dataset.lanebtn === S.lane));
  }

  /* ---------- public ---------- */
  function move(d) { if (S && S.phase !== 'over') { S.lane = Math.max(0, Math.min(2, S.lane + d)); paintHud(); } }
  function setLane(l) { if (S && S.phase !== 'over') { S.lane = l; paintHud(); } }

  function mount(container, opts) {
    host = container;
    onEnd = opts && opts.onEnd;
    cv = host.querySelector('canvas');
    cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    S = fresh();
    placeFielders();

    host.querySelectorAll('[data-lanebtn]').forEach(b => b.onclick = () => setLane(+b.dataset.lanebtn));
    const sw = host.querySelector('[data-swing]');
    if (sw) sw.onclick = swing;
    cv.onclick = swing;

    keyHandler = e => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); move(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); swing(); }
    };
    window.addEventListener('keydown', keyHandler);

    paintHud();
    cancelAnimationFrame(raf);
    loop();
  }

  function destroy() {
    cancelAnimationFrame(raf);
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    keyHandler = null; S = null; host = null; ctx = null; cv = null;
  }

  return {
    mount, destroy, swing, move, setLane,
    get state() { return S; },
    geom: { W, H, PITCH, SECTOR, BOWL_Y, CONTACT_Y, KEEPER_Y, onPitch, ropeY }
  };
})();
