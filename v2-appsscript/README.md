# Toss Sports v2 — Apps Script + Sheets

The same storefront and Maze Room, with Google Sheets as the database and
Apps Script as the API and auth layer. Replaces Supabase Postgres (13 tables,
31 RLS policies, 7 functions) and Firebase Auth.

**v1 is untouched.** It stays in the repository root and keeps working. This
folder is a parallel build you can run, compare and switch to — or discard.

---

## The one thing to understand first

An Apps Script web app can run **as you** or **as the person calling it** —
never both. That single constraint shapes the whole design.

| | Runs as | Who can call | Knows who you are? |
|---|---|---|---|
| **Public** deployment | The owner | Anyone, anonymously | No |
| **Internal** deployment | The owner | Only your Workspace domain | **Yes** |

The internal deployment gets verified identity because of a specific Apps
Script rule: when a script runs as the owner *and* the caller is in the same
Workspace domain, `Session.getActiveUser().getEmail()` returns the caller's
real address. That is the whole authentication system — no passwords, no
tokens, no session table.

**It only works on Google Workspace.** On personal Gmail that call returns
empty for everyone but the owner, and identity would have to be hand-rolled
with stored password hashes. That is why Workspace was the first question.

The spreadsheet itself is **never shared with staff**. They reach data only
through the script. This is what makes salary privacy enforceable — a
salesperson has no way to open the file and read the payroll tab.

---

## Setup

### 1. Create the script

