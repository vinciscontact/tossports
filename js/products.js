/* ============================================================
   TOSS SPORTS — CATALOG
   29 unique SKUs. Source: client product sheet.
   price: null  => "Price on request" (WhatsApp enquiry flow)
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

const PRODUCTS = [
  /* ---------- ENTRY / SRI LANKAN ---------- */
  {
    id: 'regular-bat',
    name: 'Regular Bat',
    tagline: 'The one everybody starts with',
    price: 950, mrp: 1200,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'],
    weight: [550, 850], height: [34, 34.5],
    handle: 'Single wood handle', sweetSpot: 'Mid to low',
    finish: 'Raw bat', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 78, rating: 4.2, reviews: 214,
    badges: ['Budget Pick'],
    usage: 'Street cricket, village tournaments, turf',
    features: [
      'Sri Lankan wood, single piece',
      'Strong and durable for soft tennis ball',
      'Beginner friendly — nothing to learn, just swing',
      'Most affordable bat in the Toss range'
    ]
  },
  {
    id: 'regular-premium',
    name: 'Regular Premium',
    tagline: 'Same bat, finished properly',
    price: 1300, mrp: 1600,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'],
    weight: [600, 800], height: [34, 34.5],
    handle: 'Single wood handle', sweetSpot: 'Mid to low',
    finish: 'Glossy coated, fully furnished', spine: true, edge: 'Standard',
    toeGuard: true,
    tier: 'entry', popularity: 74, rating: 4.4, reviews: 168,
    badges: ['Best Value'],
    usage: 'Soft tennis ball cricket',
    features: [
      'Glassy coated and fully furnished',
      'Comes with threading, power striker and toe guard',
      'Single piece Sri Lankan wood',
      'Beginner friendly at an affordable price'
    ]
  },
  {
    id: 'varnished-bat',
    name: 'Varnished Bat',
    tagline: 'Best seller. Sleek edge, big ping.',
    price: null, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft', 'medium'],
    weight: [650, 900], height: [35, 36],
    handle: 'Single wood handle', sweetSpot: 'Large, mid to low',
    finish: 'Fully varnished, glossy', spine: true, edge: 'Sleek edge',
    tier: 'entry', popularity: 88, rating: 4.6, reviews: 302,
    badges: ['Best Seller'],
    usage: 'Tennis ball cricket, tournaments',
    features: [
      'Good grade Sri Lankan wood',
      'Sleek edge for faster play',
      'Lightweight, well-balanced design',
      'Fully varnished for moisture protection',
      'Powerful ping with a large sweet spot'
    ]
  },
  {
    id: 'csl-scoop',
    name: 'CSL Customized Scoop',
    tagline: "Chennai's favourite",
    price: null, mrp: null,
    wood: 'srilankan', profile: 'scoop',
    ball: ['soft', 'medium'],
    weight: [650, 800], height: [34, 35.5],
    handle: 'Single wood handle', sweetSpot: 'Mid to low',
    finish: 'Plain / Burnt / Painted (your choice)', spine: true, edge: 'Good edge',
    customizable: true,
    tier: 'mid', popularity: 84, rating: 4.5, reviews: 191,
    badges: ["Chennai's Favourite", 'Customizable'],
    usage: 'Tennis ball cricket, street cricket, tournament matches',
    features: [
      'Customized scoop design — plain, burnt or painted',
      'Big hitting area with lightweight pickup',
      'Overall balance thanks to the scoop',
      'Height customizable 34 – 35.5 inches',
      'Better balance, power hitting and fast swing'
    ]
  },
  {
    id: 'jhl',
    name: 'JHL Joint Handle',
    tagline: 'Raw look, serious rebound',
    price: null, mrp: null,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft'],
    weight: [700, 850], height: [35, 36],
    handle: 'Joint handle', sweetSpot: 'Mid to low',
    finish: 'Raw bat with stickers', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 66, rating: 4.3, reviews: 97,
    usage: 'Soft tennis ball cricket',
    features: [
      'Sri Lankan wood with an appealing spine',
      'Joint handle construction',
      'Excellent rebound and power transfer',
      'Raw finish with Toss stickers'
    ]
  },
  {
    id: 'mongoose-style',
    name: 'Mongoose Style',
    tagline: 'T20 batting, bottled',
    price: null, mrp: null,
    wood: 'srilankan', profile: 'mongoose',
    ball: ['soft', 'medium'],
    weight: [650, 850], height: [34, 36],
    handle: 'Single wood, extended handle', sweetSpot: 'Higher and larger',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 71, rating: 4.3, reviews: 88,
    usage: 'Local matches, aggressive hitting',
    features: [
      'Single-piece Sri Lankan wood',
      'Short blade with extended handle',
      'Higher and larger sweet spot for slog play',
      'Built for aggressive, T20-style batting'
    ]
  },

  /* ---------- KASHMIR WILLOW / POPLAR ---------- */
  {
    id: 'kw-full-scoop',
    name: 'Kashmir Willow Full Scoop',
    tagline: 'A+ willow, full scooped back',
    price: 1800, mrp: 2200,
    wood: 'kashmir', profile: 'scoop',
    ball: ['soft', 'medium'],
    weight: [750, 900], height: [34.5, 36],
    handle: 'Cane handle with rubber grip', sweetSpot: 'Mid to low-middle',
    finish: 'Polished', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 80, rating: 4.5, reviews: 143,
    badges: ['A+ Grade'],
    usage: 'Street cricket, tennis-ball tournaments',
    features: [
      'A+ grade Kashmir Willow, single blade',
      'Full scoop at the back for lighter pickup',
      'Faster bat swing and easier lofted shots',
      'Short handle (SH) full size',
      'Durable build for regular play'
    ]
  },
  {
    id: 'poplar-full-scoop',
    name: 'Poplar Full Scoop',
    tagline: 'Full scoop feel, half the price',
    price: 1500, mrp: 1800,
    wood: 'poplar', profile: 'scoop',
    ball: ['soft', 'medium'],
    weight: [750, 900], height: [34, 36],
    handle: 'Normal handle', sweetSpot: 'Mid to low',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 69, rating: 4.1, reviews: 112,
    usage: 'Recreational play, soft and medium tennis ball',
    features: [
      'Poplar wood, single blade, full scoop back',
      'Lightweight and easy to swing',
      'Good for beginners and casual players',
      'More affordable than Kashmir Willow'
    ]
  },
  {
    id: 'flat-kw-spine',
    name: 'Flat Bat — Kashmir Willow',
    tagline: 'Retro flat, high spine',
    price: 1250, mrp: 1500,
    wood: 'kashmir', profile: 'flat',
    ball: ['soft', 'medium'],
    weight: [800, 950], height: [34, 36],
    handle: 'Short handle (SH)', sweetSpot: 'Mid to low',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 72, rating: 4.2, reviews: 126,
    badges: ['Retro'],
    usage: 'Soft and medium tennis ball',
    features: [
      'A grade Kashmir Willow',
      'High spine for extra punch',
      'Lightweight pickup with good balance',
      'Beginner friendly, retro flat look'
    ]
  },
  {
    id: 'flat-poplar-spine',
    name: 'Flat Bat — Poplar',
    tagline: 'Cheapest way into a flat bat',
    price: 1100, mrp: 1350,
    wood: 'poplar', profile: 'flat',
    ball: ['soft', 'medium'],
    weight: [800, 950], height: [34, 36],
    handle: 'Short handle (SH)', sweetSpot: 'Mid to low',
    finish: 'Standard', spine: true, edge: 'Standard',
    tier: 'entry', popularity: 64, rating: 4.0, reviews: 89,
    badges: ['Budget Pick'],
    usage: 'Soft and medium tennis ball',
    features: [
      'Poplar wood, short handle',
      'High spine profile',
      'Lightweight pickup with good balance',
      'Beginner friendly, retro type'
    ]
  },
  {
    id: 'flat-kw-nospine',
    name: 'Flat Bat No-Spine — Kashmir',
    tagline: 'Sleek and sword-like',
    price: 1850, mrp: 2200,
    wood: 'kashmir', profile: 'flat',
    ball: ['soft'],
    weight: [730, 850], height: [34, 36],
    handle: 'Cane handle', sweetSpot: 'Mid to low',
    finish: 'Polished', spine: false, edge: 'Flat face',
    tier: 'mid', popularity: 83, rating: 4.6, reviews: 158,
    badges: ['Bangalore Best Seller'],
    usage: 'Soft tennis ball — Wilson, Mercury',
    features: [
      'Kashmir Willow, flat back with no spine',
      'Sleek, sword-like look',
      'Balanced and lightweight feel',
      'Faster swing, durable build',
      'Best seller in Bangalore'
    ]
  },
  {
    id: 'flat-poplar-nospine',
    name: 'Flat Bat No-Spine — Poplar',
    tagline: 'The sword, on a budget',
    price: 1550, mrp: 1850,
    wood: 'poplar', profile: 'flat',
    ball: ['soft'],
    weight: [730, 850], height: [34, 36],
    handle: 'Normal handle', sweetSpot: 'Mid to low',
    finish: 'Standard', spine: false, edge: 'Flat face',
    tier: 'mid', popularity: 70, rating: 4.2, reviews: 104,
    badges: ['Bangalore Best Seller'],
    usage: 'Soft tennis ball',
    features: [
      'Poplar wood, flat back with no spine',
      'Sleek and sword look',
      'Balanced and lightweight feel',
      'Faster swing'
    ]
  },

  /* ---------- SRI LANKAN MID / PREMIUM ---------- */
  {
    id: 'sl-varnished',
    name: 'Varnished Sri Lankan',
    tagline: 'Glossy armour against the weather',
    price: 1600, mrp: 1950,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft', 'medium'],
    weight: [650, 850], height: [34, 36],
    handle: 'Single wood handle', sweetSpot: 'Mid to low',
    finish: 'Glossy varnished', spine: true, edge: 'Standard', width: '5 inch',
    toeGuard: true,
    tier: 'mid', popularity: 76, rating: 4.4, reviews: 137,
    usage: 'Soft and medium tennis ball cricket',
    features: [
      'Good Sri Lankan wood, single blade',
      'Glossy varnish protects the wood surface',
      'Reinforced toe protection',
      '5 inch breadth, smooth flat face',
      'Lightweight and balanced pickup'
    ]
  },
  {
    id: 'sl-furnished',
    name: 'Sri Lankan Furnished',
    tagline: 'Stickers, gutting, the full treatment',
    price: 1750, mrp: 2100,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft', 'medium'],
    weight: [650, 850], height: [34, 36],
    handle: 'Single wood handle', sweetSpot: 'Mid to low',
    finish: 'Furnished and polished', spine: true, edge: 'Standard',
    tier: 'mid', popularity: 79, rating: 4.5, reviews: 149,
    usage: 'Soft and medium tennis ball',
    features: [
      'Premium Sri Lankan wood, single blade',
      'Finished with stickers and gutting work',
      'Strong toe, smooth finished face',
      'Lightweight and well balanced',
      'Enhanced strength for long-lasting performance'
    ]
  },
  {
    id: 'cws',
    name: 'CWS',
    tagline: 'Sri Lankan blade. Indian handle.',
    price: 2200, mrp: 2650,
    wood: 'srilankan', profile: 'standard',
    ball: ['soft', 'medium'],
    weight: [770, 880], height: [34, 36],
    handle: 'Normal Indian handle (hybrid)', sweetSpot: 'Mid to low',
    finish: 'Smooth polished', spine: true, edge: 'Standard', width: '4.7 – 4.9 inch',
    toeGuard: true,
    tier: 'premium', popularity: 92, rating: 4.7, reviews: 268,
    badges: ['Best Seller in Toss'],
    usage: 'Soft and medium tennis ball',
    features: [
      'Premium Sri Lankan blade with Indian handle',
      'Better control, comfort and durability',
      'Rock base toe',
      'Balanced and comfortable pickup',
      'The bat Toss sells the most of'
    ]
  },
  {
    id: 'custom-scoop',
    name: 'Customized Scoop',
    tagline: 'Pick your colour. Pick your finish.',
    price: 2400, mrp: 2900,
    wood: 'srilankan', profile: 'scoop',
    ball: ['soft', 'medium'],
    weight: [780, 880], height: [34, 36],
    handle: 'Indian handle', sweetSpot: 'Mid to low',
    finish: 'Polished / Varnished / Painted colours', spine: true, edge: 'Standard', width: '5 inch',
    toeGuard: true, customizable: true,
    tier: 'premium', popularity: 87, rating: 4.6, reviews: 201,
    badges: ['Best Seller', 'Customizable'],
    usage: 'Soft and medium tennis ball',
    features: [
      'Hybrid Sri Lankan bat with middle scoop',
      'Less weight and better overall balance',
      'Toe guard fixed as standard',
      'Paint finish colours available',
      'Powerful hitting, faster bat speed, easy pickup'
    ]
  },
  {
    id: 'cs-pro',
    name: 'CS PRO — Scoop + Thick Edges',
    tagline: 'Maximum power build',
    price: 2500, mrp: 3000,
    wood: 'srilankan', profile: 'scoop',
    ball: ['soft', 'medium'],
    weight: [800, 950], height: [34, 36],
    handle: 'Premium Indian handle', sweetSpot: 'Mid to low',
    finish: 'Polished / Varnished / Painted colours', spine: true, edge: 'Thick edges',
    customizable: true,
    tier: 'premium', popularity: 85, rating: 4.7, reviews: 176,
    badges: ['Best Seller'],
    usage: 'Soft and medium tennis ball cricket',
    features: [
      'Premium Sri Lankan wood, scoop profile',
      'Thick edges for maximum power',
      'Premium Indian handle',
      'Lightweight feel with powerful balance',
      'Attractive paint colours available'
    ]
  },
  {
    id: 'ys-bat',
    name: 'YS Bat',
    tagline: 'Three-split handle. Thick edges.',
    price: 2300, mrp: 2800,
    wood: 'srilankan', profile: 'bigedge',
    ball: ['soft', 'medium'],
    weight: [750, 850], height: [34.5, 34.5],
    handle: 'Strong handle with 3 split', sweetSpot: 'Mid to low',
    finish: 'Polished', spine: true, edge: 'Thick edges',
    customizable: true,
    tier: 'premium', popularity: 89, rating: 4.7, reviews: 223,
    badges: ['Best Selling Sri Lankan'],
    usage: 'Tennis ball cricket, street cricket, tournament matches',
    features: [
      'Strong handle with 3 split construction',
      'Thick edges for maximum power',
      'Lightweight pickup with powerful hitting',
      'Well balanced for easy shots',
      'Weight customizable 750g – 850g'
    ]
  },
  {
    id: 'big-edge-varnish-pro',
    name: 'Big Edge Varnish Pro',
    tagline: 'Made to clear the rope',
    price: 2250, mrp: 2700,
    wood: 'srilankan', profile: 'bigedge',
    ball: ['soft', 'medium'],
    weight: [780, 900], height: [35, 36],
    handle: 'Joint handle, 2 piece', sweetSpot: 'Extended',
    finish: 'Varnished glossy', spine: true, edge: 'Massive big edge',
    tier: 'premium', popularity: 86, rating: 4.6, reviews: 187,
    usage: 'Aggressive batsmen and boundary hitters',
    features: [
      'Premium Sri Lankan hardwood',
      'Big edge with extended sweet spot',
      'Joint handle, 2 piece construction',
      'Excellent rebound and power transfer',
      'Durable varnished glossy finish'
    ]
  },
  {
    id: 'sl-mongoose-joint',
    name: 'Sri Lankan Mongoose Joint Handle',
    tagline: 'Short blade. Long handle. No mercy.',
    price: 2200, mrp: 2650,
    wood: 'srilankan', profile: 'mongoose',
    ball: ['soft', 'medium'],
    weight: [750, 900], height: [34.5, 36],
    handle: 'Joint handle, 3 piece', sweetSpot: 'Larger, higher',
    finish: 'Natural, fully furnished, anti-scuff ready', spine: true, edge: 'Standard',
    tier: 'premium', popularity: 81, rating: 4.5, reviews: 132,
    usage: 'Soft and medium tennis ball power hitting and slogs',
    features: [
      'Premium Sri Lankan willow',
      'Short blade with long handle',
      'Larger sweet spot and faster bat speed',
      'Slightly curved face',
      'Lightweight with excellent bat speed'
    ]
  },
  {
    id: 'swagger',
    name: 'Swagger',
    tagline: 'Burnt finish destroyer',
    price: 2250, mrp: 2700,
    wood: 'srilankan', profile: 'bigedge',
    ball: ['soft', 'medium'],
    weight: [780, 900], height: [35, 36],
    handle: 'Joint handle', sweetSpot: 'Mid to low',
    finish: 'Burnt finish', spine: true, edge: 'Thick edges',
    tier: 'premium', popularity: 84, rating: 4.6, reviews: 165,
    badges: ['Great Reviews'],
    usage: 'Soft tennis, medium weight tennis',
    features: [
      'A+ Sri Lankan wood',
      'Distinctive burnt finish',
      'Joint handle construction',
      'Light weight and perfect balance',
      'Shipping available across India'
    ]
  },
  {
    id: 'power-x',
    name: 'Toss Power X',
    tagline: '3 years of research. One bat.',
    price: 2999, mrp: 3599,
    wood: 'srilankan', profile: 'bigedge',
    ball: ['soft', 'medium'],
    weight: [650, 860], height: [34, 36],
    handle: 'Science-induced handle guard', sweetSpot: 'Extended',
    finish: 'Hand crafted, water resistant', spine: true, edge: 'Big edge',
    toeGuard: true, flagship: true, warranty: '3 months assured warranty',
    variants: [
      { id: 'feather', name: 'Feather Edition', weight: [650, 699], note: 'Fastest pickup' },
      { id: 'mercury', name: 'Mercury Plus Edition', weight: [700, 760], note: 'Balanced' },
      { id: 'sixit',   name: 'Sixit Edition', weight: [790, 860], note: 'Maximum power' }
    ],
    tier: 'premium', popularity: 96, rating: 4.9, reviews: 341,
    badges: ['Flagship', '3 Month Warranty'],
    usage: 'Every format of tennis ball cricket',
    features: [
      'Molecules packed powerful bat',
      'Triple hard seasoned',
      'Science induced rock toe and handle guard',
      '3 months assured warranty',
      '3 years of research behind the build',
      'Water resistant',
      'Feather feel balance with big edge for slogs',
      'Hand crafted — made with love and passion'
    ]
  },

  /* ---------- FOUR & SIXIT ---------- */
  {
    id: 'four-six-scoop-kw',
    name: 'Four & Sixit Scoop — Kashmir',
    tagline: '4 and 6 scoop, A+ willow',
    price: 1750, mrp: 2100,
    wood: 'kashmir', profile: 'scoop',
    ball: ['soft', 'medium'],
    weight: [750, 900], height: [34, 36],
    handle: 'Single cane handle', sweetSpot: 'Powerful, mid',
    finish: 'Premium polished', spine: true, edge: 'Thick edges',
    tier: 'mid', popularity: 82, rating: 4.5, reviews: 154,
    badges: ['A+ Grade'],
    usage: 'Soft and medium tennis balls, wind balls',
    features: [
      'Premium A+ grade Kashmir Willow',
      '4 and 6 scoop design for spine and power',
      'Cane handle for shock absorption and flex',
      'Thick edges with scooped back profile',
      'Quick bat swing and control on lofted shots'
    ]
  },
  {
    id: 'four-six-scoop-poplar',
    name: 'Four & Sixit Scoop — Poplar',
    tagline: 'Affordable edition',
    price: 1350, mrp: 1650,
    wood: 'poplar', profile: 'scoop',
    ball: ['soft', 'medium'],
    weight: [750, 900], height: [34, 36],
    handle: 'Normal handle', sweetSpot: 'Mid',
    finish: 'Premium polished with stickers', spine: true, edge: 'Thick edges',
    tier: 'entry', popularity: 68, rating: 4.1, reviews: 96,
    badges: ['Budget Pick'],
    usage: 'Soft and medium tennis balls, turf cricket',
    features: [
      'Poplar willow, affordable edition',
      '4 / 6 scoop for spine and powerful hits',
      'Thick edges with balanced weight distribution',
      'Lightweight feel with excellent balance',
      'Premium polished finish with attractive stickers'
    ]
  },

  /* ---------- MULTI BLADE ---------- */
  {
    id: 'kerala-scoop-furnished',
    name: 'Kerala Scoop Double Blade — Furnished',
    tagline: 'Popular across TN and Kerala',
    price: 2250, mrp: 2700,
    wood: 'kashmir', profile: 'multi',
    ball: ['soft', 'medium'],
    weight: [780, 900], height: [34, 36],
    handle: 'Single cane handle with premium grip', sweetSpot: 'Mid',
    finish: 'Premium furnished', spine: true, edge: 'Thick edges', blades: 2,
    tier: 'premium', popularity: 83, rating: 4.6, reviews: 171,
    badges: ['Double Blade'],
    usage: 'Tournament and turf cricket',
    features: [
      'Double blade structure for added strength',
      'Scoop design for faster bat swing',
      'Thick edges for better power transfer',
      'Premium furnished finishing',
      'Popular in Tamil Nadu and Kerala'
    ]
  },
  {
    id: 'kerala-scoop-unfurnished',
    name: 'Kerala Scoop Double Blade — Raw',
    tagline: 'Unfurnished. Pure wood.',
    price: 2050, mrp: 2450,
    wood: 'kashmir', profile: 'multi',
    ball: ['medium'],
    weight: [780, 900], height: [34, 36],
    handle: 'Premium cane handle with strong binding', sweetSpot: 'Mid',
    finish: 'Unfurnished, raw', spine: true, edge: 'Standard', blades: 2,
    tier: 'premium', popularity: 74, rating: 4.4, reviews: 118,
    badges: ['Double Blade'],
    usage: 'Medium tennis ball',
    features: [
      'Kashmir Willow, raw unfurnished finish',
      'Double blade construction for durability',
      'Premium cane handle with strong binding',
      'Powerful hitting performance',
      'Good balance between pickup and punch'
    ]
  },
  {
    id: 'poplar-double-blade',
    name: 'Poplar Double Blade — Furnished',
    tagline: 'Strong build, honest price',
    price: 1950, mrp: 2350,
    wood: 'poplar', profile: 'multi',
    ball: ['soft', 'medium'],
    weight: [780, 950], height: [34, 36],
    handle: 'Single cane handle with premium grip', sweetSpot: 'Large and extended',
    finish: 'Fully furnished premium', spine: true, edge: 'Thick edges', blades: 2,
    tier: 'mid', popularity: 73, rating: 4.3, reviews: 121,
    badges: ['Double Blade'],
    usage: 'Medium tennis, soft tennis, turf matches',
    features: [
      'Premium poplar wood, double blade',
      'Thick edges with full body profile',
      'Large and extended sweet spot',
      'Flat face for maximum power transfer',
      'Suitable for front-foot and back-foot shots'
    ]
  },
  {
    id: 'poplar-triple-blade',
    name: 'Poplar Triple Blade — Cane Handle',
    tagline: 'Triple laminated, affordable',
    price: 2150, mrp: 2550,
    wood: 'poplar', profile: 'multi',
    ball: ['soft', 'medium'],
    weight: [780, 900], height: [34, 36],
    handle: 'Cane handle', sweetSpot: 'Mid',
    finish: 'Premium furnished', spine: true, edge: 'Thick edges', blades: 3,
    tier: 'premium', popularity: 71, rating: 4.3, reviews: 103,
    badges: ['Triple Blade'],
    usage: 'Medium and soft tennis ball',
    features: [
      'Premium quality poplar wood',
      'Triple blade with thick edges',
      'Cane handle for better shock absorption',
      'Well-balanced weight distribution',
      'Affordable edition'
    ]
  },
  {
    id: 'kw-triple-blade',
    name: 'Kashmir Willow Triple Blade',
    tagline: 'Top of the willow range',
    price: 2450, mrp: 2950,
    wood: 'kashmir', profile: 'multi',
    ball: ['soft', 'medium'],
    weight: [780, 900], height: [34, 36],
    handle: 'Cane handle', sweetSpot: 'Mid',
    finish: 'Professional furnished, smooth polished', spine: true, edge: 'Thick edges', blades: 3,
    tier: 'premium', popularity: 79, rating: 4.6, reviews: 139,
    badges: ['A+ Grade', 'Triple Blade'],
    usage: 'Tournament and competitive tennis ball cricket',
    features: [
      'Premium A+ grade Kashmir Willow',
      'Triple blade with thick edges',
      'Cane handle reduces vibration',
      'Well-balanced pickup with powerful stroke play',
      'Strong, long-lasting construction'
    ]
  }
];

/* ---------- derived helpers ---------- */
const BALL_LABEL = { soft: 'Soft Tennis', medium: 'Medium Tennis' };
const TIER_LABEL = { entry: 'Under ₹1500', mid: '₹1500 – ₹2200', premium: '₹2200+' };

function priceOf(p) { return p.price; }
function hasPrice(p) { return typeof p.price === 'number'; }
function fmt(n) { return '₹' + n.toLocaleString('en-IN'); }
function weightLabel(p) { return p.weight[0] + 'g – ' + p.weight[1] + 'g'; }
function heightLabel(p) {
  return p.height[0] === p.height[1] ? p.height[0] + '"' : p.height[0] + '" – ' + p.height[1] + '"';
}
