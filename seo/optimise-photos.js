#!/usr/bin/env node
/**
 * TOSS SPORTS — batch photo optimiser
 *
 * Takes the raw photography in Products/ and writes web-ready versions
 * into images/product/, in the same three sizes the Maze Room produces
 * for new uploads, so a photo taken today and a photo taken last month
 * behave identically on the site.
 *
 *   node seo/optimise-photos.js            report only, changes nothing
 *   node seo/optimise-photos.js --write     actually write the files
 *   node seo/optimise-photos.js --write --map   also print the product wiring
 *
 * Originals are never touched.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'Products');
const OUT = path.join(ROOT, 'images/product');
const WRITE = process.argv.includes('--write');
const MAP = process.argv.includes('--map');

/* the same ladder the browser uses in maze.js */
const SIZES = [
  { w: 1600, tag: 'lg', q: 82 },
  { w: 800,  tag: 'md', q: 82 },
  { w: 320,  tag: 'sm', q: 80 }
];

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('This script needs sharp:\n  npm install sharp\n');
  process.exit(1);
}

/** Folder name in Products/ -> product id in js/products.js */
const FOLDER_TO_PRODUCT = {
  'powerx': 'power-x',
  'srilankan mri': 'sri-lankan-mri',
  'srilankan varnished bat': 'varnished-bat',
  'leather ball bat': 'leather-ball-bat',
  'graphic bats hard tennis': null      /* generic — used as gallery filler */
};

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(jpe?g|png|webp)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

(async function main() {
  const files = walk(SRC);
  if (!files.length) {
    console.log('Nothing found in Products/ — put the photos there and re-run.');
    return;
  }

  console.log('Toss Sports — photo optimiser');
  console.log(WRITE ? 'Writing to images/product/\n' : 'DRY RUN — add --write to make changes\n');

  let before = 0, after = 0, made = 0;
  const byProduct = {};

  for (const file of files) {
    const rel = path.relative(SRC, file);
    const folder = path.dirname(rel).split(path.sep).pop().toLowerCase();
    const productId = FOLDER_TO_PRODUCT[folder];
    const stat = fs.statSync(file);
    before += stat.size;

    const base = (productId || slug(folder)) + '-' +
      slug(path.basename(file, path.extname(file)));

    let meta;
    try { meta = await sharp(file).metadata(); }
    catch (e) { console.log('  skip (unreadable): ' + rel); continue; }

    const written = [];
    for (const s of SIZES) {
      /* never upscale — a 900px original does not get a 1600px file */
      if (meta.width < s.w && s.tag === 'lg' && written.length) continue;
      const name = `${base}-${s.tag}.webp`;
      const dest = path.join(OUT, name);
      if (WRITE) {
        fs.mkdirSync(OUT, { recursive: true });
        await sharp(file)
          .resize({ width: Math.min(s.w, meta.width), withoutEnlargement: true })
          /* product shots are on white; flatten so any alpha does not
             become black in a format without transparency */
          .flatten({ background: '#ffffff' })
          .webp({ quality: s.q })
          .toFile(dest);
        after += fs.statSync(dest).size;
      } else {
        /* estimate for the dry run so the report is still useful */
        after += Math.round(stat.size * (s.w / Math.max(meta.width, 1)) * 0.18);
      }
      written.push(name);
      made++;
    }

    if (productId) {
      (byProduct[productId] = byProduct[productId] || [])
        .push('images/product/' + base + '-md.webp');
    }

    console.log(`  ${rel}`);
    console.log(`    ${meta.width}x${meta.height}, ${Math.round(stat.size / 1024)}KB` +
      ` -> ${written.length} sizes`);
  }

  const pct = before ? Math.round((before - after) / before * 100) : 0;
  console.log(`\n${files.length} photos -> ${made} files`);
  console.log(`${Math.round(before / 1024 / 1024 * 10) / 10}MB -> ` +
    `${Math.round(after / 1024 / 1024 * 10) / 10}MB  (${pct}% smaller)`);

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to produce the files.');
    return;
  }

  if (MAP || Object.keys(byProduct).length) {
    console.log('\n--- Paste into the Maze Room product editor (Photos box) ---');
    Object.keys(byProduct).forEach(id => {
      console.log('\n' + id + ':');
      byProduct[id].forEach(u => console.log('  ' + u));
    });
    console.log('\nOr open each product in Products -> Edit and paste its lines');
    console.log('into the photo URL box, then Save.');
  }
})();
