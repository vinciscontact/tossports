/**
 * TOSS SPORTS v2 — DATA LAYER
 *
 * Sheets is not a database: there are no indexes, no joins and no
 * transactions. Three rules keep that from becoming a correctness problem.
 *
 * 1. READ A TAB ONCE PER EXECUTION. A getValues() call costs ~100–300ms
 *    whether it returns 1 row or 5,000, so scanning the same tab per item
 *    in a loop is what actually blows the 6-minute cap — not data volume.
 *    Everything here reads whole tabs into memory and builds lookup maps.
 *
 * 2. EVERY WRITE TAKES THE DOCUMENT LOCK. Two staff billing at the same
 *    moment would otherwise both read stock=5, both write stock=4, and one
 *    bat would vanish from the count. LockService serialises them.
 *
 * 3. ADDRESS COLUMNS BY NAME. Someone will eventually insert a column in
 *    the spreadsheet by hand; that must not silently shift every field.
 */

/** How long a write waits for the lock before giving up. */
const LOCK_WAIT_MS = 20000;

const _cache = {};          /* tab -> array of objects, per execution */

/* ---------------- reading ---------------- */

/**
 * Whole tab as objects, cached for this execution.
 * Cost: one getValues() per tab per request, regardless of how many
 * times the code asks for it.
 */
function readTab(tab) {
  if (_cache[tab]) return _cache[tab];
  const cols = SCHEMA[tab];
  if (!cols) throw new Error('Unknown tab: ' + tab);

  const sh = db_().getSheetByName(tab);
  if (!sh || sh.getLastRow() < 2) return (_cache[tab] = []);

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues();
  const json = JSON_COLUMNS[tab] || [];
  const bool = BOOL_COLUMNS[tab] || [];
  const num  = NUM_COLUMNS[tab] || [];

  const rows = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    /* a fully blank line is a gap, not a record */
    if (row.join('') === '') continue;
    const o = { _row: r + 2 };                 /* sheet row number, for updates */
    for (let c = 0; c < cols.length; c++) {
      const key = cols[c];
      let v = row[c];
      if (json.indexOf(key) > -1)      v = parseJson_(v);
      else if (bool.indexOf(key) > -1) v = (v === true || v === 'TRUE' || v === 'true');
      else if (num.indexOf(key) > -1)  v = (v === '' || v === null) ? null : Number(v);
      else if (v instanceof Date)      v = v.toISOString();
      o[key] = v;
    }
    rows.push(o);
  }
  return (_cache[tab] = rows);
}

function parseJson_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return v; }
}

/** Lookup map keyed by a column — built once, then O(1) per hit. */
function indexBy(tab, key) {
  const m = {};
  readTab(tab).forEach(function (r) { m[String(r[key])] = r; });
  return m;
}

function findRow(tab, key, value) {
  const rows = readTab(tab);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][key]) === String(value)) return rows[i];
  }
  return null;
}

/* ---------------- writing ---------------- */

function toCell_(tab, key, value) {
  if ((JSON_COLUMNS[tab] || []).indexOf(key) > -1) {
    return value === null || value === undefined ? '' : JSON.stringify(value);
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function rowToCells_(tab, obj) {
  return SCHEMA[tab].map(function (k) { return toCell_(tab, k, obj[k]); });
}

/**
 * Append a row. Takes the lock: two simultaneous appends can otherwise
 * both compute the same "last row" and one overwrites the other.
 */
function insertRow(tab, obj) {
  return withLock_(function () {
    const sh = db_().getSheetByName(tab);
    sh.appendRow(rowToCells_(tab, obj));
    delete _cache[tab];
    return obj;
  });
}

/** Update by key. The read and the write happen inside one lock. */
function updateRow(tab, key, value, patch) {
  return withLock_(function () {
    delete _cache[tab];                        /* re-read inside the lock */
    const row = findRow(tab, key, value);
    if (!row) throw new Error('No ' + tab + ' with ' + key + ' = ' + value);
    const merged = {};
    SCHEMA[tab].forEach(function (k) {
      merged[k] = patch.hasOwnProperty(k) ? patch[k] : row[k];
    });
    db_().getSheetByName(tab)
      .getRange(row._row, 1, 1, SCHEMA[tab].length)
      .setValues([rowToCells_(tab, merged)]);
    delete _cache[tab];
    return merged;
  });
}

function deleteRow(tab, key, value) {
  return withLock_(function () {
    delete _cache[tab];
    const row = findRow(tab, key, value);
    if (!row) return false;
    db_().getSheetByName(tab).deleteRow(row._row);
    delete _cache[tab];
    return true;
  });
}

/**
 * Adjust several products' stock atomically.
 * moves = [{ id: 'power-x', delta: -1 }, …]
 *
 * This is the single most important lock in the system: it is the one
 * place where a lost update would silently corrupt a real-world count.
 */
function adjustStock(moves) {
  return withLock_(function () {
    delete _cache.products;
    const sh = db_().getSheetByName('products');
    const rows = readTab('products');
    const byId = {};
    rows.forEach(function (r) { byId[r.id] = r; });

    const col = SCHEMA.products.indexOf('stock') + 1;
    const applied = [];
    moves.forEach(function (m) {
      const p = byId[m.id];
      if (!p) return;                          /* deleted product — nothing to move */
      const next = Math.max(0, (Number(p.stock) || 0) + Number(m.delta));
      sh.getRange(p._row, col).setValue(next);
      applied.push({ id: m.id, from: p.stock, to: next });
    });
    delete _cache.products;
    return applied;
  });
}

/**
 * The lock itself. 20s is deliberate: Apps Script allows ~30 concurrent
 * executions, and a write here holds the lock for well under a second, so
 * a queue of 30 clears comfortably inside 20s. If it ever times out that
 * is a real signal — say so plainly rather than corrupting data.
 */
function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    throw new Error('The system is busy — please try again in a moment.');
  }
  try { return fn(); }
  finally { lock.releaseLock(); }
}

/* ---------------- ids and audit ---------------- */

function newId() { return Utilities.getUuid(); }

function nowIso() { return new Date().toISOString(); }

/** Human, sortable order id: TOSS-260817-4821 */
function newOrderId() {
  const d = new Date();
  const p = function (n) { return ('0' + n).slice(-2); };
  return 'TOSS-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + Math.floor(1000 + Math.random() * 9000);
}

/**
 * Append-only. Nothing in the API updates or deletes from this tab, and
 * staff have no direct access to the spreadsheet at all — the same
 * property v1 got from having no update policy on the table.
 */
function audit(user, entity, action, rowId, summary) {
  try {
    insertRow('audit_log', {
      id: newId(), at: nowIso(),
      actor_email: user ? user.email : 'public',
      actor_name:  user ? user.name  : 'public',
      actor_role:  user ? user.role  : 'public',
      entity: entity, action: action, row_id: rowId || '', summary: summary || ''
    });
  } catch (e) {
    /* an audit failure must never break the business action it describes */
    console.warn('audit failed: ' + e.message);
  }
}
