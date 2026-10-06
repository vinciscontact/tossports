/* ============================================================
   TOSS SPORTS — CATALOG
   31 bats. Source: TOSS Bat Catalogue (client, September 2026).

   THE PRINTED CATALOGUE IS THE SOURCE OF TRUTH
   --------------------------------------------
   Every bat here is one entry in the catalogue, and the numbers
   match it exactly: same name, same weight band, same height,
   same price. A customer holding the PDF and a customer on the
   site must never see two different figures for the same bat.

   THREE BALL TYPES, NOT TWO
   -------------------------
   The catalogue's front page sorts the range by ball before
   anything else — "FIND YOUR BAT BY BALL TYPE" — because it is
   the one choice that cannot be fudged. A soft-tennis bat at 700g
   will not survive a hard ball, and a 1050g hard bat is unplayable
   against a soft one. So `hard` now exists alongside `soft` and
   `medium`, and every bat belongs to exactly one of them. That is
   a deliberate narrowing: the old catalogue let most bats claim
   both soft and medium, which made the filter nearly meaningless.

   LEVEL AND STYLE
   ---------------
   The catalogue markets by player rather than by timber, with two
   words per bat that the shop now uses too:

     level  beginner | serious | tournament
     style  attacker | classic | quick-hands   (a bat may suit two)

   These drive the shop's filter chips, the landing pages and the
   bat finder. They are the words on the printed page and the words
   the workshop already uses — the site should not invent a third
   dialect for the same idea.

   PRICE
   -----
   `price` is what the customer pays. `mrp` is null throughout: the
   catalogue quotes one figure per bat, so there is no higher "was"
   price to strike through. Inventing one to manufacture a discount
   would be a lie printed beside a real number.

   RATINGS
   -------
   `rating` and `reviews` are 0 because Toss has not collected any
   yet. The shop hides the stars entirely when the count is zero,
   rather than printing "0 ★ (0)" — or, worse, a number nobody
   earned. They fill in honestly once real reviews arrive.
   ============================================================ */

const WOOD = {
  srilankan: { key: 'srilankan', label: 'Sri Lankan Wood', short: 'Sri Lankan' },
  kashmir:   { key: 'kashmir',   label: 'Kashmir Willow',  short: 'Kashmir' },
  poplar:    { key: 'poplar',    label: 'Poplar Wood',     short: 'Poplar' }
};

const PROFILE = {
  standard: { key: 'standard', label: 'Standard',     blurb: 'Classic blade. Do-everything bat.' },
  scoop:    { key: 'scoop',    label: 'Scoop',        blurb: 'Wood removed from the back. Lighter pickup, faster swing.' },
  flat:     { key: 'flat',     label: 'Flat Bat',     blurb: 'Sword-flat face. Retro look, huge hitting area.' },
  bigedge:  { key: 'bigedge',  label: 'Big Edge',     blurb: 'Thick edges. Built to clear the rope.' },
  mongoose: { key: 'mongoose', label: 'Mongoose',     blurb: 'Short blade, long handle. Pure slog machine.' },
  multi:    { key: 'multi',    label: 'Double / Triple Blade', blurb: 'Laminated blades. Extra strength and punch.' }
};

/* The catalogue's two player words. Declaration order is the order the
   chips appear in on the shop and in the finder. */
const LEVEL = {
  beginner:   { key: 'beginner',   label: 'Beginner',   blurb: 'Your first proper bat' },
  serious:    { key: 'serious',    label: 'Serious',    blurb: 'You play every week and it shows' },
  tournament: { key: 'tournament', label: 'Tournament', blurb: 'Built for the weekend that counts' }
};

const STYLE = {
  attacker:      { key: 'attacker',    label: 'Attacker',    blurb: 'Bottom weight, low-mid sweet spot' },
  classic:       { key: 'classic',     label: 'Classic',     blurb: 'Even balance, mid sweet spot' },
  'quick-hands': { key: 'quick-hands', label: 'Quick Hands', blurb: 'Top-light, mid-high sweet spot' }
};

/* The catalogue's "YOUR BALL · YOUR STYLE · YOUR BAT" table: for each ball,
   what weight each style of player should be swinging. Printed on its cover
   and again at the head of each ball section, and it is how the catalogue
   expects a customer to choose — ball first, then style, then the bat.

   One conflict in the source: medium-ball Attacker reads 850–920g on the
   cover and 880–920g on the section page. The cover's figure is used,
   because it is the one that joins up with Classic's 800–850g; the other
   leaves an 850–880g gap no player falls into. */
