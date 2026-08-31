/**
 * TOSS SPORTS — ORDERS ⇄ GOOGLE SHEET
 *
 * A two-way sync between the `orders` table and one spreadsheet, so the
 * order book can be sorted, filtered and pivoted in Sheets, and a few
 * fields can be edited there and pushed back.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE THAT MAKES THIS SAFE
 *
 * A two-way sync is dangerous in one specific way, and it is not that a
 * write fails. It is that a write SUCCEEDS when it should not have:
 *
 *   09:00  you open the Sheet. The row says status = new.
 *   10:00  a salesperson marks that order shipped in the Maze Room.
 *   11:00  the sync pushes your 09:00 row back. The order is "new" again.
 *
 * Nothing errors. Nobody is told. The bat does not go out.
 *
 * So every write-back is filtered on the row VERSION the Sheet last read
 * (see sql/021-order-versioning.sql):
 *
 *   PATCH /orders?id=eq.TOSS-X&version=eq.7
 *
 * If anybody touched the row in between it is on version 8, the filter
 * matches nothing, PostgREST updates zero rows, and this script marks
 * the row CONFLICT and leaves the database alone. The Sheet can never
 * win an argument it does not know it is having.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE SHEET MAY CHANGE
 *
 * EDITABLE only lists fulfilment fields. Money, items and customer
 * details are pulled and displayed but never written back — those are
 * priced and recorded by the database (sql/016, sql/019) and a
 * spreadsheet is not a place to renegotiate a total. Editing them in
 * the Sheet changes the Sheet and nothing else; the next pull puts them
 * back.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SETUP — see README.md. In short:
 *   1. Extensions → Apps Script from your spreadsheet
 *   2. Project Settings → Script Properties:
 *        SUPA_URL       https://<project>.supabase.co
 *        SUPA_SERVICE   the service_role key
 *   3. Run setupSheet() once
 *   4. Triggers → add a time-driven trigger for syncOrders()
 *
 * The service_role key bypasses every row-level policy. It lives in
 * Script Properties — server side, never in the spreadsheet, never in
 * this file, never anywhere the browser can reach. If it leaks, rotate
 * it in the Supabase dashboard immediately.
 */

const SHEET_NAME = 'Orders';
const LOG_NAME   = 'Sync log';

/* Written back to Supabase. Everything else is read-only. */
const EDITABLE = ['status', 'courier', 'tracking_no', 'tracking_url'];

/* Column order in the sheet. `version` is the concurrency guard and is
   kept in a hidden column — it is machinery, not information, and a
   person editing it by hand would disarm the very check protecting them. */
const COLUMNS = [
  { key: 'id',           label: 'Order',        w: 150 },
  { key: 'created_at',   label: 'Placed',       w: 150 },
  { key: 'customer_name',label: 'Customer',     w: 160 },
  { key: 'customer_phone',label:'Phone',        w: 120 },
  { key: 'status',       label: 'Status',       w: 110, edit: true },
  { key: 'courier',      label: 'Courier',      w: 130, edit: true },
  { key: 'tracking_no',  label: 'Tracking no',  w: 140, edit: true },
  { key: 'tracking_url', label: 'Tracking URL', w: 180, edit: true },
  { key: 'items_text',   label: 'Items',        w: 260 },
  { key: 'total',        label: 'Total',        w: 90  },
  { key: 'method',       label: 'Method',       w: 100 },
  { key: 'channel',      label: 'Channel',      w: 90  },
  { key: 'sync',         label: 'Sync',         w: 150 },
  { key: 'version',      label: '_version',     w: 60, hidden: true }
];

const STATUSES = ['new', 'making', 'packed', 'shipped', 'delivered', 'cancelled'];


/* ============================================================
   SUPABASE
   ============================================================ */

function cfg_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Script Property "' + k + '" is not set. See README.md.');
  return v;
}

