/* ============================================================
   TOSS SPORTS — PLAY STYLES FOR THE STATIC BUILD

   The shop filters bats by who they are for — attacker, defender,
   light, heavy — and this turns each of those into a real page a
   search engine can index. "#/shop?style=attacker" is one URL to
   a crawler; "/cricket-bats-for-attackers/" is a page.

   WHERE THE TAGS COME FROM
   ------------------------
   Two sources, in this order:

     1. seo/playstyle-tags.json, if it exists. That file is what
        the owner actually curated in the Maze Room, pulled down
        by `node seo/fetch-playstyles.js`. It wins, because a
        person looked at those bats.

     2. tagsFor() below, otherwise. A mirror of the rules in
        sql/017-playstyles.sql, so a build on a machine with no
        database access still produces the same pages the
        migration would have seeded.

   The duplication between this file and 017 is deliberate and
   worth naming: the database cannot be reached from a static
   build, and a build that silently produced EMPTY style pages
   would be worse than one that recomputes. If you change the
   rules in one place, change them in the other — the counts in
   the header comment of 017 are the check.
   ============================================================ */

const fs = require('fs');
const path = require('path');

/* ---------- the rules, mirroring sql/017-playstyles.sql ---------- */
function tagsFor(p) {
  const profile = String(p.profile || '').toLowerCase();
  const edge    = String(p.edge || '').toLowerCase();
  const feats   = JSON.stringify(p.features || []).toLowerCase();
  const t = [];

  if (['bigedge', 'multi', 'mongoose'].indexOf(profile) > -1 ||
      /thick|big|massive/.test(edge)) t.push('attacker');
  if (['standard', 'scoop', 'flat'].indexOf(profile) > -1 &&
      !/massive/.test(edge)) t.push('all-rounder');
  if (profile === 'standard' &&
      ['standard', 'sleek edge', 'good edge'].indexOf(edge) > -1) t.push('defender');
  if (p.tier === 'entry' || /beginner/.test(feats)) t.push('beginner');

  /* Midpoint, not the ends of the range: every bat's range overlaps
     720–870g, so an overlap rule tags all 29 "medium" and the page
     becomes a duplicate of the full catalogue. */
  if (Array.isArray(p.weight) && p.weight.length === 2) {
    const mid = (p.weight[0] + p.weight[1]) / 2;
    t.push(mid < 760 ? 'light' : (mid < 840 ? 'medium' : 'heavy'));
  }
  return t;
}

/**
 * Returns { tags, note } — tags is { productId: [styleId, …] } for the whole
 * catalogue, note says which source it came from. The caller prints the note
 * rather than this doing it, so it lands with the other build counts instead
 * of above the banner; "why is the attacker page showing the wrong bats" is
 * otherwise a genuinely hard question to answer six months from now.
 */
function loadTags(products) {
  const file = path.join(__dirname, 'playstyle-tags.json');
  let bad = null;
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && raw.tags && Object.keys(raw.tags).length) {
        return { tags: raw.tags, note: 'curated in the Maze Room, pulled ' +
          (raw.fetched_at || 'previously') };
      }
    } catch (e) {
      bad = path.basename(file) + ' is unreadable (' + e.message + ')';
    }
  }
  const out = {};
  products.forEach(p => { out[p.id] = tagsFor(p); });
  return { tags: out, note: (bad ? bad + ' — ' : '') +
    'derived from specs; run `node seo/fetch-playstyles.js` to use what the Maze Room holds' };
}

/* ============================================================
   THE PAGES

   One per style, in the same shape every other cluster uses, so
   build-seo.js needs no special case. `styleId` is what links a
   page back to the tag; the slug is written for a searcher, not
   for the database.
   ============================================================ */