const STYLE_BANDS = {
  soft:   { attacker: '780–820g',  classic: '730–800g',   'quick-hands': '650–730g' },
  medium: { attacker: '850–920g',  classic: '800–850g',   'quick-hands': '750–800g' },
  hard:   { attacker: '1050g+',    classic: '1000–1050g', 'quick-hands': '950–1000g' }
};

/* The four highlights printed on the catalogue's cards. "TOSS EXCLUSIVE"
   appears once, in the Hard Monster's description rather than as a pill; it
   is the same claim, so it files under Exclusive. */
const BADGE = {
  'best-seller': { key: 'best-seller', label: 'Best Seller', match: ['Best Seller'] },
  'must-try':    { key: 'must-try',    label: 'Must Try',    match: ['Must Try'] },
  'exclusive':   { key: 'exclusive',   label: 'Exclusive',   match: ['Exclusive', 'Toss Exclusive'] },
  'value':       { key: 'value',       label: 'Value',       match: ['Value'] }
};
const badgeKeys = p => Object.values(BADGE)
  .filter(b => (p.badges || []).some(x => b.match.includes(x))).map(b => b.key);

const PRODUCTS = [

  /* ============================================================
     01 — SOFT TENNIS  (65g – 70g ball)
     Fast, light, responsive. Street, gully and practice cricket.
     ============================================================ */
  {
    id: 'regular-srilankan',
    name: 'Regular Srilankan',
    tagline: 'The one everybody starts with',
    price: 950, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'], level: 'beginner', style: ['quick-hands'],
    weight: [650, 750], height: [34.5, 35.5],
    handle: 'Single wood handle', sweetSpot: 'Mid to high',
    finish: 'Raw bat', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Soft tennis ball cricket — street, gully and practice',
    features: [
      'Sri Lankan wood in a raw, unfinished build',
      'Light 650–750g pickup for quick hands',
      'Lightweight and easy to handle — ideal for beginners',
      'The most affordable Sri Lankan wood bat in the range'
    ]
  },
  {
    id: 'regular-upgraded',
    name: 'Regular Upgraded',
    tagline: 'Same easy bat, finished properly',
    price: 1300, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'], level: 'beginner', style: ['quick-hands'],
    weight: [650, 750], height: [34.5, 35],
    handle: 'Single wood handle', sweetSpot: 'Mid to high',
    finish: 'Finished', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 88, rating: 0, reviews: 0,
    badges: ['Best Seller'],
    usage: 'Soft tennis ball cricket',
    features: [
      'Upgraded look with better durability',
      'Sri Lankan wood, single piece',
      'Light 650–750g pickup for quick hands',
      'Beginner friendly at an affordable price'
    ]
  },
  {
    id: 'srilankan-prime',
    name: 'Srilankan Prime',
    tagline: 'Best value pick in the range',
    price: 1200, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'], level: 'beginner', style: ['classic'],
    weight: [650, 850], height: [35, 36],
    handle: 'Single wood handle', sweetSpot: 'Mid',
    finish: 'Raw bat', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 78, rating: 0, reviews: 0,
    badges: ['Value'],
    usage: 'Soft tennis ball cricket',
    features: [
      'Best value pick — better durability for the money',
      'Reliable performance at affordable pricing',
      'Even balance with a mid sweet spot',
      'Sri Lankan wood, raw finish'
    ]
  },
  {
    id: 'double-wood-pressed',
    name: 'Double Wood Pressed',
    tagline: 'Two blades pressed into one',
    price: 1650, mrp: null,
    wood: 'srilankan', profile: 'multi',
    ball: ['soft'], level: 'beginner', style: ['classic'],
    weight: [650, 850], height: [35, 36],
    handle: 'Single wood handle', sweetSpot: 'Mid',
    finish: 'Raw bat', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Soft tennis ball cricket',
    features: [
      'Double-wood pressed build for added strength and durability',
      'Noticeably tougher than a single-piece blade',
      'Even balance with a mid sweet spot',
      'Sri Lankan wood, raw finish'
    ]
  },
  {
    id: 'srilankan-pro',
    name: 'Srilankan PRO',
    tagline: 'Smooth varnish, easy to play',
    price: 1650, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'], level: 'serious', style: ['quick-hands', 'attacker'],
    weight: [650, 850], height: [35, 36],
    handle: 'Single wood handle', sweetSpot: 'Mid to high',
    finish: 'Smooth varnished', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Value'],
    usage: 'Soft tennis ball cricket, local tournaments',
    features: [
      'Smooth varnished finish with a balanced, easy-playing profile',
      'Varnish protects the blade against moisture',
      'Suits quick hands and attacking players alike',
      'Sri Lankan wood, single piece'
    ]
  },
  {
    id: 'alpha-bat',
    name: 'Alpha Bat',
    tagline: 'Flat face, solid and balanced',
    price: 1250, mrp: null,
    wood: 'kashmir', profile: 'flat',
    ball: ['soft'], level: 'serious', style: ['classic'],
    weight: [730, 900], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: false, edge: 'Standard',
    tier: 'entry', popularity: 88, rating: 0, reviews: 0,
    badges: ['Best Seller'],
    usage: 'Soft tennis ball cricket',
    features: [
      'Flat-profile Kashmir Willow bat',
      'Solid and balanced feel through the shot',
      'Full flat face gives a large hitting area',
      'Even balance with a mid sweet spot'
    ]
  },
  {
    id: 'alpha-bat-lite',
    name: 'Alpha Bat Lite',
    tagline: 'The affordable flat bat',
    price: 900, mrp: null,
    wood: 'poplar', profile: 'flat',
    ball: ['soft'], level: 'beginner', style: ['classic'],
    weight: [730, 900], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: false, edge: 'Standard',
    tier: 'entry', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Soft tennis ball cricket — street and practice',
    features: [
      'Affordable flat bat with an easy-to-handle profile',
      'Poplar wood keeps the price down',
      'Built for beginners still finding their shots',
      'Even balance with a mid sweet spot'
    ]
  },
  {
    id: 'customised-scoop-lite',
    name: 'Customised Scoop Lite',
    tagline: 'Scooped back, serious feel',
    price: 2150, mrp: null,
    wood: 'srilankan', profile: 'scoop',
    ball: ['soft'], level: 'serious', style: ['quick-hands', 'classic'],
    weight: [650, 750], height: [35, 36],
    handle: 'Single wood handle', sweetSpot: 'Mid to high',
    finish: 'Standard', spine: true, edge: 'Good edge',
    tier: 'mid', popularity: 88, rating: 0, reviews: 0,
    badges: ['Best Seller'],
    usage: 'Soft tennis ball cricket, street cricket, local matches',
    features: [
      'Scoop design for more balance with a serious playing feel',
      'Wood removed from the back holds the pickup at 650–750g',
      'Big hitting area for the weight',
      'Sri Lankan wood, single piece'
    ]
  },
  {
    id: 'mongoose-feather',
    name: 'Mongoose Feather',
    tagline: 'Short blade, long handle, no mercy',
    price: 1900, mrp: null,
    wood: 'srilankan', profile: 'mongoose',
    ball: ['soft'], level: 'serious', style: ['attacker'],
    weight: [650, 800], height: [35, 36],
    handle: 'Extended mongoose handle', sweetSpot: 'Low to mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 82, rating: 0, reviews: 0,
    badges: ['Exclusive'],
    usage: 'Soft tennis ball cricket, aggressive hitting',
    features: [
      'Mongoose profile for aggressive play',
      'Short blade and long handle for maximum bat speed',
      'Bottom weight with a low-mid sweet spot',
      'Sri Lankan wood, single piece'
    ]
  },
  {
    id: 'power-x-feather',
    name: 'Power X Feather',
    tagline: 'The lightest bat we make',
    price: 3000, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'], level: 'tournament', style: ['quick-hands'],
    weight: [650, 700], height: [35, 36],
    handle: 'Science-induced handle guard', sweetSpot: 'Mid to high',
    finish: 'Hand crafted', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Must Try'],
    usage: 'Tournament soft tennis ball cricket',
    features: [
      'Ultra-light tournament bat built for speed and quick shots',
      'The narrowest weight band in the range — 650–700g',
      'Top-light balance with a mid-high sweet spot',
      'Part of the Toss Power X tournament family'
    ]
  },
  {
    id: 'power-x-mercury',
    name: 'Power X Mercury',
    tagline: 'Fast hands, controlled power',
    price: 3000, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'], level: 'tournament', style: ['attacker'],
    weight: [700, 770], height: [35, 36],
    handle: 'Science-induced handle guard', sweetSpot: 'Low to mid',
    finish: 'Hand crafted', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Must Try'],
    usage: 'Tournament soft tennis ball cricket',
    features: [
      'Lightweight tournament bat designed for fast and controlled stroke play',
      'Bottom weight with a low-mid sweet spot',
      'Sits between the Feather and the Sixit in the Power X family',
      'Hand crafted Sri Lankan wood'
    ]
  },

  /* ============================================================
     02 — MEDIUM TENNIS  (75g – 85g ball)
     Balance meets power. Tournaments, turf and club cricket.
     ============================================================ */
  {
    id: 'ys-big-edge',
    name: 'YS Big Edge',
    tagline: 'Thick edges, balanced weight',
    price: 2300, mrp: null,
    wood: 'srilankan', profile: 'bigedge',
    ball: ['medium'], level: 'serious', style: ['classic'],
    weight: [700, 830], height: [34.5, 34.5],
    handle: 'Single wood handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Big edge',
    tier: 'premium', popularity: 82, rating: 0, reviews: 0,
    badges: ['Exclusive'],
    usage: 'Medium tennis ball cricket',
    features: [
      'Big-edge profile offering a powerful hitting area with balanced weight',
      'Thick edges without the weight penalty',
      'Even balance with a mid sweet spot',
      'Sri Lankan wood, single piece'
    ]
  },
  {
    id: 'cws',
    name: 'CWS',
    tagline: 'Hybrid build, tournament punch',
    price: 2200, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['medium'], level: 'tournament', style: ['attacker'],
    weight: [800, 900], height: [35, 36],
    handle: 'Hybrid Indian handle', sweetSpot: 'Low to mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Must Try'],
    usage: 'Medium tennis ball cricket, tournaments',
    features: [
      'Hybrid Indian handle with Sri Lankan albizia blade',
      'Combines strength with a powerful hitting profile',
      'Built to last a full tournament season',
      'Bottom weight with a low-mid sweet spot'
    ]
  },
  {
    id: 'power-x-sixit',
    name: 'Power X Sixit',
    tagline: 'Built for one thing — six',
    price: 3000, mrp: null,
    wood: 'srilankan', profile: 'bigedge',
    ball: ['medium'], level: 'tournament', style: ['attacker'],
    weight: [800, 850], height: [35, 36],
    handle: 'Science-induced handle guard', sweetSpot: 'Low to mid',
    finish: 'Hand crafted', spine: true, edge: 'Big edge',
    tier: 'premium', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Must Try'],
    usage: 'Tournament medium tennis ball cricket',
    features: [
      'Tournament-ready build designed for powerful six-hitting',
      'The heaviest bat in the Power X family',
      'Bottom weight with a low-mid sweet spot',
      'Hand crafted Sri Lankan wood'
    ]
  },
  {
    id: 'customized-scoop',
    name: 'Customized Scoop',
    tagline: 'Power, balance and looks',
    price: 2400, mrp: null,
    wood: 'srilankan', profile: 'scoop',
    ball: ['medium'], level: 'tournament', style: ['classic', 'attacker'],
    weight: [800, 900], height: [35, 36],
    handle: 'Hybrid Indian handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Good edge',
    tier: 'premium', popularity: 88, rating: 0, reviews: 0,
    badges: ['Best Seller'],
    usage: 'Medium tennis ball cricket, tournaments',
    features: [
      'Customized scoop profile offering power with improved balance and looks',
      'Hybrid handle construction for strength',
      'Suits classic and attacking players alike',
      'Sri Lankan wood'
    ]
  },
  {
    id: 'kerala-scoop',
    name: 'Kerala Scoop',
    tagline: 'Tournament-level scoop',
    price: 2250, mrp: null,
    wood: 'kashmir', profile: 'scoop',
    ball: ['medium'], level: 'tournament', style: ['classic'],
    weight: [770, 900], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 88, rating: 0, reviews: 0,
    badges: ['Best Seller'],
    usage: 'Tournament medium tennis ball cricket',
    features: [
      'Powerful Kerala scoop design built for tournament-level play',
      'Kashmir Willow blade',
      'Scooped back keeps the weight down for the size',
      'Even balance with a mid sweet spot'
    ]
  },
  {
    id: 'kerala-scoop-lite',
    name: 'Kerala Scoop Lite',
    tagline: 'The affordable Kerala scoop',
    price: 1800, mrp: null,
    wood: 'poplar', profile: 'scoop',
    ball: ['medium'], level: 'serious', style: ['classic'],
    weight: [770, 900], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Medium tennis ball cricket',
    features: [
      'Affordable Kerala scoop profile offering easy handling',
      'Lighter build than the full Kerala Scoop',
      'Poplar wood keeps the price down',
      'Even balance with a mid sweet spot'
    ]
  },
  {
    id: 'glossy-premium',
    name: 'Glossy Premium',
    tagline: 'Premium finish, medium-weight power',
    price: 2500, mrp: null,
    wood: 'kashmir', profile: 'standard',
    ball: ['medium'], level: 'tournament', style: ['classic', 'attacker'],
    weight: [800, 900], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Premium glossy', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Must Try'],
    usage: 'Tournament medium tennis ball cricket',
    features: [
      'Premium glossy finish with a powerful medium-weight profile',
      'Kashmir Willow blade',
      'Suits classic and attacking players alike',
      'Gloss coat protects against moisture'
    ]
  },
  {
    id: 'four-scoop',
    name: 'Four Scoop',
    tagline: 'Less weight, same hitting profile',
    price: 1850, mrp: null,
    wood: 'kashmir', profile: 'scoop',
    ball: ['medium'], level: 'serious', style: ['classic'],
    weight: [770, 900], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 78, rating: 0, reviews: 0,
    badges: ['Value'],
    usage: 'Medium tennis ball cricket',
    features: [
      'Scoop design reduces weight while maintaining a strong hitting profile',
      'Four-scoop back for a lighter pickup',
      'Kashmir Willow blade',
      'Even balance with a mid sweet spot'
    ]
  },
  {
    id: 'four-scoop-lite',
    name: 'Four Scoop Lite',
    tagline: 'Entry-level scoop',
    price: 1500, mrp: null,
    wood: 'poplar', profile: 'scoop',
    ball: ['medium'], level: 'beginner', style: ['classic'],
    weight: [770, 900], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Medium tennis ball cricket',
    features: [
      'Lightweight scoop profile offering easy handling',
      'Entry-level price for a medium-ball bat',
      'Poplar wood build',
      'Even balance with a mid sweet spot'
    ]
  },
  {
    id: 'mongoose-pro',
    name: 'Mongoose PRO',
    tagline: 'Strong handle, aggressive intent',
    price: 2200, mrp: null,
    wood: 'srilankan', profile: 'mongoose',
    ball: ['medium'], level: 'serious', style: ['attacker'],
    weight: [800, 900], height: [35, 36],
    handle: 'Extended mongoose handle', sweetSpot: 'Low to mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 82, rating: 0, reviews: 0,
    badges: ['Exclusive'],
    usage: 'Medium tennis ball cricket, aggressive hitting',
    features: [
      'Mongoose-style profile with a strong handle for aggressive play',
      'Short blade and long handle for bat speed',
      'Bottom weight with a low-mid sweet spot',
      'Sri Lankan wood, single piece'
    ]
  },

  /* ============================================================
     03 — HARD TENNIS + STUMPER  (95g – 130g ball)
     Built for impact. Hard tennis and rubber-ball cricket.
     ============================================================ */
  {
    id: 'hard-scoop',
    name: 'Hard Scoop',
    tagline: 'Hard-ball power at an accessible price',
    price: 1350, mrp: null,
    wood: 'poplar', profile: 'scoop',
    ball: ['hard'], level: 'beginner', style: ['quick-hands'],
    weight: [950, 1050], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid to high',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Hard tennis and stumper ball cricket',
    features: [
      'Solid hard-scoop profile offering power at an accessible price',
      'The cheapest way into hard-ball cricket',
      'Scooped back keeps the pickup manageable',
      'Poplar wood build'
    ]
  },
  {
    id: 'hard-scoop-plus',
    name: 'Hard Scoop PLUS',
    tagline: 'Heavier, stronger, more aggressive',
    price: 1550, mrp: null,
    wood: 'poplar', profile: 'scoop',
    ball: ['hard'], level: 'beginner', style: ['classic'],
    weight: [950, 1050], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Hard tennis and stumper ball cricket',
    features: [
      'Heavy hard-scoop bat designed for strong and aggressive play',
      'More blade behind the ball than the standard Hard Scoop',
      'Even balance with a mid sweet spot',
      'Poplar wood build'
    ]
  },
  {
    id: 'hard-scoop-pro',
    name: 'Hard Scoop PRO',
    tagline: 'Kashmir Willow, serious level',
    price: 1800, mrp: null,
    wood: 'kashmir', profile: 'scoop',
    ball: ['hard'], level: 'serious', style: ['classic'],
    weight: [950, 1050], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 70, rating: 0, reviews: 0,
    badges: [],
    usage: 'Hard tennis and stumper ball cricket',
    features: [
      'Strong Kashmir Willow scoop profile for serious players',
      'A step up in timber from the Poplar hard scoops',
      'Even balance with a mid sweet spot',
      'Built to take repeated hard-ball impact'
    ]
  },
  {
    id: 'hard-scoop-elite',
    name: 'Hard Scoop ELITE',
    tagline: 'Tournament-level hard-ball power',
    price: 2250, mrp: null,
    wood: 'kashmir', profile: 'scoop',
    ball: ['hard'], level: 'tournament', style: ['attacker', 'classic'],
    weight: [950, 1050], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Low to mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 88, rating: 0, reviews: 0,
    badges: ['Best Seller'],
    usage: 'Tournament hard tennis and stumper ball cricket',
    features: [
      'Kashmir Willow hard-scoop bat built for tournament-level power',
      'The top of the Hard Scoop line',
      'Suits attacking and classic players alike',
      'Scooped back keeps the swing quick for the weight'
    ]
  },
  {
    id: 'mri-srilankan',
    name: 'MRI Srilankan',
    tagline: 'Raw Sri Lankan, serious hitting',
    price: 1800, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['hard'], level: 'serious', style: ['classic'],
    weight: [950, 1050], height: [35, 36],
    handle: 'Single wood handle', sweetSpot: 'Mid',
    finish: 'Raw bat', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 88, rating: 0, reviews: 0,
    badges: ['Best Seller'],
    usage: 'Hard tennis and stumper ball cricket',
    features: [
      'Raw Sri Lankan hard bat designed for serious-level hitting',
      'No finish — all timber, nothing hidden',
      'Even balance with a mid sweet spot',
      'Dense Sri Lankan grain for hard-ball impact'
    ]
  },
  {
    id: 'glossy-premium-hard',
    name: 'Glossy Premium Hard',
    tagline: 'Heavy, glossy, tournament-ready',
    price: 2850, mrp: null,
    wood: 'kashmir', profile: 'standard',
    ball: ['hard'], level: 'tournament', style: ['classic', 'attacker'],
    weight: [950, 1050], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Premium glossy', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Must Try'],
    usage: 'Tournament hard tennis and stumper ball cricket',
    features: [
      'Premium glossy aesthetic finish with a heavy, powerful tournament profile',
      'Kashmir Willow blade',
      'Suits classic and attacking players alike',
      'Gloss coat protects against moisture'
    ]
  },
  {
    id: 'black-mamba',
    name: 'Black Mamba',
    tagline: 'Unmistakable, and it hits',
    price: 2300, mrp: null,
    wood: 'kashmir', profile: 'standard',
    ball: ['hard'], level: 'tournament', style: ['attacker'],
    weight: [950, 1100], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Low to mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Exclusive'],
    usage: 'Tournament hard tennis and stumper ball cricket',
    features: [
      'Unique Kashmir Willow bat built for powerful hard-hitting',
      'Bottom weight with a low-mid sweet spot',
      'Goes up to 1100g for maximum power transfer',
      'A Toss exclusive you will not find elsewhere'
    ]
  },
  {
    id: 'graphix-premium-hard',
    name: 'Graphix Premium Hard',
    tagline: 'The loudest bat in the unit',
    price: 4000, mrp: null,
    wood: 'kashmir', profile: 'standard',
    ball: ['hard'], level: 'tournament', style: ['classic', 'attacker'],
    weight: [950, 1100], height: [35, 36],
    handle: 'Standard handle', sweetSpot: 'Mid',
    finish: 'Graphic print, striking finish', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 82, rating: 0, reviews: 0,
    badges: ['Exclusive'],
    usage: 'Tournament hard tennis and stumper ball cricket',
    features: [
      'Premium high-end build with a crazy graphic aesthetic',
      'Striking finish — the most distinctive bat we make',
      'Kashmir Willow blade up to 1100g',
      'Suits classic and attacking players alike'
    ]
  },
  {
    id: 'srilankan-hard-monster',
    name: 'Srilankan Hard Monster (SHT)',
    tagline: 'Toss exclusive. Heavy duty.',
    price: 2350, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['hard'], level: 'tournament', style: ['attacker'],
    weight: [950, 1100], height: [35, 36],
    handle: 'Single wood handle', sweetSpot: 'Low to mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 94, rating: 0, reviews: 0,
    badges: ['Best Seller', 'Must Try', 'Toss Exclusive'],
    usage: 'Tournament hard tennis and stumper ball cricket',
    features: [
      'Toss exclusive heavy-duty hard tennis bat',
      'Built for aggressive tournament play',
      'Bottom weight with a low-mid sweet spot',
      'Goes up to 1100g of dense Sri Lankan wood'
    ]
  },
  {
    id: 'mongoose-core',
    name: 'Mongoose CORE',
    tagline: 'The lightest hard-ball bat we make',
    price: 2200, mrp: null,
    wood: 'kashmir', profile: 'mongoose',
    ball: ['hard'], level: 'serious', style: ['attacker'],
    weight: [850, 950], height: [35, 36],
    handle: 'Extended mongoose handle', sweetSpot: 'Low to mid',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 82, rating: 0, reviews: 0,
    badges: ['Exclusive'],
    usage: 'Hard tennis and stumper ball cricket, aggressive hitting',
    features: [
      'Mongoose-style profile with a strong handle for aggressive play',
      'At 850–950g the lightest bat in the hard-ball range',
      'Short blade and long handle for bat speed',
      'Kashmir Willow blade'
    ]
  }
];

