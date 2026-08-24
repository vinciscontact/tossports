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

## 2. Auth is Supabase's own — no Firebase (changed Aug 2026)

The Maze Room used to sign in through Firebase and hand the token to
Supabase as a third-party JWT. That handoff failed silently — tokens got
rejected, the session degraded to anonymous, and every admin write
(including photo uploads) was refused with an opaque 403.

Login is now **Supabase Auth email+password** directly: the token that
signs you in is the token RLS checks. If you migrated from the Firebase
setup, run `sql/012-supabase-auth.sql` once.

The old Firebase project and the Third-Party Auth entry in Supabase are
unused and can be deleted once everyone has signed in.

---

## 3. Create your admin user

Supabase Dashboard → **Authentication** → **Users** → **Add user**.

- Use the **same email** as your staff row (the seeded owner is the email
  in `sql/003-claim-by-email.sql`).
- Tick **Auto Confirm** so the login works immediately.
- Use a strong password — this is the key to your till.

No UID copying is needed: the first successful sign-in binds the login to
the staff row by email (`claim_staff`).

### Forgot password (one-time config)

The gate has a **Forgot password?** link. For the emailed reset link to come
back to the Maze Room, tell Supabase where the page lives:

Supabase Dashboard → **Authentication** → **URL Configuration**:
- **Site URL**: `https://tossports.in/maze.html` (the production Maze Room)
- **Additional redirect URLs**: add `http://localhost:4321/maze.html` for
  local work.

Emails are sent by Supabase's built-in mailer — fine for a small team, but
rate-limited to a few per hour. If resets ever need to come from
`@tossports.in`, plug SMTP credentials into **Authentication → Emails**.

### Backup owner (do this once)

If the only owner loses both the password **and** the email inbox, the
reset link cannot help. Guard against it now: add a second owner on a
different mailbox (personal vs business), from **Team → Add person** →
role **owner** → Create login. Either owner can then rescue the other.

---

## 4. ~~Let Supabase trust Firebase~~ — no longer needed

Kept only so old links to "step 4" make sense. There is no third-party
token handoff any more.

---

## 5. Put yourself on the staff list — ✅ already done

You're on it as **owner**, by email. Your login UID binds itself the first
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
needs a Supabase Auth user created the same way as step 3; binding to their
staff record happens by email on their first sign-in.

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

Serve the folder rather than opening the file directly:

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
