#!/usr/bin/env node
/**
 * Builds sql/COMPLETE-SCHEMA.sql by concatenating the migrations in order.
 *
 * Generated rather than hand-maintained on purpose. A consolidated file
 * written by hand drifts the moment someone edits a migration and forgets
 * it exists, and the drift is invisible until a fresh database comes out
 * different from every other one.
 *
 *   node sql/build.js
 *
 * The handover scripts (014, 015) are deliberately excluded. They delete
 * data and replace the team; nothing that destructive belongs in a file
 * whose name invites running the whole thing.
 */

const fs = require('fs');
const path = require('path');
const DIR = __dirname;

/* Order is the order they were written and the order they must run.
   schema.sql is the base — there is no 001. */
const ORDER = [
  ['schema.sql',              'Core tables, RLS, and the 29-bat catalogue'],
  ['002-operations.sql',      'Staff, attendance, tasks, SOPs, payroll'],
  ['003-claim-by-email.sql',  'claim_staff() — binds a login to a staff row by email'],
  ['004-repair-roles.sql',    'Repairs role data left behind by the early admins table'],
  ['005-billing.sql',         'Invoices, GST, per-financial-year numbering'],
  ['006-stock-and-photos.sql','Stock counts and the product photo bucket'],
  ['007-categories.sql',      'Product categories'],
  ['008-access-control.sql',  'Founder role, settings lock, append-only audit log'],
  ['009-branches.sql',        'Second branch, per-branch stock and transfers'],
  ['010-analytics.sql',       'P&L, product performance, dead stock, loyalty views'],
  ['011-services.sql',        'Requests, product Q&A, order tracking'],
  ['012-fulfilment.sql',      'Stock decrement on order, courier and tracking fields'],
  ['013-supabase-auth.sql',   'Moves logins from Firebase to Supabase Auth']
];

const missing = ORDER.filter(([f]) => !fs.existsSync(path.join(DIR, f)));
if (missing.length) {
  console.error('Missing migration(s): ' + missing.map(m => m[0]).join(', '));
  process.exit(1);
}

/* Anything here would break when the files are joined into one run. */
const HAZARDS = [
  [/^\s*(begin|commit|rollback)\s*;/im, 'explicit transaction control'],
  [/^\s*\\/m,                            'psql meta-command']
];

/* ------------------------------------------------------------
   Catch the one mistake this file cannot survive.

   CREATE OR REPLACE FUNCTION cannot change a function's return
   type. If migration A defines f() returning one shape and
   migration B redefines it with another, B must DROP first — and
   so must A, or re-running the set against a database already at
   B fails with "cannot change return type of existing function".

   That is exactly how COMPLETE-SCHEMA broke: 012 widened
   track_order to carry courier columns and dropped correctly,
   011 did not, so any re-run after 012 died at section 11.

   This walks every function defined more than once, compares the
   full RETURNS clause, and refuses to build if two definitions
   disagree without a drop guarding them.
   ------------------------------------------------------------ */