/* ---------- derived helpers ---------- */
const BALL_LABEL = { soft: 'Soft Tennis', medium: 'Medium Tennis', hard: 'Hard Tennis' };
const BALL_NOTE  = {
  soft:   '65g – 70g ball',
  medium: '75g – 85g ball',
  hard:   '95g – 130g ball, including stumper and rubber'
};
const TIER_LABEL = { entry: 'Under ₹1500', mid: '₹1500 – ₹2200', premium: '₹2200+' };
const LEVEL_LABEL = { beginner: 'Beginner', serious: 'Serious', tournament: 'Tournament' };
const STYLE_LABEL = { attacker: 'Attacker', classic: 'Classic', 'quick-hands': 'Quick Hands' };

/* WHERE "LIGHT" SITS DEPENDS ENTIRELY ON THE BALL.
   A 950g bat is the lightest hard-tennis bat we make and heavier than
   every soft-tennis bat in the range. Judging weight on absolute grams
   is what would make the bat finder return nothing at all the moment
   somebody picked a hard ball and said they wanted something light —
   the two answers would contradict each other and the quiz would dead-end.

   So each ball type gets its own pair of split points, taken from the
   catalogue's own weight bands, and every weight judgement on the site
   runs through them. Compared against a bat's MIDPOINT weight, since
   that is where the model actually sits when you pick it up. */
