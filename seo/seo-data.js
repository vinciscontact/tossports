/* ============================================================
   TOSS SPORTS — SEO CONTENT AND KEYWORD MAP

   Grounded in what actually appears in Indian search results
   (checked August 2026), not invented volumes:

   · "tennis cricket bat" is the dominant COMMERCIAL phrasing —
     DSC, Ciel Sports, Pitch Vision and SportsKhel all use it.
     "tennis ball cricket bat" is how people TALK, so both appear.
   · "hard tennis cricket bat" is a distinct category on several
     retailers, matching our soft/medium ball split exactly.
   · "Sri Lankan" / "Ceylon" tennis ball bat is a live CHENNAI term —
     Ace Sports (Saidapet) and Ad Sports rank for it on IndiaMART at
     ₹650–2,500. We MAKE Sri Lankan wood bats, and nobody is claiming
     that term with a real website. This is the strongest opening.
   · Chennai competitors are IndiaMART and JustDial listings, not
     websites. A branded site with proper schema can outrank them.
   · Price context: Ciel from ₹3,199, Decathlon ₹3,000–7,000,
     SportsKhel from ₹850. Our ₹950–2,999 makes "under ₹1500" and
     "under ₹2000" genuinely ownable.
   ============================================================ */

/* ONE PLACE for the domain. Change this line when the domain is final. */
const SITE = 'https://tossports.in';

const BUSINESS = {
  name: 'Toss Sports',
  legalName: 'Toss Sports',
  tagline: 'Handcrafted tennis ball cricket bats, made in Chennai',
  email: 'contact@tossports.in',
  phones: ['+918939981055', '+919176995707'],
  whatsapp: '919176995707',
  instagram: 'https://www.instagram.com/toss_sportz',
  founded: '2020',

  /* the workshop and shop */
  main: {
    id: 'workshop',
    name: 'Toss Sports — Workshop & Store',
    street: '69, Kavignar Kannadasan Nagar 5th St, Kannadasan Nagar, Nesapakkam, Ramapuram',
    locality: 'Chennai',
    region: 'Tamil Nadu',
    postal: '600078',
    country: 'IN',
    /* Nesapakkam / Ramapuram, west Chennai */
    lat: 13.0333, lng: 80.1833
  },

  /* a cricket turf that also sells bats — two search intents, one place */
  turf: {
    id: 'turf',
    name: 'Toss The Turf — Kolathur',
    street: 'Avenue, Plot Number 4, Kanchi Nagar, Vinayakapuram, Kolathur',
    locality: 'Chennai',
    region: 'Tamil Nadu',
    postal: '600099',
    country: 'IN',
    lat: 13.1200, lng: 80.2200
  }
};

/* ------------------------------------------------------------
   KEYWORD CLUSTERS
   Each cluster owns exactly one page, so two pages never compete
   for the same phrase — the mistake that flattens small sites.
   ------------------------------------------------------------ */

