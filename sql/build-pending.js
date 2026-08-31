#!/usr/bin/env node
/**
 * Builds sql/PENDING-MIGRATIONS.sql — everything a LIVE database still
 * needs, in order, in one pasteable file.
 *
 *   node sql/build-pending.js
 *
 * Separate from build.js on purpose. COMPLETE-SCHEMA.sql re-seeds the
 * catalogue and ends with `on conflict (id) do update set name, price,
 * mrp, tier, data`, so running it against a shop that has priced its
 * bats in the Maze Room silently reverts them. That file is right for a
 * brand new database and wrong for a running one.
 *
 * This file carries only migrations, none of which overwrite catalogue
 * or order data.
 */

const fs = require('fs');
const path = require('path');
const DIR = __dirname;

/* Two outputs from one script:
     RUN-THESE.sql         018-022 — what a database already carrying
                           016 and 017 still needs. The normal case.
     PENDING-MIGRATIONS.sql 016-022 — the belt-and-braces version, for a
                           database whose history is unknown.
   Both are idempotent, so the only cost of running the larger one is a
   few seconds of no-ops. */
/* 018 is NOT here on purpose.
   It creates customer identity as uuid; 022 converts it to text for
   Firebase. Shipping both in one file means 018 re-applies uuid policies
   to a column 022 has already converted, and Postgres refuses with
   "operator does not exist: text = uuid" — which is exactly what happened.
   022 now creates whatever is missing itself, so it needs no predecessor. */
const CORE = [
  '019-corporate-and-warranty',
  '020-coupon-kinds',
  '021-order-versioning',
  '022-firebase-customer-auth',
  '023-no-role-claim-needed'
];
const EARLIER = ['016-security-fixes', '017-playstyles', '018-customer-accounts'];

const TARGET = process.argv[2] === 'all'
  ? { files: EARLIER.concat(CORE), out: 'PENDING-MIGRATIONS.sql' }
  : { files: CORE,                 out: 'RUN-THESE.sql' };

const FILES = TARGET.files;

const HEAD = [
  '-- ============================================================',
  '--  TOSS SPORTS — PENDING MIGRATIONS',
  '--',
  '--  Everything the database still needs, in order, in one file.',
  '--  Paste the whole thing into the Supabase SQL editor and run it.',
  '--',
  '--  GENERATED — do not edit. Rebuild with:',
  '--      node sql/build-pending.js',
  '--',
  '--  ─────────────────────────────────────────────────────────',
  '--  WHY NOT COMPLETE-SCHEMA.sql',
  '--',
  '--  That file re-seeds the catalogue and ends with',
  '--',
  '--      on conflict (id) do update set',
  '--        name = excluded.name, price = excluded.price, ...',
  '--',
  '--  so running it would overwrite every product name, price, MRP',
  '--  and tier with the values committed in schema.sql, reverting',
  '--  anything priced in the Maze Room. Right for a brand new',
  '--  database, wrong for a live one.',
  '--',
  '--  ─────────────────────────────────────────────────────────',
  '--  SAFE TO RE-RUN. Every statement is idempotent: create table',
  '--  if not exists, drop policy before create, create or replace',
  '--  function, insert ... on conflict do nothing.',
  '--',
  '--  The one destructive step — 022 converting customer ids from',
  '--  Supabase UUIDs to Firebase UIDs — is guarded on the column',
  '--  still being uuid, so a second run reports "conversion',
  '--  skipped" and changes nothing.',
  '-- ============================================================',
  '', ''
].join('\n');

const FOOT = [
  '', '',
  '-- ############################################################',
  '-- #  VERIFY — run after, in the SQL editor',
  '-- ############################################################',
  '',
  '-- 1. identity columns are text, and the new ones exist',
  "select table_name, column_name, data_type",
  "  from information_schema.columns",
  " where table_schema = 'public'",
  "   and ( (table_name in ('orders','requests','customer_profiles') and column_name = 'user_id')",
  "      or (table_name = 'orders'  and column_name in ('version','updated_at'))",
  "      or (table_name = 'coupons' and column_name in ('kind','referred_by')) )",
  " order by table_name, column_name;",
  '-- user_id must read text on all three.',
  '',
  '-- 2. corporate is an accepted request kind',
  "select pg_get_constraintdef(oid) from pg_constraint",
  " where conname = 'requests_kind_ck';",
  '',
  '-- 3. warranty prices seeded',
  "select key, value from public.settings",
  " where key in ('warranty_3_price','warranty_6_price');",
  '',
  '-- 4. the customer functions exist',
  "select proname from pg_proc",
  " where proname in ('link_my_history','claim_orders','orders_bump_version')",
  " order by proname;"
].join('\n');

const missing = FILES.filter(f => !fs.existsSync(path.join(DIR, f + '.sql')));
if (missing.length) {
  console.error('Missing: ' + missing.join(', '));
  process.exit(1);
}

const parts = FILES.map((f, i) => {
  const body = fs.readFileSync(path.join(DIR, f + '.sql'), 'utf8').trimEnd();
  const n = String(i + 1).padStart(2, '0');
  return '-- ############################################################\n' +
         '-- #  ' + n + '. ' + f + '.sql\n' +
         '-- ############################################################\n\n' + body + '\n';
});

const out = HEAD + parts.join('\n') + FOOT;
fs.writeFileSync(path.join(DIR, TARGET.out), out);

/* Same balance checks build.js runs — an unterminated dollar-quote or
   string would fail halfway through in the SQL editor, leaving the
   database half-migrated. */
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
  return { quotes, even: quotes % 2 === 0, endsInside: inStr };
}

const dollars = (out.match(/\$\$/g) || []).length;
const b = balance(out);
console.log('Wrote sql/' + TARGET.out + ' — ' + FILES.length + ' migrations, ' +
            out.split('\n').length + ' lines');
console.log('  dollar-quote delimiters: ' + dollars + (dollars % 2 ? ' <-- ODD!' : ' (balanced)'));
console.log('  quotes outside comments: ' + b.quotes + (b.even ? ' (balanced)' : ' <-- ODD!'));
if (dollars % 2 || !b.even || b.endsInside) process.exit(1);
