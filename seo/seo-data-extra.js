/* ============================================================
   TOSS SPORTS — SECOND WAVE

   Covers what the first pass missed:
     · THE TURF. Toss The Turf is a separate business with its own
       searches ("cricket turf near me", "box cricket ground Chennai")
       and it had no page at all. Turf searches in Chennai are fought
       over by aggregators, not by grounds with real websites.
     · Wooden versus plastic — the argument that separates a real bat
       from the moulded plastic ones flooding marketplaces.
     · Chennai neighbourhoods, each written with something TRUE and
       specific: distance, route, which of our two places is closer.
       An area page that only swaps the place name is a doorway page
       and Google treats it as spam.
     · Clubs and bulk, because a 170-bat team order is the best
       customer in the business and had nowhere to land.
     · The brand. Someone sees a Toss bat at a ground and searches
       "toss bat" that evening — that has to find us.

   NAP note: the name, address and phone must stay character-for-
   character identical to the two Google Business Profiles. That
   consistency is what Google uses to trust a listing — a "St" here
   and a "Street" there genuinely costs local ranking.
   ============================================================ */

/* ---------- the turf ---------- */
const TURF_PAGES = {
  'cricket-turf-chennai': {
    title: 'Cricket Turf in Chennai — Toss The Turf, Kolathur',
    h1: 'Toss The Turf — cricket ground at Kolathur',
    desc: 'Book a cricket turf in Kolathur, Chennai. Floodlit ground for box cricket, net practice and team matches. Bats available on site. Call 91769 95707.',
    keywords: ['cricket turf chennai', 'cricket turf near me', 'turf booking chennai',
               'cricket ground kolathur', 'turf near me', 'cricket turf kolathur'],
    intro: 'Toss The Turf is our ground at Kanchi Nagar, Vinayakapuram, Kolathur — north Chennai. Box cricket, net practice, team matches and tournaments, under lights. It is run by the same people who make the bats, so if yours goes during a game there is a replacement in the cabin.',
    sections: [
      ['What you can book',
       'The full ground for a team match, a box-cricket slot for six or eight a side, or nets for batting practice. Evening and night slots run under floodlights, which is when most Chennai cricket actually happens.'],
      ['Getting here',
       'Kanchi Nagar, Vinayakapuram, Kolathur, Chennai 600099. Easy from Anna Nagar, Perambur, Villivakkam, Ayanavaram and Retteri — most of north Chennai is inside twenty minutes.'],
      ['Bats and gear on site',
       'We make tennis ball cricket bats ourselves, and the turf carries stock. If you turn up a bat short, or one breaks mid-game, you are not finished for the evening.'],
      ['Booking a slot',
       'Call or WhatsApp 91769 95707 with the date, the time and how many are playing. Weekend evenings go first, so a few days ahead is sensible.']
    ]
  },
  'box-cricket-chennai': {
    title: 'Box Cricket Ground in Chennai — Kolathur',
    h1: 'Box cricket in Chennai',
    desc: 'Box cricket ground at Kolathur, Chennai — floodlit, netted, six to eight a side. Book an evening slot at Toss The Turf on 91769 95707.',
    keywords: ['box cricket chennai', 'box cricket near me', 'box cricket ground',
               'box cricket kolathur', 'indoor cricket chennai', 'box cricket booking'],
    intro: 'Box cricket is the format most of Chennai actually plays: a netted ground, six or eight a side, an hour a game, floodlights on. Our turf at Kolathur is set up for exactly that.',
    sections: [
      ['Why box cricket suits the city',
       'You do not need twenty-two players, a full outfield, or a whole Sunday. A netted box means nobody chases the ball into traffic, and an hour is enough for a proper game after work.'],
      ['The ground',
       'Netted on all sides, floodlit for evening and night play, and matted for a true, predictable bounce with a tennis ball. Kanchi Nagar, Vinayakapuram, Kolathur 600099.'],
      ['What to bring',
       'Just players. Bats are available on site because we make them — tennis ball bats from ₹950 if you want your own rather than a shared one.'],
      ['Book it',
       'WhatsApp or call 91769 95707. Tell us the day, the time and the number of players.']
    ]
  }
};