1. [script.google.com](https://script.google.com) → **New project**, signed
   in as the **owner account on your Workspace domain**
2. Create five files matching `apps-script/` and paste each in:
   `Schema.gs` · `Db.gs` · `Auth.gs` · `Api.gs` · `Code.gs` · `Tests.gs`
3. Project Settings → tick **Show `appsscript.json`**, then paste that too

### 2. Build the database

Run `setupDatabase()` once from the editor. It creates the spreadsheet, all
17 tabs with locked headers, the default settings, the Chennai branch, the
Bats category, and **a founder record using your own email** — without that
last row, nobody can sign in.

The log prints the spreadsheet URL. Bookmark it.

### 3. Bring your data across

```bash
cd v2-appsscript/migrate
set SUPA_ANON_KEY=sb_publishable_…      # Windows; use export on Mac/Linux
node export-from-supabase.js
```

Products, categories, settings, scores and branches pull straight from
Supabase. The protected tables (orders, staff, payroll, expenses, invoices)
need a manual export first — Supabase dashboard → Table editor → ⋮ → *Export
as CSV* → drop the file into `migrate/` and re-run.

Then, per tab: **File → Import → Upload → Replace current sheet**, keeping
the header row.

### 4. Deploy twice

**Public** (the storefront):
- Run `markAsPublicSurface()` from the editor
- Deploy → New deployment → Web app
- Execute as: **Me** · Who has access: **Anyone**
- Copy the `/exec` URL

**Internal** (the Maze Room) — a *second* deployment of the same script:
- Run `markAsInternalSurface()`
- Deploy → New deployment → Web app
- Execute as: **Me** · Who has access: **Anyone within [your domain]**
- Copy that `/exec` URL

> Both deployments share one script and therefore one `TOSS_SURFACE`
> property. Re-run the matching `markAs…` before each deployment, and treat
> the property as belonging to whichever you deployed last. If you plan to
> update them often, copy the project into two separate Apps Script projects
> pointed at the same spreadsheet — cleaner, at the cost of pasting fixes
> twice.

### 5. Build the site

```bash
cd v2-appsscript
node build.js --public "https://script.google.com/…/exec" \
              --internal "https://script.google.com/…/exec" --pull
npx serve web -l 4322
```

`--pull` bakes the live catalogue into `web/js/baked.js` so the shop loads
instantly and costs no quota per visitor. Re-run after a price change.

### 6. Prove it is safe

Run `runAllTests()` from the editor and read the log. It impersonates all
four roles and asserts that every unauthorised read and write is **refused**
— including calling `api_payroll()` directly rather than through the UI.

Do not put this live until that suite is green.

---

## How it is arranged

```
Customer's browser                     Staff browser (signed into Workspace)
   │  baked catalogue renders first        │  Google session = identity
   │  then POST text/plain                 │  POST text/plain
   ▼                                       ▼
┌────────────────────┐              ┌──────────────────────┐
│ PUBLIC deployment  │              │ INTERNAL deployment  │
│ execute as owner   │              │ execute as owner     │
│ anonymous          │              │ domain-restricted    │
│                    │              │                      │
│ PUBLIC_ACTIONS     │              │ requireCan(area,rw)  │
│ whitelist ONLY     │              │ per-endpoint guards  │
└─────────┬──────────┘              └──────────┬───────────┘
          │                                    │
          └──────────────┬─────────────────────┘
                         ▼
              ┌──────────────────────┐
              │  Db.gs               │
              │  read whole tabs     │
              │  lookup maps         │
              │  LockService writes  │
              └──────────┬───────────┘
                         ▼
          Google Sheet (private to the owner)
          17 tabs · staff have NO direct access
```

**Where the locks are.** Every write goes through `withLock_()`, which takes
the document lock for up to 20 seconds:

| Operation | Why it needs the lock |
|---|---|
| `insertRow` | Two appends can compute the same last row and overwrite each other |
| `updateRow` | Read-modify-write; the read happens inside the lock |
| `deleteRow` | Row numbers shift under a concurrent write |
| `adjustStock` | **The important one** — two tills both read stock=5, both write 4, one bat vanishes |

A write holds the lock for well under a second, so a queue of the ~30
allowed concurrent executions clears comfortably inside the 20s wait. A
timeout is surfaced as *"The system is busy — please try again"* rather than
being swallowed.

---

## The limits, honestly

Measured against **100–500 orders a month**, which is the band this business
is actually in.

| Limit | Ceiling | At 500 orders/month | Verdict |
|---|---|---|---|
| Execution time | 6 min | Any single call < 5s | Fine |
| Concurrent executions | ~30 | Rarely above 2–3 | Fine |
| Script runtime | 90 min/day | ~10 min | Fine |
| Rows per tab | ~10 M cells total | 6,000 orders/year | Fine for years |
| Response time | — | **0.5–3s per call** | The real cost |

**What actually bites, in order:**

1. **Latency, not limits.** Every panel action waits 0.5–3 seconds against
   ~50–150ms for Supabase. The storefront hides this by baking the catalogue;
   the Maze Room cannot, and will feel slower. This is the honest price.
2. **Reading a whole tab per request.** `Db.gs` reads each tab once per
   execution and builds maps. Past roughly 5,000 orders, `api_bootstrap()`
   pulling the entire order book will start to drag — at that point it needs
   a date filter, not a rewrite.
3. **No transactions across tabs.** Placing an order writes the order, then
   adjusts stock. If the script dies between them, stock is right and the
   order exists — but a partial failure is possible in a way Postgres would
   have prevented. Low probability, non-zero.
4. **Concurrency ceiling is shared.** All Apps Script executions on the
   account count toward ~30. Other scripts on the same account compete.

---

## Weaker and stronger than v1

### Weaker

- **Access control is hand-written.** This is the big one. In v1, Postgres
  refused an unauthorised read even if every line of application code was
  wrong. Here, `Auth.gs` is the only thing standing in the way. An endpoint
  added later that forgets `requireCan()` is a hole, and nothing else will
  catch it. **Mitigation:** the test suite asserts every refusal — run it
  after any change to `Api.gs`.
- **Slower.** 0.5–3s per call versus ~50–150ms. Felt most in the panel.
- **No real transactions**, no foreign keys, no constraints. A cascade that
  the database used to guarantee is now application code.
- **The spreadsheet is a single point of failure.** Anyone with edit access
  to the file can break the schema by inserting a column. Only the owner
  should have it. Sheets version history is the safety net.
- **No storage tier.** Product photos live in Drive rather than a CDN, so
  they are slower and need their sharing set correctly.

### Stronger

- **Order totals can no longer be forged.** v1 accepted the browser's total
  and the PRD flagged it (§9.2). Here the server recomputes every line from
  the products tab and ignores what the browser claims, recording a mismatch
  in the audit log. **This version is genuinely more correct than v1 here.**
- **No passwords anywhere.** Identity is Google's. v1 stored Firebase
  credentials and bound UIDs to staff rows; there is nothing to leak.
- **The client can read their own data.** Your team can open the sheet, sort,
  filter and build their own pivot — no SQL, no dashboard to learn.
- **No vendor account to manage, and nothing pauses.** Supabase free projects
  sleep after a week of inactivity; a Sheet does not.
- **Backups are free and familiar.** File → Version history, or download the
  whole database as one `.xlsx`.
- **Everything lives in one Google account** you already pay for.

### Unchanged

Storefront UX and product data shape · cart and checkout · WhatsApp and
Razorpay paths · the Gully Cricket game · the rule-based chatbot (still no
external AI) · the living navbar · offline-first rendering.

---

## Where each v1 concept went

| v1 (Postgres + Firebase) | v2 (Sheets + Apps Script) |
|---|---|
| 13 tables | 17 tabs, declared in `SCHEMA` |
| 31 RLS policies | `CAN` matrix + `requireCan()` guards |
| `auth.jwt() ->> 'sub'` | `Session.getActiveUser().getEmail()` |
| Firebase Auth | Google Workspace sign-in |
| `is_admin()`, `my_role()` | `isAdmin()`, `currentUser().role` |
| `customer_stats` view | `api_customerStats()`, computed live |
| Stock triggers | `adjustStock()` under `LockService` |
| Audit triggers | `audit()` on each mutating endpoint |
| `next_invoice_no()` | *Not yet ported — see below* |
| Supabase Storage | Google Drive folder |
| Publishable key + RLS | `PUBLIC_ACTIONS` whitelist |

---

## Not yet ported

Honest scope. These exist in v1 and are **not** in this build:

- **GST invoicing** — the `invoices` tab and schema are in place, but
  `next_invoice_no()` and the bill renderer are not. Until then v2 can take
  orders but not raise a tax invoice.
- **Branch stock split** — v2 keeps one stock number per product, as v1 did
  before migration 009. The `branches` tab exists and orders record a branch.
- **The Insights views** (product profit, dead stock, repeat customers) and
  the health check.
- **Excel/PDF export** — `maze-export.js` is copied across and works, but the
  report builders that feed it read Supabase shapes and need repointing.

None are hard; they are simply beyond a first working cut.
