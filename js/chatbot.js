/* ============================================================
   TOSS — the dressing-room bot

   Understands typed questions (not just buttons), talks like a
   gully commentator, and opens differently depending on the page
   you're on. Answers what it can from the live catalogue, and
   hands to WhatsApp with the whole thread prewritten when a
   human is genuinely needed.

   No API, no keys, no per-message cost.
   ============================================================ */

const Bot = (function () {
  let panel, list, input, chipRow, open = false, ctxBat = null;
  const thread = [];                       // for the WhatsApp hand-off

  /* ---------- voice ---------- */
  const OPENERS = [
    "Right then — what are we after?",
    "Welcome to the middle. What do you need?",
    "Bat in hand? Let's sort you out."
  ];
  const ACK = ["Shot.", "Good call.", "Right you are.", "Clean strike."];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------- intents ---------- */
  /* `strong` intents are about a transaction or a policy — if one of those
     words appears the customer means it, and it must beat a vague catalogue
     word. Without this, "do you deliver to bangalore and how much" scored as
     a price question and returned bats instead of the shipping answer. */
  const INTENTS = [
    { id:'order',    strong:1, kw:['my order','order status','where is my','track','tracking','not received','refund','return','cancel'] },
    { id:'bulk',     strong:1, kw:['bulk','team order','club','tournament','wholesale','dealer','academy','bulk order','15 bats','10 bats'] },
    { id:'custom',   strong:1, kw:['custom','customise','customize','sticker','my name','paint','scoop design','my own'] },
    { id:'warranty', strong:1, kw:['warranty','guarantee','broken','breaks','replace','damaged'] },
    { id:'ship',     strong:1, kw:['ship','shipping','delivery','deliver','courier','how long','free shipping','postage','dispatch'] },
    { id:'pay',      strong:1, kw:['payment','upi','razorpay','cod','cash on delivery','net banking','emi'] },
    { id:'game',     strong:1, kw:['gully cricket','discount code','coupon','reward','gully50','gully100','leaderboard'] },
    { id:'human',    strong:1, kw:['talk to','human','call you','phone','whatsapp','speak to','contact'] },
    { id:'care',     strong:1, kw:['knock','knocking','oil','oiling','maintain','look after','crack','last long','durability'] },
    { id:'size',     kw:['size','height','how tall','inches','how heavy','what weight','which weight','short handle'] },
    { id:'pick',     kw:['which bat','recommend','suggest','best bat','help me pick','choose','confused','what should i buy','which one'] },
    { id:'ball',     kw:['soft tennis','medium tennis','hard ball','leather','wind ball','which ball'] },
    { id:'hi',       kw:['hi','hello','hey','vanakkam','good morning','good evening'] },
    { id:'price',    kw:['price','cost','cheap','budget','how much','rate','affordable'] }
  ];

  function detect(t, strongOnly) {
    const s = ' ' + t.toLowerCase().replace(/[^\w\s₹]/g, ' ') + ' ';
    let best = null, bestScore = 0;
    INTENTS.forEach(it => {
      if (strongOnly && !it.strong) return;
      let sc = 0;
      it.kw.forEach(k => { if (s.includes(' ' + k) || s.includes(k)) sc += k.split(' ').length; });
      if (sc > bestScore) { bestScore = sc; best = it.id; }
    });
    return bestScore ? best : null;
  }

  /* ---------- reading a question against the real catalogue ---------- */
  function constraints(t) {
    const s = t.toLowerCase();
    const c = {};
    const money = s.match(/(?:under|below|within|less than|upto|up to|max)?\s*₹?\s*(\d{3,5})/);
    if (money) c.budget = +money[1];
    if (/\bsoft\b/.test(s)) c.ball = 'soft';
    if (/\bmedium\b|\bheavy tennis\b/.test(s)) c.ball = 'medium';
    if (/scoop/.test(s)) c.profile = 'scoop';
    if (/flat/.test(s)) c.profile = 'flat';
    if (/big edge|thick edge/.test(s)) c.profile = 'bigedge';
    if (/mongoose/.test(s)) c.profile = 'mongoose';
    if (/double|triple|multi/.test(s)) c.profile = 'multi';
    if (/kashmir/.test(s)) c.wood = 'kashmir';
    if (/poplar/.test(s)) c.wood = 'poplar';
    if (/sri ?lankan|srilankan|lankan/.test(s)) c.wood = 'srilankan';
    if (/\blight\b|light ?weight|fast pickup/.test(s)) c.light = true;
    if (/\bheavy\b|power|slog|six/.test(s)) c.power = true;
    return c;
  }

  function recommend(c, n) {
    let list = PRODUCTS.filter(p => p.price);
    if (c.budget)  list = list.filter(p => p.price <= c.budget + 50);
    if (c.profile) list = list.filter(p => p.profile === c.profile);
    if (c.wood)    list = list.filter(p => p.wood === c.wood);
    if (c.ball)    list = list.filter(p => (p.ball || []).includes(c.ball));
    if (!list.length) return [];
    list = list.slice().sort((a, b) => {
      let sa = a.popularity || 0, sb = b.popularity || 0;
      if (c.light) { sa -= (a.weight ? a.weight[0] : 800) / 40; sb -= (b.weight ? b.weight[0] : 800) / 40; }
      if (c.power) { sa += (a.weight ? a.weight[1] : 800) / 40; sb += (b.weight ? b.weight[1] : 800) / 40; }
      return sb - sa;
    });
    return list.slice(0, n || 3);
  }

  /* ---------- answers ---------- */
  function answer(id, text) {
    const c = constraints(text || '');

    if (id === 'pick' || id === 'price' || (id === 'ball' && Object.keys(c).length)) {
      const hits = recommend(c, 3);
      if (!hits.length) {
        return { say: "Nothing in the rack matches that exactly. Widen the budget a touch, or let me put you on to the team.",
                 chips: ['Show me everything', 'Talk to a human'] };
      }
      const bits = [];
      if (c.budget) bits.push('under ' + fmt(c.budget));
      if (c.ball) bits.push(c.ball + ' tennis ball');
      if (c.profile) bits.push(c.profile);
      if (c.wood) bits.push(c.wood.replace('srilankan', 'Sri Lankan'));
      return {
        say: pick(ACK) + (bits.length ? ' For ' + bits.join(', ') + " — here's what I'd back:" : " Here's what I'd back:"),
        products: hits,
        chips: ['Which weight suits me?', 'How do I look after it?', 'Talk to a human']
      };
    }

    if (id === 'size') return {
      say: "Height first: 34–35 inches for most adults, 35–36 if you're tall or play a lot of front foot.\n\nWeight is the real decision — 650–750g swings fast and suits timing, 780–900g hits harder but tires you out. If you're unsure, go lighter; bat speed beats mass in tennis ball cricket.",
      chips: ['Show me light bats', 'Show me power bats', 'Talk to a human'] };

    if (id === 'care') return {
      say: "Tennis ball bats need far less fuss than leather ones — no heavy knocking-in required.\n\nKeep it dry, don't leave it in the boot of a car, and don't use it on a wet ground. Toe guard and threading take most of the punishment. If the toe frays, tape it early and it'll last seasons.",
      chips: ['Which bats are most durable?', 'Warranty?', 'Talk to a human'] };

    if (id === 'ship') return {
      say: "We ship right across India. Free over " + fmt(FREE_SHIP_OVER) + ", otherwise " + fmt(SHIP_FEE) + ".\n\nMost orders leave our unit in 1–2 days and land in 3–6 depending on where you are. Chennai and Bangalore are usually quickest.",
      chips: ['Track my order', 'What payment methods?', 'Talk to a human'] };

    if (id === 'order') return {
      say: "I can't see order records from here — that one needs the team. Send your order number on WhatsApp and they'll check it straight away.",
      chips: ['Talk to a human'] , push: true };

    if (id === 'bulk') return {
      say: "Team and club orders are our favourite kind. Custom weights, your name or club on the stickers, and the price comes down properly at quantity.\n\nTell the team how many and what ball you play with and they'll quote you.",
      chips: ['Talk to a human'], push: true };

    if (id === 'custom') return {
      say: "Plenty is customisable — scoop design plain, burnt or painted, your choice of colour, custom weight and height, name stickers.\n\nThe Customized Scoop and CS PRO are built for exactly this. Send the team what you have in mind.",
      products: recommend({ profile: 'scoop' }, 2),
      chips: ['Talk to a human'] };

    if (id === 'warranty') return {
      say: "Toss Power X carries a 3 month assured warranty. The rest are covered against manufacturing defects — wood splitting on its own, handle coming loose, that sort of thing.\n\nNormal wear from playing, or damage from a wet ground or the wrong ball, isn't covered. Fair enough, I think.",
      chips: ['Show me Power X', 'Talk to a human'] };

    if (id === 'pay') return {
      say: "UPI, cards and net banking online, or just order on WhatsApp and pay however suits you.\n\nEverything's inclusive of taxes — the price on the bat is the price you pay.",
      chips: ['Shipping?', 'Talk to a human'] };

    if (id === 'game') return {
      say: "Ah, you've found Gully Cricket. Three overs, three wickets, pick your lane and time the swing.\n\nScore 30 and a discount code reveals itself. Score 50 and a bigger one does. They work at checkout, properly — not a gimmick.",
      chips: ['Take me to the game', 'Help me pick a bat'] };

    if (id === 'human') return { say: "Right — putting you on to the team now.", push: true, chips: [] };

    if (id === 'hi') return { say: pick(OPENERS), chips: defaultChips() };

    return null;
  }

  function defaultChips() {
    return ['Help me pick a bat', 'Which weight suits me?', 'Shipping & delivery', 'Bulk / custom order'];
  }

  /* ---------- context: open differently depending on the page ---------- */
  function contextOpening() {
    const h = location.hash || '#/';
    ctxBat = null;
    if (h.startsWith('#/product/')) {
      const p = byId(h.split('/')[2]);
      if (p) {
        ctxBat = p;
        return { say: "Looking at the " + p.name + "? Good bat. Ask me anything about it — weight, ball type, whether it suits how you play.",
                 chips: ['Is this right for me?', 'What weight should I take?', 'Shipping & delivery'] };
      }
    }
    if (h.startsWith('#/checkout')) return {
      say: "Nearly there. Anything holding you up — shipping, payment, a discount code?",
      chips: ['Shipping & delivery', 'What payment methods?', 'Talk to a human'] };
    if (h.startsWith('#/game')) return {
      say: "Playing for a discount, are we? Score 30 to unlock the first code, 50 for the bigger one.",
      chips: ['How do the codes work?', 'Help me pick a bat'] };
    if (h.startsWith('#/shop')) return {
      say: "29 bats in the rack. Tell me your ball and your budget and I'll shortlist properly — try \"scoop under 2000 for medium tennis\".",
      chips: defaultChips() };
    return { say: pick(OPENERS), chips: defaultChips() };
  }

  /* this-bat questions on a product page. Non-bat products (rare balls
     and the like) have no weight/height spec, so the bat script would
     answer nonsense — hand those to the humans instead. */
  function aboutCtxBat(t) {
    if (!ctxBat) return null;
    if (!ctxBat.weight) {
      const s = t.toLowerCase();
      if (/right for me|suit|good for me|should i|weight|heavy|light|alternative|similar|compare/.test(s)) {
        return { say: "For " + ctxBat.name + " the team can tell you more than I can — it's a collector's item, not a spec sheet.",
          chips: ['Talk to a human'] };
      }
      return null;
    }
    const s = t.toLowerCase();
    if (/right for me|suit|good for me|should i/.test(s)) {
      return { say: ctxBat.name + " is built for " + (ctxBat.ball || []).join(' and ') + " tennis ball, "
        + ctxBat.weight[0] + "–" + ctxBat.weight[1] + "g, " + ctxBat.height[0] + "–" + ctxBat.height[1] + " inches. "
        + (ctxBat.tagline || '') + "\n\nIf that matches your ball and you're comfortable at that weight, it's a yes from me.",
        chips: ['What weight should I take?', 'Show me alternatives', 'Talk to a human'] };
    }
    if (/weight|heavy|light/.test(s)) {
      return { say: "This one runs " + ctxBat.weight[0] + "–" + ctxBat.weight[1] + "g. Ask for the lighter end if you play square of the wicket and rely on timing; the heavier end if you're looking to clear the rope.",
        chips: ['Is this right for me?', 'Talk to a human'] };
    }
    if (/alternative|similar|other|compare/.test(s)) {
      return { say: "Same sort of bat, different flavours:",
        products: PRODUCTS.filter(p => p.id !== ctxBat.id && p.profile === ctxBat.profile && p.price).slice(0, 3),
        chips: ['Talk to a human'] };
    }
    return null;
  }

  /* ---------- rendering ---------- */
  function bubble(who, html) {
    const d = document.createElement('div');
    d.className = 'bot-msg ' + who;
    d.innerHTML = html;
    list.appendChild(d);
    list.scrollTop = list.scrollHeight;
    return d;
  }

  function productCards(items) {
    return `<div class="bot-cards">${items.map(p => `
      <a class="bot-card" href="#/product/${p.id}">
        <div class="bot-card-art">${batSVG(p)}</div>
        <div class="bot-card-t">${esc(p.name)}</div>
        <div class="bot-card-p">${p.price ? fmt(p.price) : 'On request'}</div>
      </a>`).join('')}</div>`;
  }

  function chips(items) {
    chipRow.innerHTML = (items || []).map(c => `<button class="bot-chip">${esc(c)}</button>`).join('');
    [...chipRow.children].forEach(b => b.onclick = () => send(b.textContent));
  }

  function say(res) {
    const typing = bubble('bot typing', '<i></i><i></i><i></i>');
    setTimeout(() => {
      typing.remove();
      let html = esc(res.say).replace(/\n/g, '<br>');
      if (res.products && res.products.length) html += productCards(res.products);
      bubble('bot', html);
      thread.push('Toss: ' + res.say);
      chips(res.chips && res.chips.length ? res.chips : defaultChips());
      if (res.push) escalate();
    }, 420 + Math.random() * 260);
  }

  function escalate() {
    const recent = thread.slice(-6).join('\n');
    const msg = 'Hi Toss Sports 👋\n\nI was chatting on your site:\n\n' + recent + '\n\nCan you help?';
    const a = document.createElement('a');
    a.className = 'bot-wa';
    a.href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
    a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = (typeof ICON !== 'undefined' ? ICON.whatsapp : '') + ' Continue on WhatsApp';
    list.appendChild(a);
    list.scrollTop = list.scrollHeight;
  }

  function send(text) {
    text = (text || '').trim();
    if (!text) return;
    bubble('me', esc(text));
    thread.push('Me: ' + text);
    input.value = '';
    chips([]);

    if (/take me to the game|the game/i.test(text)) { location.hash = '#/game'; }
    if (/show me everything|all bats/i.test(text))  { location.hash = '#/shop'; }
    if (/show me power x/i.test(text))              { location.hash = '#/product/power-x'; }
    if (/light bats/i.test(text))  return say({ say: pick(ACK) + " Quickest pickup we make:", products: recommend({ light: true }, 3), chips: defaultChips() });
    if (/power bats|durable/i.test(text)) return say({ say: pick(ACK) + " Built to hit:", products: recommend({ power: true }, 3), chips: defaultChips() });

    const ctx = aboutCtxBat(text);
    if (ctx) return say(ctx);

    /* Priority order matters more than raw keyword scoring:
       1. a transactional or policy question always wins
       2. then anything naming a real bat attribute — "kashmir willow light
          pickup" is a shopping brief, not a request for generic size advice
       3. then general advice intents
       4. then give up gracefully */
    const strong = detect(text, true);
    if (strong) { const r = answer(strong, text); if (r) return say(r); }

    const c = constraints(text);
    if (c.wood || c.profile || c.ball || c.budget) {
      const hits = recommend(c, 3);
      if (hits.length) {
        const bits = [];
        if (c.budget) bits.push('under ' + fmt(c.budget));
        if (c.ball) bits.push(c.ball + ' tennis ball');
        if (c.profile) bits.push(c.profile);
        if (c.wood) bits.push(c.wood.replace('srilankan', 'Sri Lankan'));
        if (c.light) bits.push('light pickup');
        if (c.power) bits.push('power');
        return say({ say: pick(ACK) + ' For ' + bits.join(', ') + " — here's what I'd back:",
                     products: hits, chips: defaultChips() });
      }
    }

    const id = detect(text);
    const res = id && answer(id, text);
    if (res) return say(res);

    if (Object.keys(c).length) {
      const hits = recommend(c, 3);
      if (hits.length) return say({ say: pick(ACK) + " Going on that:", products: hits, chips: defaultChips() });
    }
    say({ say: "I didn't quite middle that one. Try asking about picking a bat, weight and size, shipping, or a bulk order — or I'll put you on to the team.",
          chips: defaultChips().concat('Talk to a human') });
  }

  /* ---------- shell ---------- */
  function toggle(force) {
    /* derive from the DOM rather than a private flag, so the two can never
       drift apart if anything else ever shows or hides the panel */
    open = force === undefined ? !panel.classList.contains('open') : force;
    panel.classList.toggle('open', open);
    document.querySelector('.bot-fab').classList.toggle('open', open);
    if (open) {
      if (!list.children.length) say(contextOpening());
      setTimeout(() => input.focus(), 260);
    }
  }

  function mount() {
    const fab = document.createElement('button');
    fab.className = 'bot-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Chat with Toss');
    /* A labelled pill, not a bare bubble — an unlabelled circle is only
       discovered by people who already know the convention. The icon is a
       speech bubble with a ball inside it; the text does the inviting. */
    fab.innerHTML =
      '<span class="bot-fab-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.35-.25-3.4-.7L3 21l1.7-5.1' +
      'A8.5 8.5 0 1 1 21 11.5z"/>' +
      '<circle cx="12" cy="11.5" r="3" fill="currentColor" stroke="none"/></svg></span>' +
      '<span class="bot-fab-t">Chat with us</span>' +
      '<span class="bot-fab-x">✕</span>';
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'bot-panel';
    panel.innerHTML = `
      <div class="bot-head">
        <div class="bot-av">🏏</div>
        <div>
          <b>Toss Dressing Room</b>
          <span>Usually replies instantly</span>
        </div>
        <button class="bot-close" aria-label="Close">✕</button>
      </div>
      <div class="bot-list"></div>
      <div class="bot-chips"></div>
      <form class="bot-input">
        <input type="text" placeholder="Ask anything — try “scoop under 2000”" autocomplete="off">
        <button type="submit" aria-label="Send">➤</button>
      </form>`;
    document.body.appendChild(panel);

    list = panel.querySelector('.bot-list');
    chipRow = panel.querySelector('.bot-chips');
    input = panel.querySelector('.bot-input input');

    fab.onclick = () => toggle();
    panel.querySelector('.bot-close').onclick = () => toggle(false);
    panel.querySelector('.bot-input').onsubmit = e => { e.preventDefault(); send(input.value); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });

    /* if they move to another page mid-chat, retune the suggestions */
    window.addEventListener('hashchange', () => {
      if (!open || !list.children.length) return;
      const c = contextOpening();
      chips(c.chips);
    });
  }

  return { mount, send, toggle };
})();
