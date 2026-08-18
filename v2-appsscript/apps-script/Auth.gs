/**
 * TOSS SPORTS v2 — IDENTITY AND ACCESS
 *
 * This file replaces 31 Postgres row-level-security policies. That is the
 * central trade-off of this version and it deserves to be stated plainly:
 * in v1 the database refused unauthorised reads even if every line of
 * application code was wrong. Here, THIS FILE IS THE ONLY THING STOPPING
 * THEM. Every endpoint must pass through a guard below; an endpoint that
 * forgets to is a hole, and no other layer will catch it.
 *
 * Two deployments, because one cannot do both jobs:
 *
 *   PUBLIC   — Execute as: Me · Access: Anyone (even anonymous)
 *              The storefront. No identity exists. Only the whitelist in
 *              PUBLIC_ACTIONS is reachable; everything else is refused
 *              before it runs.
 *
 *   INTERNAL — Execute as: Me · Access: Anyone within <your domain>
 *              The Maze Room. Because the script runs as the owner AND the
 *              caller is inside the same Workspace domain, Apps Script
 *              gives us Session.getActiveUser().getEmail() — a Google
 *              -verified identity we never have to store a password for.
 *              The spreadsheet itself stays private to the owner, so a
 *              salesperson cannot open it and read salaries directly.
 *              That last point is why this works at all.
 */

/* ---------------- the capability matrix ----------------
   Mirrors PRD §6.1. Data, not scattered if-statements, so it can be
   read at a glance and tested exhaustively. */

const ROLES = ['founder', 'manager', 'sales', 'workshop'];

/** 'all' = every row · 'own' = only rows belonging to them · false = no access */
const CAN = {
  founder: {
    dashboard: 'all', sales: 'all', finance: 'all', products: 'all',
    categories: 'all', branches: 'all', staff: 'all', attendance: 'all',
    payroll: 'all', tasks: 'all', sops: 'all', leaderboards: 'all',
    coupons: 'all', scores: 'all', invoices: 'all', expenses: 'all',
    settings: 'all', audit: 'all'
  },
  manager: {
    dashboard: 'all', sales: 'all', finance: false, products: 'all',
    categories: 'all', branches: 'read', staff: 'read', attendance: 'all',
    payroll: 'own', tasks: 'all', sops: 'all', leaderboards: 'all',
    coupons: 'all', scores: 'all', invoices: 'all', expenses: 'all',
    settings: false, audit: false
  },
  sales: {
    dashboard: 'own', sales: 'own', finance: false, products: 'read',
    categories: 'read', branches: false, staff: false, attendance: 'own',
    payroll: 'own', tasks: 'own', sops: 'read', leaderboards: 'all',
    coupons: false, scores: 'read', invoices: false, expenses: false,
    settings: false, audit: false
  },
  workshop: {
    dashboard: 'own', sales: false, finance: false, products: 'read',
    categories: 'read', branches: false, staff: false, attendance: 'own',
    payroll: 'own', tasks: 'own', sops: 'read', leaderboards: false,
    coupons: false, scores: false, invoices: false, expenses: false,
    settings: false, audit: false
  }
};

/** Fields no one below founder may ever receive, whatever they ask for. */
const SALARY_FIELDS = ['base_salary', 'commission_pct'];

/* ---------------- who is calling ---------------- */

let _user = undefined;   /* undefined = not yet resolved, null = anonymous */

/**
 * The signed-in staff member, or null.
 *
 * Session.getActiveUser() only returns an email when the caller is in the
 * same Workspace domain as the account the script runs as. That is exactly
 * the condition we deploy under, and it is why this version requires
 * Workspace rather than personal Gmail: on consumer accounts this returns
 * '' for everyone but the owner, and identity would have to be hand-rolled
 * with stored password hashes.
 */
