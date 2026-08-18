#!/usr/bin/env node
/**
 * TOSS SPORTS v2 — MIGRATION
 *
 * Pulls everything out of the v1 Supabase database and writes one CSV per
 * Sheets tab, with columns in exactly the order Schema.gs declares. You
 * then paste each CSV into its tab, or use File → Import in Sheets.
 *
 * Reads with the PUBLISHABLE key, so it can only export what is publicly
 * readable (products, categories, settings, scores). For the protected
 * tables — orders, staff, payroll, expenses, invoices — export them from
 * the Supabase dashboard (Table editor → ⋮ → Export as CSV) and drop the
 * files into this folder; the script will pick them up and reshape them.
 *
 *   node export-from-supabase.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPA_URL = 'https://rbrokxstbzewdjdfhiwk.supabase.co';
const SUPA_KEY = process.env.SUPA_ANON_KEY || '';   /* publishable key */

const OUT = path.join(__dirname, 'csv');

/* Column order must match Schema.gs exactly. */
const TABS = {
  products:   ['id','name','category','tier','price','mrp','cost','stock','active','sort','images','data','updated_at'],
  categories: ['id','name','sort','created_at'],
  orders:     ['id','created_at','branch_id','staff_id','channel','status','paid','customer','items','subtotal','shipping','discount','total','coupon','notes'],
  invoices:   ['number','fy','order_id','branch_id','issued_at','seller','buyer','place_of_supply','items','is_tax_invoice','gst_rate','taxable','cgst','sgst','igst','total','cancelled'],
  branches:   ['id','name','code','address','phone','is_default','active','sort'],
  coupons:    ['code','discount','min_spend','unlock_runs','label','active','uses'],
  scores:     ['id','name','runs','wickets','balls','created_at'],
  staff:      ['id','email','name','phone','role','branch_id','base_salary','commission_pct','joined_on','active','created_at'],
  attendance: ['id','staff_id','on_date','status','hours','note'],
  tasks:      ['id','title','detail','staff_id','due_on','status','created_at'],
  targets:    ['id','staff_id','month','amount'],
  payroll:    ['id','staff_id','month','base','commission','bonus','deduction','net','status','note'],
  sops:       ['id','title','category','body','for_roles','active','updated_at'],
  sop_acks:   ['id','sop_id','staff_id','acked_at'],
  expenses:   ['id','on_date','branch_id','category','detail','amount'],
  settings:   ['key','value','updated_at']
};

/** Tables the publishable key can read. The rest need a dashboard export. */
const PUBLIC_TABLES = ['products', 'categories', 'settings', 'scores', 'branches'];

function fetchTable(table) {
  return new Promise((resolve) => {
    if (!SUPA_KEY) return resolve(null);
    const opts = {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
    };
    https.get(SUPA_URL + '/rest/v1/' + table + '?select=*', opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const rows = JSON.parse(body);
          resolve(Array.isArray(rows) ? rows : null);
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

/** Any CSV you exported by hand from the Supabase dashboard. */
function readLocalCsv(table) {
  const p = path.join(__dirname, table + '.csv');
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8').trim();
  if (!text) return null;
  const lines = splitCsv(text);
  const head = lines.shift();
  return lines.map(cells => {
    const o = {};
    head.forEach((h, i) => o[h.trim()] = cells[i]);
    return o;
  });
}

/** Minimal RFC4180 reader — handles quoted commas and embedded newlines. */
function splitCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** v1 kept bat specs in a `data` blob; v2 keeps that shape, so this is
    mostly a column reorder plus a few renames. */
function reshape(table, rows) {
  const cols = TABS[table];
  return rows.map(r => {
    const o = {};
    cols.forEach(c => {
      let v = r[c];
      /* v1 called it `uses`; some exports say `used` */
      if (table === 'coupons' && c === 'uses' && v === undefined) v = r.used;
      /* v1 scores used `wickets`; guard against `wkts` in older exports */
      if (table === 'scores' && c === 'wickets' && v === undefined) v = r.wkts;
      /* stock lived on products in v1 before branches; keep the total */
      if (table === 'products' && c === 'stock' && v === undefined) v = 0;
      o[c] = v;
    });
    return o;
  });
}

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Toss Sports — Supabase → Sheets export\n');

  if (!SUPA_KEY) {
    console.log('No SUPA_ANON_KEY set, so only locally-exported CSVs will be reshaped.');
    console.log('To pull the public tables too:');
    console.log('  set SUPA_ANON_KEY=sb_publishable_…   (Windows)');
    console.log('  export SUPA_ANON_KEY=sb_publishable_…\n');
  }

  const summary = [];

  for (const table of Object.keys(TABS)) {
    let rows = readLocalCsv(table);
    let source = rows ? 'local csv' : null;

    if (!rows && PUBLIC_TABLES.includes(table)) {
      rows = await fetchTable(table);
      source = rows ? 'supabase' : null;
    }

    if (!rows || !rows.length) {
      summary.push({ table, rows: 0, source: source || 'none — export by hand if needed' });
      /* still write the header so the tab can be pasted in empty */
      fs.writeFileSync(path.join(OUT, table + '.csv'), TABS[table].join(',') + '\n');
      continue;
    }

    const shaped = reshape(table, rows);
    const csv = [TABS[table].join(',')]
      .concat(shaped.map(r => TABS[table].map(c => csvCell(r[c])).join(',')))
      .join('\n');
    fs.writeFileSync(path.join(OUT, table + '.csv'), csv + '\n');
    summary.push({ table, rows: shaped.length, source });
  }

  console.log('Written to migrate/csv/\n');
  const w = Math.max(...summary.map(s => s.table.length));
  summary.forEach(s => {
    console.log('  ' + s.table.padEnd(w) + '  ' +
      String(s.rows).padStart(4) + ' rows   ' + s.source);
  });

  console.log('\nNext:');
  console.log('  1. Open the Toss Sports Database spreadsheet');
  console.log('  2. For each tab: File → Import → Upload the matching CSV');
  console.log('     choose "Replace current sheet", and KEEP the header row');
  console.log('  3. Check the staff tab has your Google Workspace email in it,');
  console.log('     with role = founder — otherwise nobody can sign in.');
})();
