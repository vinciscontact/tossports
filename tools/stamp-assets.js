#!/usr/bin/env node
/* ============================================================
   TOSS SPORTS — STAMP ASSET VERSIONS

   Rewrites every `?v=` on a local css/js link in index.html and
   maze.html to a short hash of that file's actual bytes.

   WHY THIS EXISTS
   ---------------
   Those version numbers were bumped by hand, and twice that has
   silently broken the live site:

     · css/seo.css sat at ?v=1 for the life of the site while the
       file changed underneath it. Every returning visitor held a
       stylesheet from before the contact form had any styling,
       so the form rendered as raw HTML — white boxes, labels
       inline — while the correct CSS sat on the server unread.

     · js/maze-ops.js was edited to add the Enquiries tab and its
       version was not bumped. The file on the server was right;
       maze.html asked for ?v=37, which every staff browser
       already had cached, so the tab simply never appeared.

   Both were invisible locally, because a fresh browser has
   nothing cached and shows the new file either way. That is the
   nasty part: the bug only exists for people who have visited
   before — which, on a live site, is everyone who matters.

   A hash cannot be forgotten. Change a file and its URL changes;
   leave it alone and returning visitors keep their cached copy,
   which is the whole point of the query string.

   Run it after editing any css/js, before uploading:

     node tools/stamp-assets.js

   Prints what moved and leaves everything else alone, so running
   it twice in a row is a no-op.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'maze.html'];

/* Eight hex characters. Long enough that two different files will not
   collide in any catalogue this size, short enough to read in devtools. */
function hashOf(rel) {
  return crypto.createHash('sha1')
    .update(fs.readFileSync(path.join(ROOT, rel)))
    .digest('hex').slice(0, 8);
}

let moved = 0, checked = 0, missing = 0;

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');

  /* Only local css/ and js/ assets. An absolute URL or a CDN link has no
     file here to hash and must be left exactly as it is. */
  const after = before.replace(
    /((?:href|src)=")((?:css|js)\/[A-Za-z0-9._-]+\.(?:css|js))\?v=([A-Za-z0-9]+)(")/g,
    (whole, lead, rel, oldV, tail) => {
      if (!fs.existsSync(path.join(ROOT, rel))) {
        console.log('  ! ' + rel + ' is linked but not on disk — left at ?v=' + oldV);
        missing++;
        return whole;
      }
      checked++;
      const v = hashOf(rel);
      if (v === oldV) return whole;
      console.log('  ' + rel + '  ' + oldV + ' -> ' + v);
      moved++;
      return lead + rel + '?v=' + v + tail;
    }
  );

  if (after !== before) fs.writeFileSync(file, after);
}

console.log(
  '\n' + checked + ' asset links checked, ' + moved + ' restamped' +
  (missing ? ', ' + missing + ' missing' : '') + '.'
);
if (!moved) console.log('Nothing changed — every version already matches its file.');