const PLAYSTYLE_CLUSTERS = {
  'cricket-bats-for-attackers': {
    styleId: 'attacker',
    head: 'cricket bat for power hitting',
    also: ['big edge tennis ball bat', 'bat for six hitting', 'power hitting cricket bat',
           'attacking cricket bat', 'best bat for hitting sixes'],
    title: 'Cricket Bats for Attackers — Big Edge & Power',
    h1: 'Bats for players who go after the bowling',
    desc: 'Tennis ball cricket bats built for power hitting — thick edges, laminated blades and mongoose profiles, shaped by hand in Chennai. Cut to your weight, from ₹950.',
    intro: 'If your first thought when the ball is short is the boundary rather than the single, this is the shelf. Thick edges give you more bat to hit with, laminated double and triple blades push more mass behind the ball, and a mongoose profile shortens the blade so the swing comes through faster. Every one is cut to the weight you ask for.',
    sections: [
      ['What makes a bat an attacking bat',
       'Three things, and none of them is the sticker. Edge thickness decides how much of a mishit still carries. Where the weight sits decides whether the bat comes through the line or has to be dragged. And the pressing decides whether the face survives a season of it. A bat that hits hard and cracks in a month is not a power bat, it is a soft one with a big edge.'],
      ['Do you need a heavy bat to hit hard',
       'No, and this is where most players go wrong. Bat speed matters more than bat weight for a tennis ball — a 750g bat you can swing through the line beats an 880g bat that arrives late every time. Pick the heaviest bat you can still swing properly, not the heaviest bat you can lift.']
    ]
  },

  'all-rounder-cricket-bats': {
    styleId: 'all-rounder',
    head: 'all round cricket bat',
    also: ['balanced cricket bat', 'all rounder tennis ball bat', 'versatile cricket bat',
           'good all round tennis cricket bat'],
    title: 'All-Rounder Cricket Bats — Balanced Pickup',
    h1: 'Bats for players who do a bit of everything',
    desc: 'Balanced tennis ball cricket bats for players who rotate strike and take on the bad ball. Standard and scoop profiles, handmade in Chennai from ₹950.',
    intro: 'Most cricket is not sixes. It is working the ball into gaps, running hard, and putting away the one that is there to be hit. These are the balanced shapes — the classic blade and the scoop — where the weight sits in the middle and the bat does not commit you to one kind of shot before you have played it.',
    sections: [
      ['Standard blade or scoop',
       'A standard blade is the do-everything shape: predictable pickup, sweet spot where you expect it, nothing to learn. A scoop has wood removed from the back, so for the same finished weight it swings faster and picks up lighter. If you are choosing blind, take the standard; if you already know you are late on the quick ones, take the scoop.']
    ]
  },

  'cricket-bats-for-defenders': {
    styleId: 'defender',
    head: 'cricket bat for control',
    also: ['bat for defensive batting', 'controlled cricket bat', 'cricket bat good control',
           'classic blade cricket bat'],
    title: 'Cricket Bats for Control and Timing',
    h1: 'Bats for players who bat time',
    desc: 'Classic-blade tennis ball cricket bats built for control rather than brute power — even pickup, honest edges, made by hand in Chennai from ₹950.',
    intro: 'Somebody has to still be there in the last over. These are the controlled bats: a classic blade, an ordinary edge, weight spread evenly so the face comes down straight and stays there. Nothing exaggerated, because an exaggerated bat is a bat that plays one shot well and the rest badly.',
    sections: [
      ['Why an ordinary edge is a feature',
       'A thick edge adds mass at the outside of the blade, and that mass has to be swung. For a player whose scoring comes from placement and timing rather than force, it is weight in the wrong place — it slows the bat down through the line and makes the pickup top-heavy. An honest edge on a well-pressed blade is the more useful bat.']
    ]
  },

  'beginner-cricket-bats': {
    styleId: 'beginner',
    head: 'beginner cricket bat',
    also: ['first cricket bat', 'cricket bat for starters', 'cheap beginner tennis ball bat',
           'best cricket bat for beginners India', 'starter cricket bat'],
    title: 'Beginner Cricket Bats from ₹950',
    h1: 'Your first proper cricket bat',
    desc: 'Forgiving, affordable tennis ball cricket bats for players just starting — real wood, cut to your weight, made in our own Chennai workshop from ₹950.',
    intro: 'A first bat should be forgiving and it should be real wood. Most cheap "full size" bats sold online are moulded plastic — they cannot be cut to your weight, cannot be repaired, and will not survive a season. These are entry-priced bats from the same unit and the same wood as everything else we make, just simpler in the finish.',
    sections: [
      ['What to spend on a first bat',
       'Between ₹950 and ₹1,500 buys a real wooden bat that lasts. Below that you are buying plastic. Above it you are paying for finish, pressing and profile work that a player still learning where the middle is will not feel yet — spend it on the second bat instead, once you know how you actually bat.'],
      ['Getting the size right',
       'Weight matters more than length for a tennis ball. A bat you can swing through the line teaches you to time the ball; a bat that is too heavy teaches you to drag it. We cut to the weight you ask for, so tell us the player\'s height and age and we will suggest a range.']
    ]
  },

  'lightweight-cricket-bats': {
    styleId: 'light',
    head: 'lightweight cricket bat',
    also: ['light cricket bat', 'light tennis ball bat', 'light weight cricket bat online',
           'cricket bat under 750 grams', 'fast pickup cricket bat'],
    title: 'Lightweight Cricket Bats — Fast Pickup',
    h1: 'Light bats, for players with fast hands',
    desc: 'Lightweight tennis ball cricket bats that pick up quick and swing faster — scoop and standard profiles cut light in our Chennai workshop, from ₹950.',
    intro: 'These are the models that sit light in the hand. A lighter bat gets through the line sooner, which matters against anything quick and matters even more on a wet ball that skids. Because every bat here is cut to order, "light" is where the model naturally sits — tell us the weight you want and we will shape to it.',
    sections: [
      ['How light is light',
       'For tennis ball cricket, under about 750g is light, 750–850g is where most players end up, and above that is heavy. The models on this page centre below 760g. That is the model\'s natural home, not a hard limit — most can be cut a little either side.'],
      ['Light does not mean weak',
       'Weight and strength are different things. A scoop removes wood from the back of the blade, away from the hitting area, so the bat loses weight without losing the part that meets the ball. The pressing is the same as every other bat we make.']
    ]
  },

  'medium-weight-cricket-bats': {
    styleId: 'medium',
    head: 'medium weight cricket bat',
    also: ['800 gram cricket bat', 'standard weight tennis ball bat',
           'medium pickup cricket bat', 'balanced weight cricket bat'],
    title: 'Medium Weight Cricket Bats — 760–840g',
    h1: 'Medium-weight bats, where most players end up',
    desc: 'Medium-weight tennis ball cricket bats — the 760–840g range most club and gully players settle on. Handmade in Chennai and cut to your weight, from ₹950.',
    intro: 'If you have no strong feeling about weight, you want one of these. The middle of the range is where most players finish after trying both ends: enough mass to send the ball when you middle it, light enough that you are not late on the quick one. Every bat here is still cut to the weight you ask for.',
    sections: [
      ['Why the middle is the default',
       'It is the range that punishes you least for being slightly wrong. A very light bat needs you to supply the power; a very heavy one needs you to be early. The middle forgives both, which is why it is where players land once they stop guessing and start noticing.']
    ]
  },

  'heavy-cricket-bats': {
    styleId: 'heavy',
    head: 'heavy cricket bat',
    also: ['heavy tennis ball bat', 'heavy weight cricket bat', '900 gram cricket bat',
           'heavy bat for power', 'thick heavy cricket bat'],
    title: 'Heavy Cricket Bats — Maximum Power',
    h1: 'Heavy bats, for power through the ball',
    desc: 'Heavy tennis ball cricket bats for players who want mass behind the shot — flat bats, laminated blades and thick edges, made in Chennai and cut to weight.',
    intro: 'More mass behind the ball, provided you can still swing it on time. These are the models that centre above 840g — flat bats with a huge hitting area, laminated double and triple blades, and thick-edged profiles. They reward a player who is early and punish one who is not.',
    sections: [
      ['Be honest about whether you can swing it',
       'A heavy bat only hits harder if it arrives on time. The commonest mistake in gully cricket is buying the heaviest bat in the shop and then playing every shot half a beat late — which produces less power than a lighter bat played properly, not more. Pick the heaviest bat you can still bring through the line comfortably, and no heavier.'],
      ['Where the weight comes from',
       'On a flat bat it is the face — no spine, a wide even blade, and a very large hitting area. On a double or triple blade it is lamination, which adds mass and stiffness together. Both are cut to order, so the number you ask for is the number you get.']
    ]
  }
};

/**
 * Turn the definitions above into clusters build-seo.js can use directly,
 * by giving each one a `filter` closed over the tag map.
 */
function playstyleClusters(tags) {
  const out = {};
  Object.keys(PLAYSTYLE_CLUSTERS).forEach(slug => {
    const c = PLAYSTYLE_CLUSTERS[slug];
    out[slug] = Object.assign({}, c, {
      filter: function (p) {
        return (tags[p.id] || []).indexOf(c.styleId) > -1;
      }
    });
  });
  return out;
}

module.exports = { tagsFor, loadTags, PLAYSTYLE_CLUSTERS, playstyleClusters };