const BALL_SPLIT = { soft: [730, 790], medium: [820, 845], hard: [950, 1010] };

function ballOf(p)     { return (p.ball && p.ball[0]) || 'soft'; }
function midWeight(p)  {
  const w = p.weight || [];
  return (w.length === 2 && w[0] != null && w[1] != null) ? (w[0] + w[1]) / 2 : null;
}

/* 'light' | 'medium' | 'heavy', relative to the bat's own ball type — or null
   for anything with no weight on it at all, which is a ball, a glove, or a
   half-finished bat somebody is still writing up in the Maze Room. Returning
   a band for those would put a cricket ball in the "Heavy bats" filter. */
function weightBand(p) {
  const m = midWeight(p);
  if (m === null) return null;
  const s = BALL_SPLIT[ballOf(p)] || BALL_SPLIT.soft;
  return m < s[0] ? 'light' : m < s[1] ? 'medium' : 'heavy';
}

function priceOf(p) { return p.price; }
function hasPrice(p) { return typeof p.price === 'number'; }
function fmt(n) { return '₹' + n.toLocaleString('en-IN'); }
function weightLabel(p) { return p.weight[0] + 'g – ' + p.weight[1] + 'g'; }
function heightLabel(p) {
  return p.height[0] === p.height[1] ? p.height[0] + '"' : p.height[0] + '" – ' + p.height[1] + '"';
}
