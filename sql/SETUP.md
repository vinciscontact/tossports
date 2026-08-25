# Maze Room — one-time setup

Six steps, about ten minutes. Do them in order.

---

## 1. Create the database — ✅ already done

`sql/schema.sql` has been applied to your project. Verified live:
29 products, 2 coupons, 6 settings, RLS on all 6 tables, 14 policies.

Re-run it in the SQL Editor only if you ever need to reset.

> **Connection note:** `db.rbrokxstbzewdjdfhiwk.supabase.co` does not resolve —
> this project has no direct IPv4 host. Use the pooler instead:
> `aws-0-ap-northeast-1.pooler.supabase.com:5432`, user `postgres.rbrokxstbzewdjdfhiwk`.

---

## 2. Turn on Firebase email login — ✅ already done

Verified against your project `toss-cb8c0`: Email/Password sign-in is enabled.
Nothing to do here.

---

## 3. Create your admin user

Firebase Console → **Authentication** → **Users** → **Add user**.

Use a real email and a strong password. This is the login for the Maze Room,
so treat it like the key to your till.

Then **copy that user's UID** — the long string in the Users table.

---

## 4. Let Supabase trust Firebase

This is the step that makes the security real rather than cosmetic.

Supabase Dashboard → **Authentication** → **Sign In / Providers** →
**Third Party Auth** → **Add provider** → **Firebase**.

Enter your Firebase project ID: `toss-cb8c0`

Without this, Supabase ignores your Firebase login and the admin lock would
only be a hidden screen, not an actual permission.

---

## 5. Put yourself on the staff list — ✅ already done

You're on it as **owner**, by email. Your Firebase UID binds itself the first
time you sign in successfully — nothing to copy or paste.

The rest of this section is for adding your team later.

---

<details>
<summary>Reference — adding people manually</summary>

Back in the Supabase **SQL Editor**, run this with your UID from step 3:

```sql
insert into public.staff (uid, name, email, role)
values ('PASTE_YOUR_FIREBASE_UID', 'Your Name', 'you@example.com', 'owner');
```

Only people in `staff` can see or change anything. Everyone else — including
anyone who reads the publishable key out of the page source — can read active
products and place an order, and nothing more.

Once you're in, add the rest of your team from **Team → Add person**. Each one
needs a Firebase user created the same way as step 3; paste their UID into their
staff record so they can log in.

### The four roles

| Role | Can see |
|---|---|
| **owner** | Everything, including salaries and finance |
| **manager** | Everything except salary amounts and the staff roster edit |
| **sales** | Their own sales, targets, tasks and SOPs |
| **workshop** | Their tasks and workshop SOPs only |

Salary is private by design: a manager sees their own payslip and nobody else's.

</details>

---

## ⚠️ Do not re-run schema.sql to "fix" a problem

An earlier version of `schema.sql` kept administrators in a separate `admins`
table. Re-running it after the operations layer recreated that table and
reverted `is_admin()` to read it — which silently locked every administrator
out of orders, expenses, coupons, settings, SOPs, attendance and tasks.

That is fixed: all four SQL files now define the same `staff` table and the
same role helpers, and each has been verified to run twice in any order
without changing behaviour or duplicating data. But if the Maze Room ever
misbehaves, read the banner at the top of the page rather than re-running SQL —
it names the actual failure.

---

## 6. Open it

Firebase auth will not run from a `file://` page, so serve the folder:

```bash
npx serve "C:/TheVincis/Toss analysis/Toss core website"
```

Then open the address it prints and add `/maze.html`.

---

## What is and isn't a secret

| Value | Safe in source? | Why |
|---|---|---|
| Supabase project URL | yes | public endpoint |
| `sb_publishable_...` key | yes | protected by RLS, not secrecy |
| Firebase web config | yes | identifiers, not credentials |
| **Postgres password** | **NO** | full database access, bypasses every policy |
| **`service_role` key** | **NO** | same — bypasses every policy |

The password shared during setup should be rotated:
Supabase → Settings → Database → **Reset database password**.

---

## Honest limits

Discount codes are awarded from the browser after a game, so a determined
person could call the reward function directly and grant themselves a code.
The codes are no longer *listed* publicly, and every code is still validated
server-side for existence, active status and minimum spend — but the score
itself isn't verified. If that ever costs real money, the fix is to move
scoring behind an Edge Function.
