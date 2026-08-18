#!/usr/bin/env node
/**
 * TOSS SPORTS v2 — BUILD
 *
 * Assembles v2-appsscript/web/ from the v1 interface plus the v2 data
 * layer. The UI is COPIED, not forked: v1 stays the single source of
 * truth for how the site looks and behaves, and this script re-points it
 * at Apps Script. Fix a bug in v1 and re-run this to carry it across.
 *
 * It also BAKES the catalogue into a JS file, which is the reason the
 * shop loads instantly and costs no Apps Script quota per visitor.
 *
 *   node build.js --public <url> --internal <url>
 *   node build.js --public <url> --internal <url> --pull   (fetch live data first)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const V1 = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'web');

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PUBLIC_URL   = arg('public', '');
const INTERNAL_URL = arg('internal', '');
const PULL = argv.includes('--pull');

/* Files copied verbatim from v1. config.js and store-sync.js are the two
   deliberately absent: toss-api.js replaces both. */
const COPY = [
  'index.html', 'maze.html',
  'css/styles.css', 'css/maze.css',
  'js/products.js', 'js/art.js', 'js/game.js', 'js/nav-play.js',
  'js/chatbot.js', 'js/app.js',
  'js/maze.js', 'js/maze-ops.js', 'js/maze-bill.js', 'js/maze-export.js'
];

const COPY_DIRS = ['images'];

function copyFile(rel) {
  const from = path.join(V1, rel);
  const to = path.join(OUT, rel);
  if (!fs.existsSync(from)) { console.warn('  skip (missing): ' + rel); return false; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

function copyDir(rel) {
  const from = path.join(V1, rel);
  if (!fs.existsSync(from)) return;
  const to = path.join(OUT, rel);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const r = path.join(rel, entry.name);
    if (entry.isDirectory()) copyDir(r);
    else copyFile(r);
  }
}

/* ---------- bake the catalogue ---------- */

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.headers.location) {
        return resolve(get(res.headers.location));      /* Apps Script redirects */
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Bad response: ' + body.slice(0, 120))); }
      });
    }).on('error', reject);
  });
}

async function bakeCatalogue() {
  let products = null, categories = null;

  if (PULL && PUBLIC_URL) {
    try {
      console.log('  pulling live catalogue…');
      const r = await get(PUBLIC_URL + '?action=catalogue');
      if (r && r.ok && r.data) { products = r.data.products; categories = r.data.categories; }
    } catch (e) {
      console.warn('  could not pull (' + e.message + ') — baking from js/products.js instead');
    }
  }

  const header = `/* Baked at ${new Date().toISOString()} by build.js.
   The shop renders from this instantly, then quietly refreshes from
   Apps Script. Re-run the build after a price change to refresh it. */\n`;

  if (products && products.length) {
    fs.writeFileSync(path.join(OUT, 'js/baked.js'),
      header +
      'const BAKED_CATEGORIES = ' + JSON.stringify(categories || [], null, 1) + ';\n' +
      'const PRODUCTS = ' + JSON.stringify(products, null, 1) + ';\n');
    console.log('  baked ' + products.length + ' products from the live sheet');
    /* products.js would redeclare PRODUCTS — drop it from the build */
    fs.rmSync(path.join(OUT, 'js/products.js'), { force: true });
    return { baked: products.length, source: 'sheet' };
  }

  /* fall back to v1's bundled catalogue, which already defines PRODUCTS */
  fs.writeFileSync(path.join(OUT, 'js/baked.js'),
    header + 'const BAKED_CATEGORIES = [{ id: "bats", name: "Bats", sort: 0 }];\n');
  console.log('  using the bundled js/products.js as the baked catalogue');
  return { baked: 0, source: 'bundled' };
}

/* ---------- rewrite the html ---------- */

