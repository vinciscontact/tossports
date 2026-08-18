/**
 * TOSS SPORTS v2 — SCHEMA
 *
 * Every Postgres table from v1 becomes a Sheets tab. Column order is
 * declared here and nowhere else: the whole data layer reads and writes
 * by column NAME resolved through this map, so inserting a column in the
 * spreadsheet by hand cannot silently shift everyone's data sideways.
 *
 * `customer_stats` is deliberately absent — Sheets has no live views, so
 * it is computed in Api.gs instead of being stored and going stale.
 */

/** The one spreadsheet that is the entire database. Set on first setup. */
const DB_PROP = 'TOSS_DB_ID';

const SCHEMA = {
  /* ---------- catalogue ---------- */
  products: [
    'id', 'name', 'category', 'tier', 'price', 'mrp', 'cost', 'stock',
    'active', 'sort', 'images', 'data', 'updated_at'
  ],
  categories: ['id', 'name', 'sort', 'created_at'],

  /* ---------- selling ---------- */
  orders: [
    'id', 'created_at', 'branch_id', 'staff_id', 'channel', 'status', 'paid',
    'customer', 'items', 'subtotal', 'shipping', 'discount', 'total',
    'coupon', 'notes'
  ],
  invoices: [
    'number', 'fy', 'order_id', 'branch_id', 'issued_at', 'seller', 'buyer',
    'place_of_supply', 'items', 'is_tax_invoice', 'gst_rate',
    'taxable', 'cgst', 'sgst', 'igst', 'total', 'cancelled'
  ],
  branches: ['id', 'name', 'code', 'address', 'phone', 'is_default', 'active', 'sort'],

  /* ---------- rewards ---------- */
  /* NEVER exposed to a public read. Validated server-side only. */
  coupons: ['code', 'discount', 'min_spend', 'unlock_runs', 'label', 'active', 'uses'],
  scores: ['id', 'name', 'runs', 'wickets', 'balls', 'created_at'],

  /* ---------- people ---------- */
  staff: [
    'id', 'email', 'name', 'phone', 'role', 'branch_id',
    'base_salary', 'commission_pct', 'joined_on', 'active', 'created_at'
  ],
  attendance: ['id', 'staff_id', 'on_date', 'status', 'hours', 'note'],
  tasks: ['id', 'title', 'detail', 'staff_id', 'due_on', 'status', 'created_at'],
  targets: ['id', 'staff_id', 'month', 'amount'],
  /* the tab a Manager must never be able to read for anyone but themselves */
  payroll: [
    'id', 'staff_id', 'month', 'base', 'commission', 'bonus', 'deduction',
    'net', 'status', 'note'
  ],

  /* ---------- operations ---------- */
  sops: ['id', 'title', 'category', 'body', 'for_roles', 'active', 'updated_at'],
  sop_acks: ['id', 'sop_id', 'staff_id', 'acked_at'],
  expenses: ['id', 'on_date', 'branch_id', 'category', 'detail', 'amount'],

  /* ---------- system ---------- */
  settings: ['key', 'value', 'updated_at'],
  audit_log: ['id', 'at', 'actor_email', 'actor_name', 'actor_role',
              'entity', 'action', 'row_id', 'summary']
};

/** Columns holding JSON. Parsed on read, stringified on write. */
const JSON_COLUMNS = {
  products:  ['images', 'data'],
  orders:    ['customer', 'items'],
  invoices:  ['seller', 'buyer', 'items'],
  sops:      ['for_roles'],
  settings:  ['value']
};

/** Columns stored as true/false. */
const BOOL_COLUMNS = {
  products:  ['active'],
  orders:    ['paid'],
  invoices:  ['is_tax_invoice', 'cancelled'],
  branches:  ['is_default', 'active'],
  coupons:   ['active'],
  staff:     ['active'],
  sops:      ['active']
};

