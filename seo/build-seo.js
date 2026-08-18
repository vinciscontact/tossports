#!/usr/bin/env node
/**
 * TOSS SPORTS — SEO PRE-RENDERER
 *
 * Writes a real HTML file for every product, category and guide, because
 * the app uses hash routing (#/product/x) and Google ignores everything
 * after the #. Without this, the entire site is one URL to a crawler.
 *
 * Each generated page carries:
 *   · a unique title and meta description built from the keyword map
 *   · canonical, Open Graph and Twitter card
 *   · JSON-LD — Product / ItemList / FAQPage / Article / BreadcrumbList
 *   · REAL VISIBLE CONTENT, not a redirect. A page that shows a crawler
 *     something the visitor never sees is cloaking; here the static page
 *     IS the page, and the app takes over for onward navigation.
 *
 *   node seo/build-seo.js            → writes into dist/
 *   node seo/build-seo.js --inplace  → writes into the project root
 */

const fs = require('fs');
const path = require('path');
const { SITE, BUSINESS, CLUSTERS, GUIDES, FAQS } = require('./seo-data');

const ROOT = path.resolve(__dirname, '..');
const INPLACE = process.argv.includes('--inplace');
const OUT = INPLACE ? ROOT : path.join(ROOT, 'dist');

/* ---------- load the catalogue out of the v1 bundle ---------- */
function loadProducts() {
  const src = fs.readFileSync(path.join(ROOT, 'js/products.js'), 'utf8');
  const sandbox = {};
  new Function('exports', src + '\nexports.P = PRODUCTS; exports.W = WOOD; exports.PR = PROFILE;')(sandbox);
  return { products: sandbox.P, WOOD: sandbox.W, PROFILE: sandbox.PR };
}

const { products: PRODUCTS, WOOD, PROFILE } = loadProducts();

/* ---------- helpers ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const jsonld = o => '<script type="application/ld+json">' +
  JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';

const inr = n => '₹' + Number(n).toLocaleString('en-IN');

/* Google shows roughly 60 characters of a title and 155–160 of a
   description. Anything past that is cut mid-word in the result, which
   both looks careless and loses the keyword sitting at the end. These two
   helpers keep every page inside the budget, and the build reports any it
   could not fix rather than shipping a truncated page silently. */
const TITLE_MAX = 60, DESC_MAX = 158;
const tooLong = [];

function fitTitle(core, brand) {
  brand = brand || 'Toss Sports';
  const withBrand = core + ' | ' + brand;
  if (withBrand.length <= TITLE_MAX) return withBrand;
  if (core.length <= TITLE_MAX) return core;      /* brand dropped to fit */
  tooLong.push('title (' + core.length + '): ' + core);
  return core;
}

/** First candidate that fits with the brand, else first that fits alone. */
function firstThatFits(candidates, brand) {
  brand = brand || 'Toss Sports';
  for (const c of candidates) {
    if ((c + ' | ' + brand).length <= TITLE_MAX) return c + ' | ' + brand;
  }
  for (const c of candidates) {
    if (c.length <= TITLE_MAX) return c;
  }
  tooLong.push('title (' + candidates[candidates.length - 1].length + '): ' +
    candidates[candidates.length - 1]);
  return candidates[candidates.length - 1];
}

function fitDesc(text) {
  if (text.length <= DESC_MAX) return text;
  const cut = text.slice(0, DESC_MAX);
  const at = cut.lastIndexOf(' ');
  return (at > 100 ? cut.slice(0, at) : cut).replace(/[,;:—-]$/, '') + '…';
}

function write(rel, html) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
  return rel;
}

/* ---------- shared schema ---------- */

function addressOf(loc) {
  return {
    '@type': 'PostalAddress',
    streetAddress: loc.street, addressLocality: loc.locality,
    addressRegion: loc.region, postalCode: loc.postal, addressCountry: loc.country
  };
}