const CLUSTERS = {
  /* the money page: our actual niche */
  'tennis-ball-cricket-bats': {
    head: 'tennis ball cricket bat',
    also: ['tennis cricket bat', 'tennis ball bat', 'bat for tennis ball cricket',
           'tennis cricket bat online', 'tennis ball cricket bat price'],
    title: 'Tennis Ball Cricket Bats from ₹950',
    h1: 'Tennis ball cricket bats, made by hand in Chennai',
    desc: 'Tennis cricket bats shaped in our own Chennai workshop — Sri Lankan wood, Kashmir Willow and Poplar. Soft and hard tennis ball bats from ₹950. Order on WhatsApp or online.',
    filter: function (p) { return (p.category || 'bats') === 'bats'; },
    intro: 'Every bat on this page is pressed, profiled and finished in our own unit in Nesapakkam, Chennai — not bought in and re-branded. That is why we can cut a bat to the weight you ask for, and why we stand behind it when it breaks.'
  },

  /* the Chennai-specific term competitors rank for with no real site */
  'sri-lankan-tennis-ball-bats': {
    head: 'Sri Lankan tennis ball bat',
    also: ['ceylon cricket bat', 'sri lanka tennis cricket bat', 'seasoned ceylon bat',
           'sri lankan wood cricket bat', 'ceylon tennis ball bat Chennai'],
    title: 'Sri Lankan Wood Tennis Ball Bats, Chennai',
    h1: 'Sri Lankan wood tennis ball bats',
    desc: 'Seasoned Sri Lankan (Ceylon) wood tennis ball cricket bats, shaped in our Chennai workshop. Heavier, denser wood that takes the hard tennis ball. From ₹950, direct price, no middleman.',
    filter: function (p) { return p.wood === 'srilankan'; },
    intro: 'Sri Lankan wood — what Chennai players still call Ceylon wood — is denser than Kashmir Willow and takes a harder ball without the face going. It is what most of our bats are built from, and we buy the clefts ourselves rather than buying finished bats from a trader.'
  },

  'gully-cricket-bats': {
    head: 'gully cricket bat',
    also: ['street cricket bat', 'gully cricket bat online', 'best bat for gully cricket',
           'road cricket bat', 'galli cricket bat'],
    title: 'Gully & Street Cricket Bats from ₹950',
    h1: 'Gully and street cricket bats',
    desc: 'Street cricket bats built for concrete, tar and matting — thick toes, strong shoulders, honest prices from ₹950. Handmade in Chennai and played by clubs across Tamil Nadu.',
    filter: function (p) { return p.tier === 'entry' || p.tier === 'mid'; },
    intro: 'Street cricket is harder on a bat than any turf game: concrete edges, tar, and a ball that gets wet and heavy. These are the models our own customers keep coming back for — nothing precious, just bats that survive the ground you actually play on.'
  },

  'hard-tennis-ball-bats': {
    head: 'hard tennis cricket bat',
    also: ['medium tennis ball bat', 'heavy tennis ball bat', 'hard ball tennis bat',
           'bat for hard tennis ball', 'tournament tennis ball bat'],
    title: 'Hard Tennis Ball Cricket Bats, Chennai',
    h1: 'Bats for the hard and medium tennis ball',
    desc: 'Tennis cricket bats built for the heavier medium and hard tennis ball — triple-seasoned faces, thick edges, tournament weights. Made in Chennai from ₹1,500.',
    filter: function (p) { return (p.ball || []).indexOf('medium') > -1; },
    intro: 'A soft-ball bat will lift and crack against a hard tennis ball within a season. These carry heavier pressing and, on the Power X line, triple hard seasoning — built for turf tournaments and the medium ball.'
  },

  'scoop-mongoose-bats': {
    head: 'scoop cricket bat',
    also: ['mongoose bat', 'big edge cricket bat', 'flat bat cricket',
           'double blade cricket bat', 'sword bat cricket'],
    title: 'Scoop, Mongoose & Big Edge Cricket Bats',
    h1: 'Scoop, mongoose, flat and big-edge bats',
    desc: 'Six bat profiles made to order in Chennai — scoop, flat, big edge, mongoose, double and triple blade. Pick the shape that suits how you actually bat, from ₹1,200.',
    filter: function (p) { return ['scoop','mongoose','flat','bigedge','multi'].indexOf(p.profile) > -1; },
    intro: 'The profile changes how the bat picks up and where the weight sits. A scoop swings faster for the same weight; a big edge gives you more to hit with; a mongoose is a slog machine. All six are made in our unit, and any of them can be cut to your weight.'
  },

  'cricket-bats-under-1500': {
    head: 'cricket bat under 1500',
    also: ['cheap tennis ball bat', 'budget cricket bat India', 'cricket bat under 1000',
           'affordable tennis cricket bat', 'best cricket bat under 2000'],
    title: 'Cricket Bats Under ₹1,500 — Real Wood',
    h1: 'Tennis ball bats under ₹1,500',
    desc: 'Proper wooden tennis ball cricket bats from ₹950 — not plastic, not a toy. Direct from our Chennai workshop with no middleman markup.',
    filter: function (p) { return p.price != null && p.price <= 1500; },
    intro: 'A ₹950 bat from us is a real bat: single-piece wood, cane handle, proper grip. The reason it costs less is that it goes from our unit to you, without a distributor and a shop taking a cut on the way.'
  },

  'cricket-bat-shop-chennai': {
    head: 'cricket bat shop in Chennai',
    also: ['cricket bat manufacturer Chennai', 'tennis ball bat Chennai',
           'cricket bat near me Chennai', 'cricket shop Nesapakkam', 'bat shop Ramapuram'],
    title: 'Cricket Bat Shop in Chennai — The Workshop',
    h1: 'A cricket bat maker in Chennai, not a reseller',
    desc: 'Toss Sports makes tennis ball cricket bats in Nesapakkam, Chennai. Come to the workshop, pick your weight, watch it finished. Also at Toss The Turf, Kolathur.',
    filter: null,           /* a place page, not a product listing */
    intro: 'Most "cricket bat shops" in Chennai buy finished bats from Meerut or Jalandhar and put a sticker on them. We press, profile and finish ours here in Nesapakkam. You can come and see it happen, tell us the weight you want, and take the bat the same week.'
  }
};