function currentUser() {
  if (_user !== undefined) return _user;

  let email = '';
  try { email = (Session.getActiveUser().getEmail() || '').toLowerCase(); }
  catch (e) { email = ''; }
  if (!email) return (_user = null);

  const staff = findRow('staff', 'email', email);
  if (!staff || !staff.active) return (_user = null);

  _user = {
    id: staff.id, email: email, name: staff.name,
    role: String(staff.role || '').toLowerCase(),
    branch_id: staff.branch_id || null
  };
  if (ROLES.indexOf(_user.role) === -1) _user.role = 'workshop';   /* unknown = least */
  return _user;
}

/** Test seam: Tests.gs impersonates roles through this, nothing else. */
function _setUserForTest(u) { _user = u === undefined ? undefined : u; }

/* ---------------- guards ---------------- */

function Forbidden(msg) {
  const e = new Error(msg || 'Not allowed');
  e.forbidden = true;
  return e;
}

function requireUser() {
  const u = currentUser();
  if (!u) throw Forbidden('Sign in with your Toss Sports Google account.');
  return u;
}

function isFounder(u) { return !!u && u.role === 'founder'; }
function isAdmin(u)   { return !!u && (u.role === 'founder' || u.role === 'manager'); }

/**
 * The gate every internal endpoint passes through.
 * `need` is 'read' or 'write'; area is a key of CAN.
 * Returns the scope ('all' | 'own') so the caller can filter rows.
 */
function requireCan(area, need) {
  const u = requireUser();
  const level = (CAN[u.role] || {})[area];

  if (!level) throw Forbidden('Your role cannot open ' + area + '.');
  if (need === 'write' && level === 'read') {
    throw Forbidden('Your role can view ' + area + ' but not change it.');
  }
  return { user: u, scope: level === 'all' ? 'all' : (level === 'read' ? 'all' : level) };
}

/**
 * Salary privacy, enforced in one place so it cannot be forgotten.
 * A manager reading the staff list gets names and roles with the money
 * columns removed — not hidden in the UI, absent from the response.
 */
function scrubStaff(rows, user) {
  if (isFounder(user)) return rows;
  return rows.map(function (r) {
    const copy = {};
    Object.keys(r).forEach(function (k) {
      if (SALARY_FIELDS.indexOf(k) > -1 && r.id !== user.id) return;  /* their own is fine */
      copy[k] = r[k];
    });
    return copy;
  });
}

/**
 * Payroll is stricter still: only a founder sees anyone else's payslip.
 * This is checked here rather than at the call site precisely because the
 * brief calls it a hard requirement — one function, one rule, testable.
 */
function payrollVisibleTo(rows, user) {
  if (isFounder(user)) return rows;
  return rows.filter(function (r) { return r.staff_id === user.id; });
}

/** Orders: sales and workshop see only what they sold. */
function ordersVisibleTo(rows, user) {
  if (isAdmin(user)) return rows;
  return rows.filter(function (r) { return r.staff_id === user.id; });
}

/** Branch scoping — a manager pinned to a branch sees only that branch. */
function branchVisibleTo(rows, user) {
  if (isFounder(user) || !user.branch_id) return rows;
  return rows.filter(function (r) {
    return !r.branch_id || r.branch_id === user.branch_id;
  });
}

/* ---------------- the public surface ----------------
   Anonymous callers reach the PUBLIC deployment. There is no identity, so
   safety comes from the whitelist: an action not named here never runs,
   and none of these ever returns staff, payroll, expenses, coupons or the
   order book. */

const PUBLIC_ACTIONS = {
  'catalogue':      true,   /* active products + categories, for the shop */
  'settings':       true,   /* whatsapp number, shipping thresholds only */
  'placeOrder':     true,   /* totals RECOMPUTED server-side, see Api.gs */
  'validateCoupon': true,   /* returns valid/invalid — never lists codes */
  'claimReward':    true,   /* a score earns a code; the code is not guessable */
  'submitScore':    true,   /* game leaderboard */
  'leaderboard':    true
};

function assertPublicAction(action) {
  if (!PUBLIC_ACTIONS[action]) {
    throw Forbidden('Unknown action.');
  }
}
