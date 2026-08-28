# Orders ⇄ Google Sheet

Two-way sync between the `orders` table and one spreadsheet. Orders appear
in Sheets so they can be sorted, filtered and pivoted freely; four
fulfilment fields can be edited there and pushed back.

**Supabase remains the source of truth.** The Sheet is a working copy that is
allowed to propose changes to a short list of fields, and is refused when it
is out of date.

---

## What can be edited in the Sheet

| Editable | Read-only |
|---|---|
| `status` (dropdown) | order id, date, customer, phone |
| `courier` | items, total, method, channel |
| `tracking_no` | everything else |
| `tracking_url` | |

Read-only columns are shaded grey. Typing in them changes the Sheet and
nothing else — the next pull overwrites it.

Money, items and customer details are deliberately not writable. The
database prices every order itself (`sql/016`, `sql/019`) and a spreadsheet
is not the place to renegotiate a total.

---

## The safety rule

The real danger in a two-way sync is not a write that fails. It is a write
that **succeeds when it should not have**:

```
09:00  you open the Sheet. The row says status = new.
10:00  a salesperson marks that order shipped in the Maze Room.
11:00  the sync pushes your 09:00 row back. The order is "new" again.
```

Nothing errors, nobody is told, and the bat does not go out.

So every write-back is filtered on the row version the Sheet last read:

```
PATCH /orders?id=eq.TOSS-ABC123&version=eq.7
```

If anyone changed that order in the meantime it is on version 8, the filter
matches nothing, **zero rows update**, and the Sync column says:

> CONFLICT — changed elsewhere, your edit was not saved

The edit is not retried without the guard. Someone else's change is newer
than yours; the next pull shows theirs, and you re-apply on top if you still
want to. Requires `sql/021-order-versioning.sql`.

The `_version` column is hidden on purpose. It is machinery, not
information, and editing it by hand disarms the check protecting you.

---

## Setup

### 1. Create the spreadsheet and script

New Google Sheet → **Extensions → Apps Script** → paste `Code.gs` over the
default file → Save.

### 2. Give it the keys

**Project Settings → Script properties → Add script property:**

| Property | Value |
|---|---|
| `SUPA_URL` | `https://rbrokxstbzewdjdfhiwk.supabase.co` |
| `SUPA_SERVICE` | your **service_role** key, from Supabase → Settings → API |

> **The `service_role` key bypasses every row-level security policy in the
> database.** It belongs in Script Properties — server side, never in a
> cell, never in this repository, never anywhere a browser can reach it.
> Anyone who can open the Apps Script project can read it, so share the
> spreadsheet with as few people as the job allows. If it leaks, rotate it
> in the Supabase dashboard immediately; nothing else will contain it.

The Sheet needs `service_role` rather than the publishable key because
`orders` is deliberately not readable by anybody except staff — that is the
policy protecting the order book, and this is the one place it is stepped
around on purpose.

### 3. Build the sheet

Run `setupSheet()` once from the editor. It creates the **Orders** tab with
its headers, the status dropdown, the grey read-only shading and the hidden
version column, plus a **Sync log** tab.

### 4. Fill it

Run `syncOrders()`, or use the **Toss → Sync now** menu that appears in the
spreadsheet after a reload.

### 5. Run it on a schedule

**Triggers → Add trigger** → `syncOrders` → Time-driven → whatever cadence
suits. Every 15 minutes is plenty for 100–500 orders a month.

---

## How a run works

Push first, then pull — and that order matters.

1. **Push.** Every row whose editable cells differ from the server is
   PATCHed, filtered on its version. Successes are noted in the Sync column;
   failures are marked CONFLICT.
2. **Pull.** The whole table is rewritten from Supabase, refreshing values
   and versions. CONFLICT notes are carried across by order id so they
   survive the rewrite.

Pulling first would refresh the version column underneath a pending edit and
hand it a guard that always passes — defeating the entire mechanism.

Runs take the script lock, so two overlapping triggers cannot both push.

---

## Limits, honestly

- **5,000 orders.** Both directions are capped. Past that the pull needs
  paging and the full rewrite gets slow — it is years away at current volume.
- **Full rewrite each pull.** Simple and correct, but it means sorting or
  filtering the Orders tab is undone on every sync. Do that work in a pivot
  on another tab, or a filter view.
- **Formatting is not preserved** on the Orders tab for the same reason.
- **Deleting a row in the Sheet deletes nothing.** It reappears on the next
  pull. Deletion is not one of the things the Sheet is allowed to propose.
- **Anyone with edit access to the spreadsheet can change order statuses**
  in the live database. That is the trade the write-back buys. Share
  accordingly.