function checkReturnTypes(order, dir) {
  const seen = {};
  order.forEach(([file]) => {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const re = /create or replace function\s+(?:public\.)?([a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\blanguage\b/gi;
    let m;
    while ((m = re.exec(sql))) {
      const name = m[1];
      const arity = m[2].trim() === '' ? 0 : m[2].split(',').length;
      const returns = (m[3].match(/returns([\s\S]*)/i) || ['', ''])[1]
        .replace(/\s+/g, ' ').trim().toLowerCase();
      const hasDrop = new RegExp('drop\\s+function\\s+if\\s+exists\\s+(public\\.)?' + name, 'i').test(sql);
      const key = name + '/' + arity;
      (seen[key] = seen[key] || []).push({ file, returns, hasDrop });
    }
  });

  const problems = [];
  Object.entries(seen).forEach(([key, defs]) => {
    if (defs.length < 2) return;
    const shapes = new Set(defs.map(d => d.returns));
    if (shapes.size < 2) return;                    // same shape every time, fine
    const undropped = defs.filter(d => !d.hasDrop);
    if (undropped.length) {
      problems.push(key + ' changes return type but ' +
        undropped.map(d => d.file).join(', ') + ' has no "drop function if exists"');
    }
  });
  return problems;
}

const returnProblems = checkReturnTypes(ORDER, DIR);
if (returnProblems.length) {
  console.error('Refusing to build — a function changes shape without a drop:');
  returnProblems.forEach(p => console.error('  ' + p));
  process.exit(1);
}

const parts = [];
let hazardFound = false;

ORDER.forEach(([file, blurb], i) => {
  const body = fs.readFileSync(path.join(DIR, file), 'utf8').trimEnd();
  HAZARDS.forEach(([re, why]) => {
    if (re.test(body)) { console.error(`${file}: ${why} — cannot be concatenated safely`); hazardFound = true; }
  });
  const n = String(i + 1).padStart(2, '0');
  parts.push(
`-- ############################################################
-- #  ${n}. ${file}
-- #  ${blurb}
-- ############################################################

${body}
`);
});

if (hazardFound) process.exit(1);

const header =
`-- ============================================================
--  TOSS SPORTS — COMPLETE SCHEMA
--
--  Every migration, in order, in one file. Paste the whole thing
--  into the Supabase SQL editor and run it once.
--
--  GENERATED FILE — do not edit. Change a migration and rebuild:
--      node sql/build.js
--
--  Safe to re-run. Every statement is written to be idempotent:
--  create table if not exists, drop policy if exists before
--  create policy, create or replace function. Running it twice
--  leaves the same database, not a broken one.
--
--  NOT included, on purpose:
--    014-handover-reset.sql     deletes all transactional data
--    015-handover-accounts.sql  replaces the whole team
--  Those are destructive and are run deliberately, once, at
--  handover — never as part of "set up the database".
--
--  ⚠  ONE THING TO KNOW BEFORE RUNNING 12.
--     public.orders currently accepts anonymous inserts
--     (orders_public_insert ... with check (true)), and section
--     12 adds a trigger that decrements stock when an order is
--     inserted. Together those let anyone drain the shop's stock
--     without paying. On a NEW database with no traffic that is
--     fine; before the site is public, order creation needs to
--     move behind a SECURITY DEFINER function that recomputes
--     the total server-side. See the audit.
--
--  Built ${new Date().toISOString().slice(0, 10)} from ${ORDER.length} migrations.
-- ============================================================


`;

const footer =
`

-- ############################################################
-- #  VERIFY
-- #  Run this last. It should list every table with RLS on.
-- ############################################################

select c.relname as table_name,
       case when c.relrowsecurity then 'RLS on' else 'RLS OFF — investigate' end as security,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Expected afterwards:
--   · 21 tables, every one with "RLS on" and at least one policy
--   · 29 products, 2 coupons, 1+ branch, 1+ category
--
--   select (select count(*) from public.products)  as products,
--          (select count(*) from public.coupons)   as coupons,
--          (select count(*) from public.branches)  as branches,
--          (select count(*) from public.categories) as categories;
--
--  Then create your founder in Authentication → Users (tick Auto
--  Confirm), add the matching staff row, and sign in — claim_staff()
--  binds the two together on that first sign-in:
--
--   insert into public.staff (name, email, role)
--   values ('Your Name', 'you@example.com', 'founder');
`;

const out = header + parts.join('\n') + footer;
const dest = path.join(DIR, 'COMPLETE-SCHEMA.sql');
fs.writeFileSync(dest, out);

/* Count quotes only OUTSIDE -- comments. Counting them everywhere reports an
   unbalanced file on every apostrophe in prose ("the client's login"), which
   is a false alarm loud enough that a real one would be ignored. */
function balance(sql) {
  let inStr = false, quotes = 0, i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (!inStr && c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === "'") { inStr = !inStr; quotes++; }
    i++;
  }
  return { quotes, evenQuotes: quotes % 2 === 0, endsInsideString: inStr };
}

const lines   = out.split('\n').length;
const dollars = (out.match(/\$\$/g) || []).length;
const b       = balance(out);

console.log(`Wrote sql/COMPLETE-SCHEMA.sql — ${ORDER.length} migrations, ${lines} lines`);
console.log(`  dollar-quote delimiters: ${dollars} ${dollars % 2 ? '<-- ODD, unbalanced!' : '(balanced)'}`);
console.log(`  quotes outside comments: ${b.quotes} ${b.evenQuotes ? '(balanced)' : '<-- ODD, unbalanced!'}`);
if (b.endsInsideString) console.log('  <-- file ends inside an unterminated string');
if (dollars % 2 || !b.evenQuotes || b.endsInsideString) process.exit(1);