/** Columns stored as numbers, so '' never becomes the string "0". */
const NUM_COLUMNS = {
  products:  ['price', 'mrp', 'cost', 'stock', 'sort'],
  orders:    ['subtotal', 'shipping', 'discount', 'total'],
  invoices:  ['gst_rate', 'taxable', 'cgst', 'sgst', 'igst', 'total'],
  branches:  ['sort'],
  coupons:   ['discount', 'min_spend', 'unlock_runs', 'uses'],
  scores:    ['runs', 'wickets', 'balls'],
  staff:     ['base_salary', 'commission_pct'],
  attendance:['hours'],
  targets:   ['amount'],
  payroll:   ['base', 'commission', 'bonus', 'deduction', 'net'],
  expenses:  ['amount']
};

/* ============================================================
   SETUP — run once from the Apps Script editor
   ============================================================ */

/**
 * Creates the spreadsheet, every tab, header rows and the seed data.
 * Safe to re-run: existing tabs and rows are left alone, only missing
 * pieces are added.
 */
function setupDatabase() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(DB_PROP);
  let ss;

  if (id) {
    try { ss = SpreadsheetApp.openById(id); }
    catch (e) { id = null; }                 /* deleted or no access — make a new one */
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Toss Sports — Database');
    props.setProperty(DB_PROP, ss.getId());
    /* the default sheet is in the way */
    const first = ss.getSheets()[0];
    if (first.getName() === 'Sheet1') ss.deleteSheet(first);
  }

  Object.keys(SCHEMA).forEach(function (tab) {
    let sh = ss.getSheetByName(tab);
    if (!sh) sh = ss.insertSheet(tab);
    const cols = SCHEMA[tab];

    /* header row, frozen and locked to the declared order */
    const head = sh.getRange(1, 1, 1, cols.length);
    const current = head.getValues()[0].join('|');
    if (current !== cols.join('|')) {
      head.setValues([cols]);
      head.setFontWeight('bold').setBackground('#14141f').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });

  seedDefaults_(ss);
  Logger.log('Database ready: ' + ss.getUrl());
  return ss.getUrl();
}

function seedDefaults_(ss) {
  /* settings the storefront needs to render at all */
  const defaults = {
    whatsapp: '919176995707',
    instagram: 'toss_sportz',
    free_ship_over: 1500,
    ship_fee: 99,
    razorpay_key: '',
    gstin: '',
    legal_name: '',
    business_address: '',
    business_state: 'Tamil Nadu',
    gst_rate: 12,
    hsn_code: '9506',
    invoice_prefix: 'TOSS',
    announcement: 'Handcrafted in-house — not resold'
  };
  const sh = ss.getSheetByName('settings');
  const have = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { have[r[0]] = true; });
  }
  const add = [];
  Object.keys(defaults).forEach(function (k) {
    if (!have[k]) add.push([k, JSON.stringify(defaults[k]), new Date().toISOString()]);
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setValues(add);

  /* the founding branch and category */
  seedRow_(ss, 'branches', 'id', 'chennai',
    ['chennai', 'Chennai', 'A', '', '', true, true, 0]);
  seedRow_(ss, 'categories', 'id', 'bats',
    ['bats', 'Bats', 0, new Date().toISOString()]);

  /* the first founder — replace the email before running setup, or edit
     the row afterwards. Without at least one founder nobody can sign in. */
  const owner = Session.getEffectiveUser().getEmail();
  seedRow_(ss, 'staff', 'email', owner,
    [Utilities.getUuid(), owner, 'Founder', '', 'founder', '', 0, 0,
     new Date().toISOString().slice(0, 10), true, new Date().toISOString()]);
}

function seedRow_(ss, tab, keyCol, keyVal, row) {
  const sh = ss.getSheetByName(tab);
  const idx = SCHEMA[tab].indexOf(keyCol);
  if (sh.getLastRow() > 1) {
    const existing = sh.getRange(2, idx + 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < existing.length; i++) {
      if (String(existing[i][0]) === String(keyVal)) return;   /* already there */
    }
  }
  sh.appendRow(row);
}

/** The spreadsheet, opened once per execution. */
let _ss = null;
function db_() {
  if (_ss) return _ss;
  const id = PropertiesService.getScriptProperties().getProperty(DB_PROP);
  if (!id) throw new Error('Database not set up. Run setupDatabase() once from the editor.');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}