/** The business itself — referenced by @id from every other block. */
const ORG = {
  '@type': ['Organization', 'Brand'],
  '@id': SITE + '/#organization',
  name: BUSINESS.name,
  url: SITE,
  logo: SITE + '/images/logo/toss-mark-192.png',
  image: SITE + '/images/logo/toss-mark-192.png',
  email: BUSINESS.email,
  telephone: BUSINESS.phones[0],
  foundingDate: BUSINESS.founded,
  description: 'Handcrafted tennis ball cricket bats made in Chennai. Sri Lankan wood, Kashmir Willow and Poplar, shaped to order.',
  sameAs: [BUSINESS.instagram],
  address: addressOf(BUSINESS.main),
  areaServed: { '@type': 'Country', name: 'India' }
};

/** The workshop — a shop people can visit, which is the local-SEO asset. */
const STORE = {
  '@type': ['SportingGoodsStore', 'LocalBusiness'],
  '@id': SITE + '/#workshop',
  name: BUSINESS.main.name,
  parentOrganization: { '@id': SITE + '/#organization' },
  url: SITE + '/cricket-bat-shop-chennai/',
  image: SITE + '/images/logo/toss-mark-192.png',
  telephone: BUSINESS.phones[0],
  email: BUSINESS.email,
  priceRange: '₹₹',
  currenciesAccepted: 'INR',
  paymentAccepted: 'Cash, UPI, Card',
  address: addressOf(BUSINESS.main),
  geo: { '@type': 'GeoCoordinates',
         latitude: BUSINESS.main.lat, longitude: BUSINESS.main.lng },
  areaServed: [{ '@type': 'City', name: 'Chennai' },
               { '@type': 'State', name: 'Tamil Nadu' }],
  makesOffer: {
    '@type': 'Offer',
    itemOffered: { '@type': 'Product', name: 'Handmade tennis ball cricket bats' },
    priceSpecification: {
      '@type': 'PriceSpecification',
      minPrice: 950, maxPrice: 2999, priceCurrency: 'INR'
    }
  }
};

/** The turf — a venue AND a shop, so both intents are described. */
const TURF = {
  '@type': ['SportsActivityLocation', 'SportingGoodsStore'],
  '@id': SITE + '/#turf',
  name: BUSINESS.turf.name,
  parentOrganization: { '@id': SITE + '/#organization' },
  url: SITE + '/cricket-bat-shop-chennai/',
  telephone: BUSINESS.phones[1],
  address: addressOf(BUSINESS.turf),
  geo: { '@type': 'GeoCoordinates',
         latitude: BUSINESS.turf.lat, longitude: BUSINESS.turf.lng },
  sport: 'Cricket',
  areaServed: { '@type': 'City', name: 'Chennai' }
};

const WEBSITE = {
  '@type': 'WebSite',
  '@id': SITE + '/#website',
  url: SITE,
  name: BUSINESS.name,
  publisher: { '@id': SITE + '/#organization' },
  inLanguage: 'en-IN',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: SITE + '/#/shop?q={search_term_string}' },
    'query-input': 'required name=search_term_string'
  }
};

function breadcrumbs(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name,
      item: SITE + t.url
    }))
  };
}