/* ---------- Chennai neighbourhoods ---------- */
const AREAS = [
  { slug: 'porur', name: 'Porur', km: '4 km', near: 'workshop',
    note: 'Porur is the closest major junction to our workshop — straight down the Mount-Poonamallee side and you are here in under fifteen minutes.',
    landmarks: 'Porur Lake, Ramachandra Hospital, DLF' },
  { slug: 'valasaravakkam', name: 'Valasaravakkam', km: '3 km', near: 'workshop',
    note: 'Valasaravakkam is our nearest neighbourhood — many of our first customers came from the grounds around Alwarthirunagar and still walk in.',
    landmarks: 'Alwarthirunagar, Arcot Road' },
  { slug: 'ashok-nagar', name: 'Ashok Nagar & K.K. Nagar', km: '5 km', near: 'workshop',
    note: 'Ashok Nagar and K.K. Nagar sit a short ride east of the unit. The maidan cricket around here is exactly what our entry bats were built for.',
    landmarks: 'Ashok Pillar, K.K. Nagar bus depot' },
  { slug: 'vadapalani', name: 'Vadapalani', km: '6 km', near: 'workshop',
    note: 'Vadapalani is about twenty minutes from the workshop on the Arcot Road side, and a common meeting point for customers coming from the city centre.',
    landmarks: 'Vadapalani Murugan Temple, Forum Mall' },
  { slug: 't-nagar', name: 'T. Nagar', km: '8 km', near: 'workshop',
    note: 'From T. Nagar the unit is a straight run west. Worth the trip if you want to hold three or four bats and pick the weight yourself rather than guess online.',
    landmarks: 'Panagal Park, Ranganathan Street' },
  { slug: 'anna-nagar', name: 'Anna Nagar', km: '5 km', near: 'turf',
    note: 'Anna Nagar is closer to Toss The Turf at Kolathur than to the workshop — you can book a slot and pick up a bat on the same trip.',
    landmarks: 'Anna Nagar Tower Park, Shanthi Colony' },
  { slug: 'perambur', name: 'Perambur', km: '4 km', near: 'turf',
    note: 'Perambur is a short ride from our Kolathur turf, and a lot of the sides who play our evening slots come from here.',
    landmarks: 'Perambur Railway Station, Jamalia' },
  { slug: 'villivakkam', name: 'Villivakkam', km: '3 km', near: 'turf',
    note: 'Villivakkam is one of the nearest areas to the turf — close enough that most teams walk across for a weekday evening game.',
    landmarks: 'Villivakkam Station, Padi' }
];