function wireHtml(file, baked) {
  const p = path.join(OUT, file);
  if (!fs.existsSync(p)) return;
  let html = fs.readFileSync(p, 'utf8');

  /* swap the v1 data layer for the v2 one */
  html = html
    .replace(/<script src="js\/config\.js[^"]*"><\/script>\s*/g, '')
    .replace(/<script src="js\/store-sync\.js[^"]*"><\/script>\s*/g, '');

  const tag = '<script src="js/baked.js?v=' + Date.now() + '"></script>\n' +
              '<script src="js/toss-api.js?v=' + Date.now() + '"></script>';

  if (file === 'index.html') {
    /* PRODUCTS has to exist before app.js runs, and it comes from exactly
       one of two places:
         · baked from the sheet  → baked.js defines it, products.js is gone
         · bundled fallback      → products.js still defines it, so it must
                                   STAY on the page and load first
       Replacing the products.js tag in both cases is what left the shop
       with an empty catalogue on the first build. */
    if (baked.source === 'sheet') {
      html = html.replace(/<script src="js\/products\.js[^"]*"><\/script>/, tag);
    } else {
      html = html.replace(/(<script src="js\/products\.js[^"]*"><\/script>)/,
        '$1\n' + tag);
    }
    if (!html.includes('js/toss-api.js')) {
      html = html.replace(/<script src="js\/app\.js/, tag + '\n<script src="js/app.js');
    }
  } else {
    /* the panel needs the API before maze.js boots */
    html = html
      .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs[^"]*"><\/script>\s*/g, '')
      .replace(/<script src="js\/maze-export\.js/, tag + '\n<script src="js/maze-export.js');
  }

  fs.writeFileSync(p, html);
}

/* ---------- go ---------- */

(async function main() {
  console.log('Toss Sports v2 — build\n');

  if (!PUBLIC_URL || !INTERNAL_URL) {
    console.log('Usage:\n  node build.js --public <public web app url> --internal <internal web app url> [--pull]\n');
    console.log('Deploy the Apps Script twice first (see README), then paste both URLs here.\n');
    if (!argv.includes('--force')) process.exit(1);
  }

  console.log('Copying the v1 interface…');
  /* Windows holds a handle on a folder being served or open in Explorer,
     so a plain rmSync throws EPERM. Retry, then fall back to overwriting
     in place rather than failing the build. */
  try {
    fs.rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    console.warn('  could not clear web/ (' + e.code + ') — overwriting in place.');
    console.warn('  stop any server on that folder if you want a clean build.');
  }
  fs.mkdirSync(OUT, { recursive: true });
  COPY.forEach(copyFile);
  COPY_DIRS.forEach(copyDir);

  console.log('Installing the v2 data layer…');
  let api = fs.readFileSync(path.join(__dirname, 'web-overlay/toss-api.js'), 'utf8');
  api = api
    .replace("'PUBLIC_WEB_APP_URL'", JSON.stringify(PUBLIC_URL))
    .replace("'INTERNAL_WEB_APP_URL'", JSON.stringify(INTERNAL_URL));
  fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'js/toss-api.js'), api);

  console.log('Baking the catalogue…');
  const baked = await bakeCatalogue();

  console.log('Rewiring the pages…');
  wireHtml('index.html', baked);
  wireHtml('maze.html', baked);

  /* the catalogue must reach the browser one way or the other */
  const idx = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const bakedJs = fs.readFileSync(path.join(OUT, 'js/baked.js'), 'utf8');
  const definesProducts = /const PRODUCTS\s*=/.test(bakedJs) || idx.includes('js/products.js');
  if (!definesProducts) {
    throw new Error('Build is broken: nothing on the page defines PRODUCTS.');
  }

  const files = (function count(dir) {
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      n += e.isDirectory() ? count(path.join(dir, e.name)) : 1;
    }
    return n;
  })(OUT);

  console.log('\nDone — ' + files + ' files in v2-appsscript/web/');
  console.log('Catalogue source: ' + baked.source);
  console.log('\nServe it with:  npx serve v2-appsscript/web -l 4322');
})();