function faqSchema(pairs) {
  return {
    '@type': 'FAQPage',
    mainEntity: pairs.map(([q, a]) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };
}

/* ---------- the page shell ----------
   Real content, then the app boots over it. Same markup a visitor and a
   crawler receive. */

function shell(o) {
  const url = SITE + o.path;
  const img = o.image || (SITE + '/images/hero/slide-1-1280.jpg');
  const graph = [ORG, WEBSITE].concat(o.schema || []);

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0B0B24">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
${o.keywords ? `<meta name="keywords" content="${esc(o.keywords.join(', '))}">` : ''}
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="geo.region" content="IN-TN">
<meta name="geo.placename" content="Chennai">

<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:site_name" content="${esc(BUSINESS.name)}">
<meta property="og:locale" content="en_IN">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:alt" content="${esc(o.h1)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${img}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${o.depth}css/styles.css?v=56">
<link rel="stylesheet" href="${o.depth}css/seo.css?v=1">
<link rel="icon" href="${o.depth}images/logo/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="${o.depth}images/logo/favicon-180.png">
${jsonld({ '@context': 'https://schema.org', '@graph': graph })}
</head>
<body class="seo-page">

<header class="seo-hdr">
  <div class="wrap">
    <a href="${o.depth}" class="seo-brand">
      <img src="${o.depth}images/logo/toss-mark-96.png" alt="Toss Sports" width="34" height="34">
      <span>TOSS<em>.</em></span>
    </a>
    <nav class="seo-nav">
      <a href="${o.depth}tennis-ball-cricket-bats/">Bats</a>
      <a href="${o.depth}gully-cricket-bats/">Gully</a>
      <a href="${o.depth}guides/">Guides</a>
      <a href="${o.depth}cricket-bat-shop-chennai/">Chennai</a>
      <a href="${o.depth}#/shop" class="seo-cta">Shop</a>
    </nav>
  </div>
</header>

<main class="seo-main wrap">
${o.body}
</main>

<footer class="seo-ftr">
  <div class="wrap">
    <div>
      <b>${esc(BUSINESS.name)}</b>
      <p>${esc(BUSINESS.main.street)}, ${esc(BUSINESS.main.locality)} ${esc(BUSINESS.main.postal)}</p>
      <p><a href="tel:${BUSINESS.phones[0]}">${BUSINESS.phones[0]}</a> ·
         <a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a></p>
    </div>
    <div>
      <b>Toss The Turf</b>
      <p>${esc(BUSINESS.turf.street)}, ${esc(BUSINESS.turf.locality)} ${esc(BUSINESS.turf.postal)}</p>
      <p><a href="tel:${BUSINESS.phones[1]}">${BUSINESS.phones[1]}</a></p>
    </div>
    <div>
      <b>Guides</b>
      ${GUIDES.slice(0, 4).map(g =>
        `<p><a href="${o.depth}guides/${g.slug}/">${esc(g.h1)}</a></p>`).join('')}
    </div>
  </div>
  <div class="wrap seo-ftr-bot">
    <span>© ${new Date().getFullYear()} Toss Sports. Handcrafted in Chennai.</span>
    <span>Designed by TheVincis</span>
  </div>
</footer>

</body>
</html>`;
}

/* ---------- product pages ---------- */

function productSchema(p) {
  const s = {
    '@type': 'Product',
    '@id': SITE + '/product/' + p.id + '/#product',
    name: p.name,
    description: productDescription(p),
    sku: p.id,
    brand: { '@id': SITE + '/#organization' },
    manufacturer: { '@id': SITE + '/#organization' },
    category: 'Sporting Goods > Cricket > Cricket Bats',
    material: WOOD[p.wood] ? WOOD[p.wood].label : 'Wood',
    image: (p.images && p.images.length)
      ? p.images.map(i => (i.startsWith('http') ? i : SITE + '/' + i))
      : [SITE + '/images/hero/slide-1-1280.jpg'],
    additionalProperty: [
      prop('Wood', WOOD[p.wood] ? WOOD[p.wood].label : ''),
      prop('Profile', PROFILE[p.profile] ? PROFILE[p.profile].label : ''),
      prop('Weight', p.weight ? p.weight[0] + '–' + p.weight[1] + ' g' : ''),
      prop('Height', p.height ? p.height[0] + '–' + p.height[1] + ' inches' : ''),
      prop('Ball type', (p.ball || []).map(b =>
        b === 'soft' ? 'Soft tennis ball' : 'Medium/hard tennis ball').join(', ')),
      prop('Handle', p.handle), prop('Sweet spot', p.sweetSpot), prop('Finish', p.finish)
    ].filter(Boolean)
  };

  if (p.price != null) {
    s.offers = {
      '@type': 'Offer',
      url: SITE + '/product/' + p.id + '/',
      priceCurrency: 'INR',
      price: p.price,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': SITE + '/#organization' },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: p.price >= 1500 ? 0 : 99,
                        currency: 'INR' },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 6, unitCode: 'DAY' }
        }
      }
    };
  } else {
    s.offers = {
      '@type': 'Offer', url: SITE + '/product/' + p.id + '/',
      priceCurrency: 'INR', availability: 'https://schema.org/PreOrder',
      seller: { '@id': SITE + '/#organization' }
    };
  }

  /* Ratings are only declared where they are real. Inventing an
     aggregateRating is a manual-action risk, not a clever trick. */
  if (p.rating && p.reviews) {
    s.aggregateRating = {
      '@type': 'AggregateRating', ratingValue: p.rating,
      reviewCount: p.reviews, bestRating: 5, worstRating: 1
    };
  }
  return s;
}

function prop(name, value) {
  if (!value) return null;
  return { '@type': 'PropertyValue', name: name, value: String(value) };
}

function productDescription(p) {
  const wood = WOOD[p.wood] ? WOOD[p.wood].label : 'wood';
  const prof = PROFILE[p.profile] ? PROFILE[p.profile].label.toLowerCase() : 'standard';
  const ball = (p.ball || []).indexOf('medium') > -1
    ? 'soft and medium tennis balls' : 'the soft tennis ball';
  return `${p.name} — a handmade ${prof} tennis ball cricket bat in ${wood}, ` +
    `${p.weight ? p.weight[0] + '–' + p.weight[1] + 'g, ' : ''}built for ${ball}. ` +
    `Shaped in our own workshop in Chennai${p.price ? ' from ' + inr(p.price) : ''}.`;
}

function productPage(p) {
  const wood = WOOD[p.wood] ? WOOD[p.wood].label : '';
  const prof = PROFILE[p.profile] ? PROFILE[p.profile].label : '';
  /* Try the fullest title that fits, then drop parts in order of how
     little they cost us: the price first, then the wood, then the brand.
     The product NAME is the keyword on a product page, so it never goes. */
  const short = WOOD[p.wood] ? WOOD[p.wood].short : '';
  const title = firstThatFits([
    p.name + ' — ' + short + ' Tennis Ball Bat' + (p.price ? ' ' + inr(p.price) : ''),
    p.name + ' — ' + short + ' Tennis Ball Bat',
    p.name + ' — Tennis Ball Cricket Bat',
    p.name + ' — Tennis Ball Bat'
  ]);

  const specs = [
    ['Wood', wood], ['Profile', prof],
    ['Weight', p.weight ? p.weight[0] + '–' + p.weight[1] + ' g' : ''],
    ['Height', p.height ? p.height[0] + '–' + p.height[1] + ' inches' : ''],
    ['Ball type', (p.ball || []).map(b =>
      b === 'soft' ? 'Soft tennis ball' : 'Medium / hard tennis ball').join(' and ')],
    ['Handle', p.handle], ['Sweet spot', p.sweetSpot], ['Edge', p.edge],
    ['Finish', p.finish], ['Best for', p.usage], ['Warranty', p.warranty]
  ].filter(r => r[1]);

  const related = PRODUCTS
    .filter(x => x.id !== p.id && (x.profile === p.profile || x.wood === p.wood))
    .slice(0, 4);

  const body = `
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="../../">Home</a> / <a href="../../tennis-ball-cricket-bats/">Tennis ball bats</a> /
    <span>${esc(p.name)}</span>
  </nav>

  <article class="seo-product">
    <h1>${esc(p.name)}</h1>
    <p class="seo-lede">${esc(p.tagline || '')}</p>

    <div class="seo-price">
      ${p.price != null
        ? `<b>${inr(p.price)}</b>${p.mrp ? `<s>${inr(p.mrp)}</s>` : ''}
           <span>Inclusive of all taxes${p.price >= 1500 ? ' · Free shipping' : ''}</span>`
        : `<b>Price on request</b><span>Made to order — message us for today's price</span>`}
    </div>

    <p>${esc(productDescription(p))}</p>

    <div class="seo-actions">
      <a class="seo-btn" href="../../#/product/${p.id}">See photos and order</a>
      <a class="seo-btn ghost" href="https://wa.me/${BUSINESS.whatsapp}?text=${
        encodeURIComponent('Hi Toss Sports, I want to know about the ' + p.name)}"
        rel="nofollow">Ask on WhatsApp</a>
    </div>

    <h2>Specifications</h2>
    <table class="seo-specs">
      ${specs.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}
    </table>

    ${p.features && p.features.length ? `
      <h2>Why this bat</h2>
      <ul class="seo-list">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}

    <h2>Made in Chennai, not resold</h2>
    <p>This bat is pressed, profiled, seasoned and finished in our own unit at Nesapakkam,
      Chennai. We buy the clefts and shape them ourselves, which is why we can cut a bat to
      the weight you ask for and why the price has no distributor margin in it. Come and see
      the workshop, or ask us anything on WhatsApp before you pay.</p>

    ${related.length ? `
      <h2>Similar bats</h2>
      <ul class="seo-grid">
        ${related.map(r => `<li><a href="../${r.id}/">
          <b>${esc(r.name)}</b>
          <span>${r.price != null ? inr(r.price) : 'On request'}</span></a></li>`).join('')}
      </ul>` : ''}
  </article>`;

  return shell({
    path: '/product/' + p.id + '/', depth: '../../',
    title: title, h1: p.name, desc: fitDesc(productDescription(p)),
    ogType: 'product', body: body,
    image: (p.images && p.images[0]) ? (p.images[0].startsWith('http')
      ? p.images[0] : SITE + '/' + p.images[0]) : undefined,
    schema: [
      productSchema(p),
      breadcrumbs([
        { name: 'Home', url: '/' },
        { name: 'Tennis ball cricket bats', url: '/tennis-ball-cricket-bats/' },
        { name: p.name, url: '/product/' + p.id + '/' }
      ])
    ]
  });
}

/* ---------- category pages ---------- */

function categoryPage(slug, c) {
  const list = c.filter ? PRODUCTS.filter(c.filter) : [];
  const priced = list.filter(p => p.price != null);
  const from = priced.length ? Math.min(...priced.map(p => p.price)) : null;

  const body = `
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="../">Home</a> / <span>${esc(c.h1)}</span>
  </nav>

  <h1>${esc(c.h1)}</h1>
  <p class="seo-lede">${esc(c.intro)}</p>

  ${list.length ? `
    <ul class="seo-grid wide">
      ${list.map(p => `<li><a href="../product/${p.id}/">
        <b>${esc(p.name)}</b>
        <em>${esc(WOOD[p.wood] ? WOOD[p.wood].short : '')} ·
            ${esc(PROFILE[p.profile] ? PROFILE[p.profile].label : '')}</em>
        <span>${p.price != null ? inr(p.price) : 'On request'}</span></a></li>`).join('')}
    </ul>
    <p><a class="seo-btn" href="../#/shop">Filter and compare all ${PRODUCTS.length} bats</a></p>
  ` : ''}

  ${slug === 'cricket-bat-shop-chennai' ? chennaiBody() : ''}

  <h2>Common questions</h2>
  <div class="seo-faq">
    ${FAQS.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
  </div>

  <h2>Read next</h2>
  <ul class="seo-list">
    ${GUIDES.slice(0, 4).map(g =>
      `<li><a href="../guides/${g.slug}/">${esc(g.h1)}</a></li>`).join('')}
  </ul>`;

  const schema = [
    faqSchema(FAQS),
    breadcrumbs([{ name: 'Home', url: '/' }, { name: c.h1, url: '/' + slug + '/' }])
  ];

  if (list.length) {
    schema.push({
      '@type': 'ItemList',
      name: c.h1,
      numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({
        '@type': 'ListItem', position: i + 1,
        url: SITE + '/product/' + p.id + '/', name: p.name
      }))
    });
  }
  if (slug === 'cricket-bat-shop-chennai') schema.push(STORE, TURF);

  return shell({
    path: '/' + slug + '/', depth: '../',
    title: fitTitle(c.title), h1: c.h1,
    desc: fitDesc(c.desc), keywords: [c.head].concat(c.also),
    body: body, schema: schema
  });
}

function chennaiBody() {
  return `
  <h2>Where to find us</h2>
  <div class="seo-places">
    <div>
      <h3>The workshop — Nesapakkam</h3>
      <p>${esc(BUSINESS.main.street)}<br>${esc(BUSINESS.main.locality)},
         ${esc(BUSINESS.main.region)} ${esc(BUSINESS.main.postal)}</p>
      <p><a href="tel:${BUSINESS.phones[0]}">${BUSINESS.phones[0]}</a></p>
      <p>Where the bats are actually made. Come and pick your weight.</p>
    </div>
    <div>
      <h3>Toss The Turf — Kolathur</h3>
      <p>${esc(BUSINESS.turf.street)}<br>${esc(BUSINESS.turf.locality)},
         ${esc(BUSINESS.turf.region)} ${esc(BUSINESS.turf.postal)}</p>
      <p><a href="tel:${BUSINESS.phones[1]}">${BUSINESS.phones[1]}</a></p>
      <p>Our cricket turf on the north side — book the ground, and buy a bat while you are there.</p>
    </div>
  </div>`;
}

/* ---------- guides ---------- */

function guidePage(g) {
  const body = `
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="../../">Home</a> / <a href="../">Guides</a> / <span>${esc(g.h1)}</span>
  </nav>

  <article class="seo-article">
    <h1>${esc(g.h1)}</h1>

    <!-- The answer first, in full, because this is the passage an AI
         engine or a featured snippet lifts. Everything below is evidence. -->
    <p class="seo-answer">${esc(g.answer)}</p>

    ${g.sections.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join('')}

    <div class="seo-author">
      <p><b>Written by the Toss Sports workshop, Chennai.</b> We have been shaping
        tennis ball cricket bats in Nesapakkam since ${BUSINESS.founded}, and everything
        above comes from making and replacing them, not from a catalogue.</p>
      <p><a class="seo-btn" href="../../tennis-ball-cricket-bats/">See the bats</a>
         <a class="seo-btn ghost" href="https://wa.me/${BUSINESS.whatsapp}" rel="nofollow">Ask us directly</a></p>
    </div>
  </article>

  <h2>More guides</h2>
  <ul class="seo-list">
    ${GUIDES.filter(x => x.slug !== g.slug).map(x =>
      `<li><a href="../${x.slug}/">${esc(x.h1)}</a></li>`).join('')}
  </ul>`;

  return shell({
    path: '/guides/' + g.slug + '/', depth: '../../',
    title: fitTitle(g.title), h1: g.h1, desc: fitDesc(g.desc),
    keywords: g.keywords, ogType: 'article', body: body,
    schema: [
      {
        '@type': 'Article',
        '@id': SITE + '/guides/' + g.slug + '/#article',
        headline: g.title,
        description: g.desc,
        author: { '@id': SITE + '/#organization' },
        publisher: { '@id': SITE + '/#organization' },
        inLanguage: 'en-IN',
        datePublished: '2026-08-18',
        dateModified: new Date().toISOString().slice(0, 10),
        mainEntityOfPage: SITE + '/guides/' + g.slug + '/'
      },
      /* the question this page exists to answer, in its own block */
      faqSchema([[g.h1, g.answer]]),
      breadcrumbs([
        { name: 'Home', url: '/' }, { name: 'Guides', url: '/guides/' },
        { name: g.h1, url: '/guides/' + g.slug + '/' }
      ])
    ]
  });
}

function guideIndex() {
  const body = `
  <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Home</a> / <span>Guides</span></nav>
  <h1>Tennis ball cricket bat guides</h1>
  <p class="seo-lede">Straight answers from the workshop — what to buy, what weight,
    which wood, and how to make a bat last. No sales pitch, just what we would tell
    you across the counter.</p>
  <ul class="seo-grid wide">
    ${GUIDES.map(g => `<li><a href="${g.slug}/">
      <b>${esc(g.h1)}</b><em>${esc(g.desc)}</em></a></li>`).join('')}
  </ul>`;

  return shell({
    path: '/guides/', depth: '../',
    title: fitTitle('Cricket Bat Guides — What to Buy and Why'),
    h1: 'Tennis ball cricket bat guides',
    desc: fitDesc('Straight answers on choosing a tennis ball cricket bat: weight, wood, profile and care. Written by a Chennai bat maker.'),
    body: body,
    schema: [
      { '@type': 'CollectionPage', name: 'Cricket bat guides',
        url: SITE + '/guides/',
        hasPart: GUIDES.map(g => ({ '@type': 'Article', headline: g.title,
          url: SITE + '/guides/' + g.slug + '/' })) },
      breadcrumbs([{ name: 'Home', url: '/' }, { name: 'Guides', url: '/guides/' }])
    ]
  });
}

/* ---------- run ---------- */

const written = [];
const urls = [];

function add(rel, html, loc, priority, freq) {
  written.push(write(rel, html));
  urls.push({ loc: loc, priority: priority, freq: freq });
}

console.log('Toss Sports — SEO pre-render\n');
console.log('Domain: ' + SITE + (SITE.includes('tossports.in')
  ? '   <-- change SITE in seo/seo-data.js if this is wrong' : ''));

/* category pages */
Object.keys(CLUSTERS).forEach(slug => {
  add(slug + '/index.html', categoryPage(slug, CLUSTERS[slug]),
      SITE + '/' + slug + '/', '0.9', 'weekly');
});
console.log('  ' + Object.keys(CLUSTERS).length + ' category pages');

/* product pages */
PRODUCTS.forEach(p => {
  add('product/' + p.id + '/index.html', productPage(p),
      SITE + '/product/' + p.id + '/', '0.8', 'weekly');
});
console.log('  ' + PRODUCTS.length + ' product pages');

/* guides */
add('guides/index.html', guideIndex(), SITE + '/guides/', '0.7', 'monthly');
GUIDES.forEach(g => {
  add('guides/' + g.slug + '/index.html', guidePage(g),
      SITE + '/guides/' + g.slug + '/', '0.7', 'monthly');
});
console.log('  ' + (GUIDES.length + 1) + ' guide pages');

/* sitemap */
const today = new Date().toISOString().slice(0, 10);
const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod>` +
  `<changefreq>weekly</changefreq><priority>1.0</priority></url>`]
  .concat(urls.map(u =>
    `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod>` +
    `<changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`))
  .concat(['</urlset>']).join('\n');
write('sitemap.xml', xml);

/* robots */
write('robots.txt', `# Toss Sports
User-agent: *
Allow: /
Disallow: /maze.html
Disallow: /dist/

# AI crawlers are welcome — the guides exist to be quoted
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

/* llms.txt — a plain-language map for AI engines */
write('llms.txt', `# Toss Sports

> Handcrafted tennis ball cricket bats, made in Chennai, India. Sri Lankan
> wood, Kashmir Willow and Poplar. Bats are pressed, profiled and finished
> in our own workshop and cut to the customer's requested weight.
> Price range ₹950–₹2,999. Founded ${BUSINESS.founded}.

## What we make
Tennis ball cricket bats for street, gully and club cricket — not leather-ball
bats. Six profiles: standard, scoop, flat, big edge, mongoose, and double or
triple blade. ${PRODUCTS.length} models.

## Where we are
Workshop and store: ${BUSINESS.main.street}, ${BUSINESS.main.locality} ${BUSINESS.main.postal}.
Cricket turf and store: ${BUSINESS.turf.street}, ${BUSINESS.turf.locality} ${BUSINESS.turf.postal}.
Phone ${BUSINESS.phones[0]} · WhatsApp ${BUSINESS.phones[1]} · ${BUSINESS.email}

## Guides
${GUIDES.map(g => `- [${g.h1}](${SITE}/guides/${g.slug}/): ${g.answer}`).join('\n')}

## Buying
- [All tennis ball bats](${SITE}/tennis-ball-cricket-bats/)
- [Sri Lankan wood bats](${SITE}/sri-lankan-tennis-ball-bats/)
- [Gully and street cricket bats](${SITE}/gully-cricket-bats/)
- [Bats under ₹1,500](${SITE}/cricket-bats-under-1500/)
- [Visit in Chennai](${SITE}/cricket-bat-shop-chennai/)
`);

console.log('  sitemap.xml, robots.txt, llms.txt');
console.log('\nWrote ' + (written.length + 3) + ' files to ' +
  (INPLACE ? 'the project root' : 'dist/'));
console.log('\nUpload alongside the existing site, keeping the folder structure.');
