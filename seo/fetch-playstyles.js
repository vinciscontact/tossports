#!/usr/bin/env node
/**
 * TOSS SPORTS — PULL THE CURATED PLAY-STYLE TAGS
 *
 * The static build cannot reach the database, so by default it re-derives
 * play-style tags from each bat's specs. That is right on day one, when the
 * migration seeded exactly those tags — and wrong the moment somebody opens
 * the Maze Room and decides the Swagger is not really a beginner's bat.
 *
 * This writes what the database actually holds into
 * seo/playstyle-tags.json, which build-seo.js then prefers.
 *
 *   node seo/fetch-playstyles.js      → refresh the file
 *   node seo/build-seo.js             → build using it
 *
 * Reads nothing private: playstyles and product_playstyles are public-read
 * by design in sql/017, because they are the marketing copy itself. The
 * publishable key is the same one index.html already ships.
 *
 * Safe to skip. If it fails — no network, tables not created yet — it says
 * so, changes nothing, and the build carries on with the derived rules.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(__dirname, 'playstyle-tags.json');

/* Lifted from js/config.js rather than duplicated by hand, so rotating the
   key or moving the project never leaves this file pointing somewhere stale. */
function creds() {
  const src = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const url = /const\s+SUPA_URL\s*=\s*'([^']+)'/.exec(src);
  const key = /const\s+SUPA_KEY\s*=\s*'([^']+)'/.exec(src);
  if (!url || !key) throw new Error('Could not read SUPA_URL / SUPA_KEY from js/config.js');
  return { url: url[1], key: key[1] };
}

async function get(base, key, q) {
  const res = await fetch(base + '/rest/v1/' + q, {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const e = new Error(res.status + ' ' + res.statusText + ' — ' + body.slice(0, 160));
    e.status = res.status;
    throw e;
  }
  return res.json();
}

(async () => {
  console.log('Toss Sports — fetching curated play-style tags\n');
  let c;
  try { c = creds(); } catch (e) { console.error('  ' + e.message); process.exit(1); }

  let styles, links;
  try {
    [styles, links] = await Promise.all([
      get(c.url, c.key, 'playstyles?select=id,name,group_id,active&order=sort.asc'),
      get(c.url, c.key, 'product_playstyles?select=product_id,playstyle_id')
    ]);
  } catch (e) {
    if (e.status === 404) {
      console.error('  The play-style tables are not in the database yet.');
      console.error('  Run sql/017-playstyles.sql in the Supabase SQL editor first.');
    } else {
      console.error('  Could not reach Supabase: ' + e.message);
    }
    console.error('\n  Nothing written. `node seo/build-seo.js` will still work —');
    console.error('  it falls back to deriving tags from each bat\'s specs.');
    process.exit(1);
  }

  /* A retired style should stop having a page, not keep one nobody can
     reach from the shop. Filtering here rather than in the build keeps the
     rule in one place. */
  const live = new Set(styles.filter(s => s.active !== false).map(s => s.id));
  const tags = {};
  links.forEach(r => {
    if (!live.has(r.playstyle_id)) return;
    (tags[r.product_id] = tags[r.product_id] || []).push(r.playstyle_id);
  });

  fs.writeFileSync(OUT, JSON.stringify({
    fetched_at: new Date().toISOString().slice(0, 10),
    source: c.url,
    tags
  }, null, 2) + '\n');

  const per = {};
  Object.values(tags).flat().forEach(s => { per[s] = (per[s] || 0) + 1; });
  console.log('  ' + Object.keys(tags).length + ' products tagged across ' +
              live.size + ' live styles');
  styles.filter(s => live.has(s.id)).forEach(s =>
    console.log('    ' + (s.name + '              ').slice(0, 14) + (per[s.id] || 0) + ' bats'));
  console.log('\nWrote ' + path.relative(ROOT, OUT));
  console.log('Now run: node seo/build-seo.js');
})();
