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

## 2. Auth is Supabase — ✅ nothing to configure

Sign-in used to go through Firebase, and the Firebase token was handed to
Supabase as a third-party JWT. That handoff had one failure mode and it was a
bad one: if the provider was not registered, Supabase answered 401 to *every*
request, and the Maze Room opened into a signed-in-looking shell where nothing
loaded and every save was refused.

Supabase now issues the token its own policies read, so that whole class of
failure is gone. There is no second console, no provider to register, and no
project ID to keep in step.

Verified against your project: the email provider is **enabled** and sign-ups
are **allowed**.

> **Email confirmation is ON** (`mailer_autoconfirm: false`). A newly created
> login cannot sign in until its email is confirmed. Either have them click the
> link, or confirm them yourself under **Authentication → Users**. The Maze Room
> warns you about this when it creates a login.

---

## 3. Create your admin user

Supabase Dashboard → **Authentication** → **Users** → **Add user**.

- Use a real email and a strong password — this is the key to your till.
- Tick **Auto Confirm User** so they can sign in straight away.

You do **not** need to copy the user's UID anywhere. `claim_staff()` matches on
email and binds the account to the staff row the first time they sign in.

---

## 4. Run the auth migration

Run `sql/013-supabase-auth.sql` in the SQL Editor.

`staff.uid` used to hold Firebase UIDs, which no longer match anything. The
migration clears them so each person re-binds by email on their next sign-in.
It is safe to run more than once.

If nobody can get in afterwards, it is because no unclaimed owner row exists —
the migration raises a warning saying exactly that, with the SQL to fix it.

---

## 5. Put yourself on the staff list — ✅ already done

You're on it as **owner**, by email. Your Supabase user id binds itself the
first time you sign in successfully — nothing to copy or paste.

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

Once you're in, add the rest of your team from **Team → Add person**. The
**Create login** button there makes their Supabase account and shows the password
once — copy it before you close the dialog. Their account binds to the staff row
the first time they sign in.

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

Auth will not run from a `file://` page, so serve the folder:

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
| Supabase publishable key | yes | protected by RLS, not by secrecy |
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
