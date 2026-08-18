/* ============================================================
   TOSS — studio background knockout

   Product photos are shot on a seamless white sweep, so ~88% of
   each frame is empty backdrop. Dropped straight onto the site
   that reads as a white card sitting on a dark section, with a
   small bat marooned in the middle of it.

   This makes a companion "-cut" file per photo: background gone,
   transparent margin trimmed away, so the bat floats and fills
   its box the way the drawn art it replaces always did. The
   original stays untouched — the product gallery still wants the
   honest studio shot on its white plate.

   The knockout is a flood fill inward from the border, NOT a
   "delete every white pixel" pass. Kashmir willow is very pale
   and the blade carries near-white specular highlights; keying
   on colour alone punches holes straight through the bat. Only
   backdrop that is actually connected to the edge is removed.

     node seo/cutout-photos.js          # report
     node seo/cutout-photos.js --write  # write the -cut files
   ============================================================ */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'images', 'product');
const WRITE = process.argv.includes('--write');

/* How far from pure white still counts as backdrop. Generous enough for
   sweep shadow and JPEG mush at the seam, tight enough that the palest
   poplar blade (~232) is never eaten. */
const TOL = 30;

/* Pixels are only cleared if the fill can walk to them from the frame
   edge, which is what protects highlights enclosed by the bat. */
function backdropMask(data, w, h, ch) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  const near = i => {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2];
    return r >= 255 - TOL && g >= 255 - TOL && b >= 255 - TOL;
  };
  const push = i => { if (!seen[i] && near(i)) { seen[i] = 1; stack.push(i); } };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0)     push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0)     push(i - w);
    if (y < h - 1) push(i + w);
  }
  return seen;
}

/* A hard mask leaves a stair-stepped edge that looks cheap at large
   sizes. Any pixel touching both states gets part alpha, which is
   enough to read as a clean cut. */
function feather(mask, w, h) {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) a[i] = mask[i] ? 0 : 255;
  const out = a.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (a[i] !== 255) continue;
      if (!a[i - 1] || !a[i + 1] || !a[i - w] || !a[i + w]) out[i] = 150;
    }
  }
  return out;
}

async function cut(file) {
  const src = path.join(DIR, file);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const mask = backdropMask(data, w, h, ch);
  let cleared = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) cleared++;
  const share = cleared / (w * h);

  /* If almost nothing was connected to the edge the shot is not a white
     sweep at all — an action photo, a lifestyle frame — and knocking it
     out would be wrong. Leave those alone rather than guess. */
  if (share < 0.15) return { file, skipped: 'not a white-sweep shot', share };

  const alpha = feather(mask, w, h);
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4]     = data[i * ch];
    out[i * 4 + 1] = data[i * ch + 1];
    out[i * 4 + 2] = data[i * ch + 2];
    out[i * 4 + 3] = alpha[i];
  }

  const dest = src.replace(/(-(?:lg|md|sm))?\.webp$/, '$1-cut.webp');
  const img = sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })                 // drop the now-empty margin
    .webp({ quality: 88, alphaQuality: 90 });

  const meta = await img.clone().metadata().catch(() => null);
  if (WRITE) await img.toFile(dest);
  const after = WRITE ? fs.statSync(dest).size : 0;

  return {
    file, wrote: WRITE ? path.basename(dest) : '(dry run)',
    backdropRemoved: (share * 100).toFixed(0) + '%',
    from: `${w}x${h}`, kb: after ? Math.round(after / 1024) + 'kB' : '-'
  };
}

(async () => {
  const files = fs.readdirSync(DIR)
    .filter(f => /\.webp$/.test(f) && !/-cut\.webp$/.test(f));

  const done = [];
  for (const f of files) {
    try { done.push(await cut(f)); }
    catch (e) { done.push({ file: f, error: e.message }); }
  }

  const made    = done.filter(d => d.backdropRemoved);
  const skipped = done.filter(d => d.skipped);
  const failed  = done.filter(d => d.error);

  made.forEach(d => console.log(`  cut  ${d.file}  (${d.backdropRemoved} backdrop)  ${d.kb}`));
  skipped.forEach(d => console.log(`  keep ${d.file}  — ${d.skipped}`));
  failed.forEach(d => console.log(`  FAIL ${d.file}  — ${d.error}`));

  console.log(`\n${made.length} cut, ${skipped.length} left alone, ${failed.length} failed`);
  if (!WRITE) console.log('Dry run. Re-run with --write to save.');
})();