function rest_(path, opts) {
  opts = opts || {};
  const res = UrlFetchApp.fetch(cfg_('SUPA_URL') + '/rest/v1/' + path, {
    method: opts.method || 'get',
    contentType: 'application/json',
    headers: {
      apikey: cfg_('SUPA_SERVICE'),
      Authorization: 'Bearer ' + cfg_('SUPA_SERVICE'),
      Prefer: opts.prefer || 'return=representation'
    },
    payload: opts.body ? JSON.stringify(opts.body) : undefined,
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase ' + code + ': ' + text.slice(0, 300));
  }
  return text ? JSON.parse(text) : null;
}


/* ============================================================
   SETUP
   ============================================================ */

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sh.clear();

  const head = COLUMNS.map(function (c) { return c.label; });
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#0B0B24').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);

  COLUMNS.forEach(function (c, i) {
    sh.setColumnWidth(i + 1, c.w);
    if (c.hidden) sh.hideColumns(i + 1);
  });

  /* A dropdown rather than a free-text status. Every value here is one
     the storefront's tracking page knows how to draw; a typo would show
     a customer a blank timeline. */
  const statusCol = colIndex_('status') + 1;
  sh.getRange(2, statusCol, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES, true)
      .setAllowInvalid(false)
      .setHelpText('One of: ' + STATUSES.join(', '))
      .build());

  /* Read-only columns get a grey wash. It does not enforce anything —
     Sheets cannot lock a range against its own owner usefully — but it
     tells you at a glance which edits will survive the next pull. */
  COLUMNS.forEach(function (c, i) {
    if (!c.edit && c.key !== 'sync') {
      sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setBackground('#F6F7FB');
    }
  });

  if (!ss.getSheetByName(LOG_NAME)) {
    const log = ss.insertSheet(LOG_NAME);
    log.getRange(1, 1, 1, 4).setValues([['When', 'Pulled', 'Pushed', 'Conflicts']])
      .setFontWeight('bold');
    log.setFrozenRows(1);
  }

  SpreadsheetApp.getUi().alert('Sheet ready. Run syncOrders() to fill it.');
}

function colIndex_(key) {
  for (let i = 0; i < COLUMNS.length; i++) if (COLUMNS[i].key === key) return i;
  return -1;
}


/* ============================================================
   SYNC

   Push first, then pull. That order matters: pushing first means
   an edit made in the Sheet is sent while the version it was
   based on is still current. Pulling first would refresh the
   version column underneath the pending edit and hand it a
   guard that always passes — which is exactly the protection
   this design exists to keep.
   ============================================================ */

function syncOrders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another sync is already running.');
  try {
    const pushed = pushEdits_();
    const pulled = pullOrders_();
    logRun_(pulled, pushed.ok, pushed.conflicts);
    return { pulled: pulled, pushed: pushed.ok, conflicts: pushed.conflicts };
  } finally {
    lock.releaseLock();
  }
}

/** Sheet → Supabase, for changed editable cells only. */
function pushEdits_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return { ok: 0, conflicts: 0 };

  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNS.length).getValues();
  const idC = colIndex_('id'), verC = colIndex_('version'), syncC = colIndex_('sync');

  /* One read of the current server state, keyed by id, so deciding what
     changed costs a single request rather than one per row. */
  const server = {};
  rest_('orders?select=id,version,' + EDITABLE.join(',') + '&limit=5000')
    .forEach(function (o) { server[o.id] = o; });

  let ok = 0, conflicts = 0;
  const notes = [];

  rows.forEach(function (r, i) {
    const id = String(r[idC] || '').trim();
    if (!id) { notes.push(['']); return; }

    const cur = server[id];
    if (!cur) { notes.push(['Not in database']); return; }

    const sheetVer = Number(r[verC] || 0);

    const patch = {};
    EDITABLE.forEach(function (k) {
      const cell = r[colIndex_(k)];
      const val  = cell === '' || cell === null ? null : String(cell).trim();
      const was  = cur[k] === undefined || cur[k] === null ? null : String(cur[k]);
      if (val !== was) patch[k] = val;
    });

    if (!Object.keys(patch).length) { notes.push(['']); return; }

    /* The guard. Filtering the UPDATE on the version this row was read
       at means a row somebody else has since changed matches nothing. */
    const out = rest_(
      'orders?id=eq.' + encodeURIComponent(id) + '&version=eq.' + sheetVer,
      { method: 'patch', body: patch });

    if (out && out.length) {
      ok++;
      notes.push(['Saved ' + Object.keys(patch).join(', ')]);
    } else {
      conflicts++;
      /* Deliberately NOT retried without the guard. Somebody changed
         this order while the Sheet was open, and their change is newer
         than yours. The next pull will show theirs; re-apply on top of
         it if you still want to. */
      notes.push(['CONFLICT — changed elsewhere, your edit was not saved']);
    }
  });

  if (notes.length) {
    sh.getRange(2, syncC + 1, notes.length, 1).setValues(notes);
  }
  return { ok: ok, conflicts: conflicts };
}

