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
   MENU
   ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Toss')
    .addItem('Sync now', 'syncOrders')
    .addSeparator()
    .addItem('Set up sheet', 'setupSheet')
    .addToUi();
}