/* ------------------------------------------------------------
   THE GUIDE HUB — the AEO / GEO play
   These exist to be QUOTED. Each answers one real question in the
   first two sentences, because that is the part an AI engine or a
   featured snippet lifts. Everything after is the evidence.
   ------------------------------------------------------------ */

const GUIDES = [
  {
    slug: 'which-bat-for-tennis-ball-cricket',
    title: 'Which Bat for Tennis Ball Cricket?',
    h1: 'Which bat should you use for tennis ball cricket?',
    desc: 'Soft tennis ball, hard tennis ball or both — how the ball you play with decides the bat you need, from a Chennai bat maker.',
    keywords: ['which bat for tennis ball', 'soft vs hard tennis ball bat',
               'tennis ball cricket bat guide', 'what bat for tennis cricket'],
    answer: 'Use a lighter Poplar or Kashmir Willow bat for the soft tennis ball, and a heavier, harder-pressed Sri Lankan wood bat for the medium or hard tennis ball. Playing a soft-ball bat against a hard ball is the single most common reason a tennis bat cracks within a season.',
    sections: [
      ['The ball decides everything else',
       'A soft tennis ball weighs around 55–60g and gives on impact. A medium or "hard" tennis ball is heavier and barely gives at all, so the same shot puts far more shock into the blade. That is why bats are built differently for each, and why the first question we ask a customer is which ball they play with.'],
      ['If you play with the soft ball',
       'Look for Poplar or Kashmir Willow at 550–800g. It will pick up fast, which matters more than raw power when the ball is not coming on. Our Regular Bat and the lighter Kashmir models are built for exactly this, from ₹950.'],
      ['If you play with the medium or hard ball',
       'You want Sri Lankan (Ceylon) wood, a heavier press, and ideally a seasoned face. Sri Lankan wood is denser than Kashmir Willow and takes repeated hard-ball impact without lifting. Our Power X line carries triple hard seasoning for this reason.'],
      ['If you play with both',
       'Buy for the harder ball. A bat built for the medium ball will handle a soft ball perfectly well; the reverse is not true. If you are genuinely split, tell us and we will suggest a middle weight rather than selling you two bats.'],
      ['A quick way to check',
       'Press your thumbnail into the face near the middle. If it marks easily, that bat is not built for a hard ball. A properly seasoned face resists it.']
    ]
  },
  {
    slug: 'what-weight-cricket-bat-should-i-use',
    title: 'What Weight Cricket Bat Should You Use?',
    h1: 'What weight bat should you use?',
    desc: 'How to pick bat weight for tennis ball cricket — by how you bat, not by how strong you feel. Weights explained by a Chennai bat maker.',
    keywords: ['cricket bat weight', 'what weight bat should I use',
               'best bat weight tennis ball', '900 gram cricket bat', 'light vs heavy bat'],
    answer: 'For tennis ball cricket, most adults are best served between 750g and 850g. Go under 750g if you rely on timing and play square of the wicket; go over 850g only if you genuinely clear the rope and can still swing it late in an innings.',
    sections: [
      ['Heavier is not better',
       'The most common mistake we see is buying the heaviest bat someone can lift. Power in tennis ball cricket comes from bat speed far more than bat mass, and a bat you cannot swing through the line late in an innings costs you more runs than it ever gains.'],
      ['The honest test',
       'Hold the bat out straight in one hand for ten seconds. If your wrist drops, it is too heavy for you — no matter how good it feels for the first two shots.'],
      ['Rough guide by how you bat',
       'Under 750g suits fast hands, cutting and pulling, and younger players. 750–850g is where most club players land and is our most-ordered range. Above 850g is for genuine hitters playing a heavier ball, and works best with a big-edge or multi-blade profile that puts the mass behind the middle.'],
      ['We cut to your weight',
       'Because we shape the bats ourselves, you can tell us a target weight when you order and we will pick a cleft to match rather than sending whatever is in the box. Most customers give us a range — "around 800, not over 850" — and that works well.']
    ]
  },
  {
    slug: 'scoop-vs-flat-vs-big-edge-bat',
    title: 'Scoop vs Flat vs Big Edge Cricket Bats',
    h1: 'Scoop, flat or big edge — which profile?',
    desc: 'What the six tennis ball bat profiles actually do, and which one suits your batting. Explained by the people who shape them.',
    keywords: ['scoop bat vs normal bat', 'what is a scoop cricket bat',
               'big edge bat', 'flat bat cricket', 'mongoose bat explained'],
    answer: 'A scoop removes wood from the back so the bat swings faster at the same weight; a big edge adds wood to the sides so there is more bat behind a mishit; a flat bat gives the largest hitting face for tennis ball cricket. Choose scoop for hand speed, big edge for power, flat for a big margin of error.',
    sections: [
      ['Standard',
       'A classic blade with an even profile. Nothing to learn, nothing to compensate for. If you are buying a first proper bat, start here.'],
      ['Scoop',
       'Wood is hollowed from the back, so you get the same pickup at a lower weight, or more length at the same weight. Suits players who rely on timing and want the bat through the shot quickly.'],
      ['Flat',
       'A sword-flat face with no spine. The whole face becomes a hitting area, which is why it is popular in gully cricket where the ball rarely comes on at a predictable height.'],
      ['Big edge',
       'Thick edges, so a shot off the toe or the shoulder still carries. This is the profile people mean when they say they want to "clear the rope" — and the one we make most of in the premium range.'],
      ['Mongoose',
       'Short blade, long handle. A pure slogging bat: enormous power in the arc, very little defence. Fun, and honest about what it is for.'],
      ['Double and triple blade',
       'Laminated blades bonded together for extra strength and punch. Heavier and stronger, made for the hardest tennis balls and rough grounds.']
    ]
  },
  {
    slug: 'how-to-care-for-tennis-ball-bat',
    title: 'How to Look After a Tennis Ball Bat',
    h1: 'Looking after a tennis ball cricket bat',
    desc: 'Tennis ball bats need far less fuss than leather-ball bats. What actually matters, what does not, and how to make one last seasons.',
    keywords: ['how to knock in tennis ball bat', 'cricket bat care',
               'tennis ball bat maintenance', 'do tennis bats need knocking in'],
    answer: 'Tennis ball cricket bats do not need knocking in. Keep the bat dry, tape the toe before it frays, and never use it on a wet ground or against a leather ball — those three habits are worth more than any oiling routine.',
    sections: [
      ['Knocking in: not required',
       'Knocking in exists to compress the face against a hard leather ball. A tennis ball never applies that kind of point load, so the hours of mallet work you read about are simply not relevant here. Any shop insisting otherwise is selling you a service.'],
      ['Water is the real enemy',
       'Wood swells, the grain lifts, and the toe goes soft. Do not play on a wet outfield, do not leave the bat in a car boot, and dry it properly if it does get wet.'],
      ['Tape the toe early',
       'The toe takes most of the punishment on concrete and tar. A wrap of fibre tape before it starts fraying will add seasons to the bat. Once it splits, the damage is done.'],
      ['The grip is a consumable',
       'A worn grip changes how the bat feels and makes you grip harder than you need to. Replace it once or twice a season; it costs very little.'],
      ['What we cover',
       'Wood splitting on its own or a handle coming loose is a manufacturing fault and we will replace it — three months on the Toss Power X line. Normal wear from playing, or damage from a wet ground or the wrong ball, is not covered, and we would rather say that plainly than in small print.']
    ]
  },
  {
    slug: 'sri-lankan-vs-kashmir-willow-vs-poplar',
    title: 'Sri Lankan Wood vs Kashmir Willow vs Poplar',
    h1: 'Sri Lankan wood, Kashmir Willow or Poplar?',
    desc: 'The three woods used in tennis ball cricket bats, what each is actually good for, and what Chennai players call Ceylon wood.',
    keywords: ['sri lankan wood cricket bat', 'kashmir willow vs poplar',
               'ceylon wood bat', 'best wood for tennis ball bat'],
    answer: 'Sri Lankan (Ceylon) wood is the densest of the three and best for the hard tennis ball; Kashmir Willow is lighter with better pickup for the soft ball; Poplar is the most affordable and suits beginners and younger players. For most Chennai club cricket, Sri Lankan wood is the right answer.',
    sections: [
      ['Sri Lankan wood, or Ceylon wood',
       'Denser and heavier than the alternatives, which is exactly what you want against a medium or hard tennis ball. It takes repeated impact without the face lifting. In Chennai it is still commonly called Ceylon wood, and it is what most of our range is built from.'],
      ['Kashmir Willow',
       'Lighter, with a cleaner pickup and a slightly softer feel. Good for the soft tennis ball and for players who value bat speed. It will not last as long against a hard ball.'],
      ['Poplar',
       'The lightest and cheapest of the three. Honest, serviceable wood for beginners, younger players and casual games. We use it where the price matters more than the last ten percent of performance — and we say so rather than calling it something it is not.'],
      ['What we would tell a friend',
       'If you play weekend cricket in Chennai with a medium ball, buy Sri Lankan wood. If you play in the street with a soft ball and want the bat to feel fast, Kashmir Willow. If you are buying for a child or a one-off tournament, Poplar is fine and there is no shame in it.']
    ]
  },
  {
    slug: 'buy-cricket-bat-chennai',
    title: 'Where to Buy a Cricket Bat in Chennai',
    h1: 'Buying a cricket bat in Chennai',
    desc: 'How to buy a tennis ball cricket bat in Chennai directly from the workshop — visit us in Nesapakkam, or order on WhatsApp.',
    keywords: ['buy cricket bat Chennai', 'cricket bat shop near me Chennai',
               'cricket bat price Chennai', 'tennis ball bat Chennai'],
    answer: 'You can buy directly from our workshop at Nesapakkam, Chennai, or from Toss The Turf in Kolathur. Bats run from ₹950 to ₹2,999, we cut to your weight, and you can message us on WhatsApp before paying anything.',
    sections: [
      ['Come to the unit',
       'The workshop is at 69, Kavignar Kannadasan Nagar 5th Street, Nesapakkam, Ramapuram, Chennai 600078. You can see the bats being finished, pick up a few and feel the weight, and take one away the same week.'],
      ['Or at Toss The Turf, Kolathur',
       'Our turf at Kanchi Nagar, Vinayakapuram, Kolathur also carries bats. Convenient if you are on the north side of the city, and you can try one out on the ground.'],
      ['Order without visiting',
       'Message us on WhatsApp at 91769 95707. Tell us the ball you play with, roughly what weight you like, and your budget, and we will send photos of two or three that fit. No account, no card needed to ask.'],
      ['What it costs',
       'Bats start at ₹950 and go to ₹2,999 for the Toss Power X. That is the price from the maker — there is no distributor or retailer margin in it, which is why comparable bats elsewhere start higher.'],
      ['Delivery across India',
       'We ship anywhere in India, free over ₹1,500, usually 3–6 days. Clubs across Tamil Nadu and Karnataka already play with these.']
    ]
  }
];