/** Supabase → Sheet. Always a full rewrite; the table is small. */
function pullOrders_() {
  const orders = rest_(
    'orders?select=id,created_at,customer,items,total,method,channel,status,' +
    'courier,tracking_no,tracking_url,version&order=created_at.desc&limit=5000');

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const syncC = colIndex_('sync');

  /* Keep whatever pushEdits_ just wrote in the Sync column, so a
     CONFLICT note survives the pull that follows it. Keyed by order id,
     because the pull re-sorts and row numbers move. */
  const keptNotes = {};
  if (sh.getLastRow() >= 2) {
    const old = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNS.length).getValues();
    old.forEach(function (r) {
      const id = String(r[colIndex_('id')] || '').trim();
      const note = String(r[syncC] || '');
      if (id && note.indexOf('CONFLICT') === 0) keptNotes[id] = note;
    });
  }

  const out = orders.map(function (o) {
    const c = o.customer || {};
    const items = (o.items || []).map(function (i) {
      return (i.qty || 1) + ' × ' + (i.name || i.id);
    }).join(', ');

    return COLUMNS.map(function (col) {
      switch (col.key) {
        case 'customer_name':  return c.name  || '';
        case 'customer_phone': return c.phone || '';
        case 'items_text':     return items;
        case 'created_at':     return o.created_at
          ? Utilities.formatDate(new Date(o.created_at),
              Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm') : '';
        case 'sync':           return keptNotes[o.id] || '';
        default:               return o[col.key] === null || o[col.key] === undefined
                                 ? '' : o[col.key];
      }
    });
  });

  /* Clear to the old extent first so deleted orders do not linger as
     ghost rows below the new data. */
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNS.length).clearContent();
  }
  if (out.length) {
    sh.getRange(2, 1, out.length, COLUMNS.length).setValues(out);
  }
  return out.length;
}

function logRun_(pulled, pushed, conflicts) {
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_NAME);
  if (!log) return;
  log.insertRowAfter(1);
  log.getRange(2, 1, 1, 4).setValues([[new Date(), pulled, pushed, conflicts]]);
}


/* ============================================================
   MIRROR — a readable copy of the rest of the database

   One tab per table, rewritten on every run. Read-only: nothing
   here is ever pushed back. Only the Orders tab above is two-way,
   because only its four fulfilment fields were worth the risk of
   a write-back.

   ─────────────────────────────────────────────────────────────
   THIS IS A MIRROR, NOT A BACKUP.

   It copies ROWS. It does not copy the schema, the constraints,
   the foreign keys, the row-level policies or the functions — so
   you cannot restore from it, only read it and retype. It is
   worth having for "what did we sell in March" and for surviving
   a deleted row. It is not disaster recovery; see the pg_dump
   section in README.md for that.

   ─────────────────────────────────────────────────────────────
   WHY PAYROLL GOES SOMEWHERE ELSE

   `staff` and `payroll` are in PRIVATE_TABLES and are written to
   a SECOND spreadsheet, named by the PRIVATE_SHEET_ID script
   property. The PRD calls salary privacy a hard requirement and
   enforces it in the database: a manager sees their own payslip
   and nobody else's.

   A spreadsheet cannot enforce that. Everyone with the link sees
   every row. Putting payslips in the same file as the order book
   would mean the day you share the order book you have shared
   everybody's salary — quietly, with no way to take it back. Two
   files is the only version of this that keeps the guarantee.

   If PRIVATE_SHEET_ID is not set, those tables are SKIPPED rather
   than falling back to the main sheet. Failing to back something
   up is recoverable; leaking it is not.
   ============================================================ */

/* `sel` narrows what is pulled where a table has columns nobody needs
   in a spreadsheet. `order` keeps each tab in a sensible order. */
const MIRROR_TABLES = [
  { table: 'requests',          tab: 'Requests',   order: 'created_at.desc' },
  { table: 'product_questions', tab: 'Questions',  order: 'created_at.desc' },
  { table: 'scores',            tab: 'Game scores',order: 'runs.desc' },
  { table: 'audit_log',         tab: 'Audit log',  order: 'at.desc' },
  { table: 'products',          tab: 'Products',   order: 'sort.asc' },
  { table: 'product_stock',     tab: 'Stock',      order: 'product_id.asc' },
  { table: 'categories',        tab: 'Categories', order: 'sort.asc' },
  { table: 'settings',          tab: 'Settings',   order: 'key.asc' },
  { table: 'coupons',           tab: 'Codes',      order: 'code.asc' },
  { table: 'customer_profiles', tab: 'Customers',  order: 'created_at.desc' },
  { table: 'invoices',          tab: 'Invoices',   order: 'created_at.desc' },
  { table: 'expenses',          tab: 'Expenses',   order: 'created_at.desc' },
  { table: 'branches',          tab: 'Branches',   order: 'id.asc' }
];