/* ---------- extra clusters ---------- */
const CLUSTERS_2 = {
  'wooden-cricket-bats': {
    head: 'wooden cricket bat',
    also: ['wooden bat', 'wooden cricket bat for tennis ball', 'wood bat cricket',
           'plastic vs wooden cricket bat', 'real wood cricket bat'],
    title: 'Wooden Cricket Bats — Real Wood, Not Plastic',
    h1: 'Wooden cricket bats, not moulded plastic',
    desc: 'Real wooden cricket bats for tennis ball cricket — Sri Lankan wood, Kashmir Willow and Poplar, shaped by hand in Chennai from ₹950. Not plastic, not a toy.',
    allProducts: true,
    intro: 'Search for a cheap cricket bat and half the results are moulded plastic sold as "full size". Every bat we make is a single piece of real wood with a cane handle — Sri Lankan, Kashmir Willow or Poplar — pressed and shaped in our own unit. A plastic bat cannot be cut to your weight, cannot be repaired, and will not last a season of hard tennis ball cricket.'
  },
  'bulk-cricket-bats-for-clubs': {
    head: 'bulk cricket bats for clubs',
    also: ['cricket bats for team', 'wholesale tennis ball bats', 'club cricket bats order',
           'tournament bats bulk', 'cricket bat manufacturer bulk order'],
    title: 'Bulk Cricket Bats for Clubs & Tournaments',
    h1: 'Bats for clubs, teams and tournaments',
    desc: 'Bulk tennis ball cricket bats direct from the Chennai workshop — matched weights, your club colours, tournament quantities. One recent order covered around 170 players.',
    intro: 'Because we make the bats rather than buy them in, a club order is not just a discount on retail stock — we can match weights across a squad, put your colours on them, and hold a consistent spec across a whole tournament. One recent order went out to a tournament with around 170 players using them.',
    sections: [
      ['What we can do for a squad',
       'Matched weights, so a side is not split between 700g and 900g bats. The same profile across the order, and your club colour on the grip and stickers. Lead time is usually one to two weeks depending on quantity.'],
      ['Pricing',
       'Club pricing depends on quantity and spec, and it comes off the direct price — which is already below retail because there is no distributor in between. Tell us the numbers and we will quote properly rather than post a fake list price.'],
      ['How to start',
       'WhatsApp 91769 95707 with how many bats, the ball you play with, and roughly what weight range. We will send options and a quote the same day.']
    ]
  },
  'toss-cricket-bats': {
    head: 'toss cricket bat',
    also: ['toss bats', 'toss sports', 'toss sports chennai', 'toss power x',
           'toss bat price', 'toss tennis ball bat'],
    title: 'Toss Bats — The Workshop and The Range',
    h1: 'Toss Sports — who we are and what we make',
    desc: 'Toss Sports makes tennis ball cricket bats in Chennai. Toss Power X, CS Pro, CWS and more, from ₹950. Seen a Toss bat at a ground? This is where it comes from.',
    allProducts: true,
    intro: 'If you have seen a Toss bat at a ground in Chennai and looked us up afterwards, this is the place. We are a workshop at Nesapakkam, not a brand that puts stickers on bought-in bats. Every bat is pressed, profiled and finished by us, and we also run Toss The Turf at Kolathur.'
  }
};

/* ---------- one more guide ---------- */
const GUIDES_2 = [
  {
    slug: 'wooden-vs-plastic-cricket-bat',
    title: 'Wooden vs Plastic Cricket Bat: Which to Buy',
    h1: 'Wooden or plastic cricket bat?',
    desc: 'Why a real wooden tennis ball bat beats a moulded plastic one, and the one case where plastic is genuinely the sensible choice.',
    keywords: ['wooden vs plastic cricket bat', 'is plastic cricket bat good',
               'plastic cricket bat', 'wooden cricket bat better'],
    answer: 'Buy a wooden bat if you play regularly with a tennis ball — it hits further, lasts seasons, and can be cut to your weight. Plastic bats only make sense for children under ten, for the beach, or for a one-off game where the bat will be abused and abandoned.',
    sections: [
      ['What plastic gets you',
       'It survives water, costs very little, and will not splinter. That is the whole list. It has almost no rebound, the weight sits wrong, and it cannot be repaired or reshaped.'],
      ['What wood gets you',
       'A real middle. A tennis ball comes off a pressed wooden face far harder than off plastic, which is why every serious gully side plays with wood. It can also be cut to your weight, re-gripped, and taped at the toe to add seasons.'],
      ['The honest exception',
       'For a seven-year-old, or a game on the beach where the bat is going in the sea, buy plastic. We would rather say that than sell you a ₹950 bat to leave in the sand.'],
      ['What to check before you buy',
       'If a listing does not name the wood, it is usually because there is not much of it. Ours say Sri Lankan, Kashmir Willow or Poplar on every product page, because we buy the clefts ourselves.']
    ]
  }
];

module.exports = { TURF_PAGES, AREAS, CLUSTERS_2, GUIDES_2 };