/* Questions worth answering in FAQ schema on the main pages. Written the
   way people actually type them, because that is what gets matched. */
const FAQS = [
  ['What is a tennis ball cricket bat?',
   'A tennis ball cricket bat is a bat built for the lighter tennis ball used in street, gully and club cricket, rather than a hard leather ball. It is lighter, needs no knocking in, and is usually made from Sri Lankan wood, Kashmir Willow or Poplar.'],
  ['How much does a tennis ball cricket bat cost in India?',
   'A proper wooden tennis ball cricket bat costs between ₹950 and ₹3,500 in India. Toss Sports bats run from ₹950 to ₹2,999 direct from our Chennai workshop, without a distributor margin.'],
  ['Do tennis ball cricket bats need knocking in?',
   'No. Knocking in compresses the face against a hard leather ball, and a tennis ball never applies that load. Keeping the bat dry and taping the toe matters far more.'],
  ['Which wood is best for a tennis ball bat?',
   'Sri Lankan (Ceylon) wood is best for the hard or medium tennis ball because it is denser. Kashmir Willow suits the soft ball with faster pickup, and Poplar is the affordable choice for beginners.'],
  ['What weight bat is best for tennis ball cricket?',
   'Most adults suit 750g to 850g. Lighter than 750g favours timing and fast hands; heavier than 850g only makes sense if you can still swing it through the line late in an innings.'],
  ['Can I get a cricket bat made to my own weight?',
   'Yes. Because we shape the bats ourselves in Chennai, you can specify a target weight, scoop style and colour when you order, and we pick a cleft to match.'],
  ['Where can I buy a cricket bat in Chennai?',
   'Toss Sports makes and sells bats at its workshop in Nesapakkam, Ramapuram, and at Toss The Turf in Kolathur. You can also order on WhatsApp at 91769 95707 for delivery anywhere in India.']
];

module.exports = { SITE, BUSINESS, CLUSTERS, GUIDES, FAQS };