/* Salaries and payslips. Separate file, always. */
const PRIVATE_TABLES = [
  { table: 'staff',      tab: 'Staff',      order: 'name.asc' },
  { table: 'payroll',    tab: 'Payroll',    order: 'created_at.desc' },
  { table: 'attendance', tab: 'Attendance', order: 'day.desc' },
  { table: 'targets',    tab: 'Targets',    order: 'id.asc' }
];

/* Rows pulled per table. Sheets tops out around 10 million cells for a
   whole spreadsheet, and audit_log is the one that grows without bound.
   A cap that is announced in the Sync log beats a sync that silently
   stops working in a year. */
const MIRROR_LIMIT = 5000;

/** Everything. Safe to run by hand or on a trigger. */
function backupAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('Another sync is already running.');
  try {
    const main = SpreadsheetApp.getActiveSpreadsheet();
    const done = [], skipped = [], capped = [];

    MIRROR_TABLES.forEach(function (m) {
      const n = mirrorTable_(main, m);
      done.push(m.tab + ' ' + n);
      if (n >= MIRROR_LIMIT) capped.push(m.tab);
    });

    /* Private tables only ever go to the private file. */
    const pid = PropertiesService.getScriptProperties().getProperty('PRIVATE_SHEET_ID');
    if (pid) {
      const priv = SpreadsheetApp.openById(pid);
      PRIVATE_TABLES.forEach(function (m) {
        const n = mirrorTable_(priv, m);
        done.push('[private] ' + m.tab + ' ' + n);
        if (n >= MIRROR_LIMIT) capped.push(m.tab);
      });
    } else {
      PRIVATE_TABLES.forEach(function (m) { skipped.push(m.tab); });
    }

    logBackup_(done, skipped, capped);
    return { written: done, skipped: skipped, capped: capped };
  } finally {
    lock.releaseLock();
  }
}

/**
 * One table → one tab, rewritten.
 * Columns come from the data rather than being declared per table: with
 * thirteen tables a hand-written column list is thirteen things to
 * forget to update the next time a migration adds a field.
 */
function mirrorTable_(ss, m) {
  let rows;
  try {
    rows = rest_(m.table + '?select=*' +
      (m.order ? '&order=' + m.order : '') + '&limit=' + MIRROR_LIMIT);
  } catch (e) {
    /* A table that does not exist yet — a migration not run — should not
       stop the other twelve from being copied. */
    writeTab_(ss, m.tab, [['Could not read ' + m.table]], [[String(e).slice(0, 200)]]);
    return 0;
  }

  if (!rows || !rows.length) { writeTab_(ss, m.tab, [['(no rows)']], []); return 0; }

  /* Union of keys, first-seen order. PostgREST omits nothing, but a
     jsonb column can differ row to row. */
  const cols = [];
  rows.forEach(function (r) {
    Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
  });

  const body = rows.map(function (r) {
    return cols.map(function (k) {
      const v = r[k];
      if (v === null || v === undefined) return '';
      /* jsonb — items, customer, payload — flattened to text so the cell
         shows something readable instead of [object Object]. */
      if (typeof v === 'object') return JSON.stringify(v);
      /* Long text would otherwise blow past the 50,000 character cell
         limit and fail the whole write. */
      const s = String(v);
      return s.length > 45000 ? s.slice(0, 45000) + '…[truncated]' : s;
    });
  });

  writeTab_(ss, m.tab, [cols], body);
  return rows.length;
}

function writeTab_(ss, name, header, body) {
  let sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  const width = Math.max(header[0].length, 1);
  sh.getRange(1, 1, 1, width).setValues(header)
    .setFontWeight('bold').setBackground('#0B0B24').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (body.length) sh.getRange(2, 1, body.length, width).setValues(body);
  return sh;
}

function logBackup_(done, skipped, capped) {
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_NAME);
  if (!log) return;
  const notes = ['Mirror: ' + done.join(', ')];
  if (skipped.length) notes.push('SKIPPED (no PRIVATE_SHEET_ID): ' + skipped.join(', '));
  if (capped.length)  notes.push('AT ROW CAP — older rows not copied: ' + capped.join(', '));
  log.insertRowAfter(1);
  log.getRange(2, 1, 1, 4).setValues([[new Date(), notes.join(' | '), '', '']]);
}

/** Orders write-back plus the full mirror. What a trigger should call. */
function syncEverything() {
  const s = syncOrders();
  const b = backupAll();
  return { orders: s, mirror: b };
}


/* ============================================================
   MENU
   ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Toss')
    .addItem('Sync orders now', 'syncOrders')
    .addItem('Back up everything', 'backupAll')
    .addSeparator()
    .addItem('Set up sheet', 'setupSheet')
    .addToUi();
}
