-- ============================================================
--  TOSS SPORTS — CUSTOMER ACCOUNTS
--
--  The PRD listed customer accounts as out of scope ("no demand
--  identified"). The client has since asked for them: sign in,
--  see past orders, reorder, keep addresses, follow a delivery.
--
--  Sign-in is Google, through Supabase Auth. That decision is
--  what shapes this file, because of one awkward fact:
--
--      Google gives us a verified EMAIL.
--      Every order ever placed carries only a PHONE.
--
--  js/app.js collects name, phone, address, city, pin and state
--  at checkout — never an email. So a new account cannot simply
--  be matched to its history; there is no shared column to match
--  on. Three mechanisms below close that gap, in order of how
--  much they can be trusted:
--
--    1. FROM NOW ON  — orders_stamp_user() writes the signed-in
--       user's id onto the order as it is placed. Nothing to
--       reconcile later; this is the path that matters long term.
--
--    2. SERVICE REQUESTS — `requests` does collect an email, and
--       Google has verified the one in the token, so those link
--       themselves with no help from the customer.
--
--    3. PAST ORDERS — claim_orders() below. The customer proves
--       one order is theirs and everything on that phone follows.
--
--  Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  1. WHO AN ORDER BELONGS TO
--
--  Nullable, and it must stay nullable. Most orders in this
--  business arrive over WhatsApp or across a counter and will
--  never have an account behind them; a not-null column would
--  make the storefront's anonymous checkout — the one that takes
--  most of the money — impossible.
--
--  ON DELETE SET NULL rather than CASCADE. If a customer deletes
--  their account the order does not evaporate: it is a financial
--  record the business is required to keep, and the shop still
--  has to post the bat. Only the link goes.
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.requests
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Partial: the account area only ever asks for rows that HAVE an
-- owner, and the majority of this table never will. Indexing the
-- nulls would be most of the table for no read it serves.
create index if not exists orders_user_idx
  on public.orders (user_id, created_at desc) where user_id is not null;

create index if not exists requests_user_idx
  on public.requests (user_id, created_at desc) where user_id is not null;


-- ------------------------------------------------------------
--  2. THE PROFILE
--
--  Deliberately thin. Name, phone and a list of addresses — the
--  things that make the next checkout shorter. It holds nothing
--  that is not already in an order, so a leak here costs nothing
--  a leaked order would not have cost anyway.
--
--  `addresses` is jsonb and not its own table for the same reason
--  `orders.items` is jsonb: this codebase already made that
--  choice, and a customer has three addresses, not three hundred.
--
--  No email column with a UNIQUE on it. Supabase Auth already
--  owns the email and already enforces uniqueness; a second copy
--  here would only be a second thing to keep in step.
-- ------------------------------------------------------------
create table if not exists public.customer_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  addresses  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

-- A customer may read and write exactly one row: their own. The
-- WITH CHECK is what stops the obvious attack — sending someone
-- else's user_id in the body of an insert or an update.
drop policy if exists cp_own_read on public.customer_profiles;
create policy cp_own_read on public.customer_profiles
  for select using (user_id = auth.uid());

drop policy if exists cp_own_insert on public.customer_profiles;
create policy cp_own_insert on public.customer_profiles
  for insert with check (user_id = auth.uid());

drop policy if exists cp_own_update on public.customer_profiles;
create policy cp_own_update on public.customer_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Staff need to see a customer to help them on the phone, but
-- nobody in the Maze Room has any business editing someone's
-- saved address behind their back. Read only, on purpose.
drop policy if exists cp_admin_read on public.customer_profiles;
create policy cp_admin_read on public.customer_profiles
  for select using (public.is_admin());

create or replace function public.customer_profiles_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- user_id is the primary key and the whole basis of the policy
  -- above. Pinning it to the caller means an UPDATE that tries to
  -- move a row to another account changes nothing instead.
  new.user_id := coalesce(auth.uid(), old.user_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists customer_profiles_touch on public.customer_profiles;
create trigger customer_profiles_touch
  before update on public.customer_profiles
  for each row execute function public.customer_profiles_touch();


-- ------------------------------------------------------------
--  3. A CUSTOMER READS THEIR OWN ORDERS — AND ONLY THOSE
--
--  `orders` has been admin-read-only since schema.sql, and the
--  comment there ("a customer may place an order but may never
--  read the order book") is still right. This does not loosen it.
--  Postgres ORs multiple SELECT policies together, so this adds
--  exactly one row-shaped hole per signed-in customer: the rows
--  already stamped with their own id.
--
--  Note what is NOT here. There is no update policy and no delete
--  policy for customers. Cancelling an order is a conversation
--  with a person, not a button that rewrites a financial record.
-- ------------------------------------------------------------
drop policy if exists orders_own_read on public.orders;
create policy orders_own_read on public.orders
  for select using (user_id is not null and user_id = auth.uid());

drop policy if exists requests_own_read on public.requests;
create policy requests_own_read on public.requests
  for select using (user_id is not null and user_id = auth.uid());


-- ------------------------------------------------------------
--  4. STAMPING THE OWNER ON THE WAY IN
--
--  A separate trigger rather than a few lines inside
--  orders_sanitise(), because that function returns early for
--  staff (`if public.my_role() is not null then return new`) and
--  the stamp has to be decided for staff too — by NOT applying.
--
--  Why staff are excluded: a salesperson logging a walk-in sale
--  is signed in as themselves. Stamping their uid would file the
--  customer's bat under the salesperson's own order history and
--  show it to them in the account area. The customer who actually
--  bought it can still claim it later by phone, which is correct.
--
--  Postgres fires BEFORE ROW triggers in name order, so
--  `orders_sanitise_ins` (016) runs before `orders_stamp_user`.
--  That order does not matter today — the two touch different
--  columns — but it is worth knowing before a third is added.
--
--  A forged user_id in the POST body is not a concern either way:
--  orders_public_insert grants the whole row, but this trigger
--  overwrites the column afterwards, so what the browser claimed
--  never survives. The same reasoning as orders_sanitise itself.
-- ------------------------------------------------------------
create or replace function public.orders_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then
    new.user_id := auth.uid();          -- null for anonymous checkout
  else
    new.user_id := null;                -- staff-logged sale belongs to nobody yet
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_user on public.orders;
create trigger orders_stamp_user
  before insert on public.orders
  for each row execute function public.orders_stamp_user();

create or replace function public.requests_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then
    new.user_id := auth.uid();
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_stamp_user on public.requests;
create trigger requests_stamp_user
  before insert on public.requests
  for each row execute function public.requests_stamp_user();


-- ------------------------------------------------------------
--  5. CLAIMING WHAT CAME BEFORE
--
--  The customer types one order number and the phone it was
--  placed with. If the pair matches a real order, every unclaimed
--  order on that phone becomes theirs.
--
--  Why a whole phone rather than the single order named: someone
--  with five past orders should not have to find five order
--  numbers, and the pair is already the proof. The exposure is
--  bounded by how hard the id is to produce — newOrderId() in
--  js/app.js is 'TOSS-' + six base-36 digits of the millisecond
--  clock + three random digits, so hitting one without having
--  been sent it means guessing an exact millisecond and then one
--  of 900. This is the same bar track_order() has enforced since
--  011; it is not a new class of access, only a larger prize
--  behind the same lock.
--
--  `and o.user_id is null` is the line that matters most. Without
--  it, a second person knowing the same phone — a shared family
--  number, a resold SIM — could pull orders out of an account
--  that already holds them. Claiming is one-way and first-come.
--
--  SECURITY DEFINER because the caller cannot see the order book
--  to check the pair for themselves; that is the entire point.
--  Granted to `authenticated` only: there is no such thing as an
--  anonymous claim, and anon already has track_order().
-- ------------------------------------------------------------
create or replace function public.claim_orders(p_id text, p_phone text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    uuid    := auth.uid();
  v_digits text    := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_proven boolean;
  v_orders integer := 0;
  v_reqs   integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in before claiming an order.' using errcode = '28000';
  end if;

  -- Ten digits, matched from the right, exactly as track_order does:
  -- somebody who typed +91 98765 43210 at checkout will type
  -- 9876543210 here and both have to land on the same order.
  if length(v_digits) < 10 then
    raise exception 'A 10-digit phone number is required.' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.orders o
     where lower(o.id) = lower(trim(coalesce(p_id, '')))
       and right(regexp_replace(coalesce(o.customer->>'phone', ''), '\D', '', 'g'), 10) = v_digits
  ) into v_proven;

  -- Deliberately indistinguishable from "that pair is wrong": a
  -- function that answered differently for a real order number
  -- with the wrong phone would confirm the order number exists.
  if not v_proven then
    return 0;
  end if;

  update public.orders o
     set user_id = v_uid
   where o.user_id is null
     and right(regexp_replace(coalesce(o.customer->>'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_orders = row_count;

  -- Service requests carry the same phone, and someone claiming
  -- their orders means the Bat Doctor repair on the same number
  -- too. Counted separately so the caller can say so.
  update public.requests r
     set user_id = v_uid
   where r.user_id is null
     and right(regexp_replace(coalesce(r.customer->>'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_reqs = row_count;

  return v_orders + v_reqs;
end;
$$;

revoke all on function public.claim_orders(text, text) from public;
grant execute on function public.claim_orders(text, text) to authenticated;


-- ------------------------------------------------------------
--  6. THE FREE HALF — LINKING BY VERIFIED EMAIL
--
--  `requests` has collected an email since 011, and the address
--  in a Google token has been verified by Google. Those two facts
--  together mean service requests need no claim step at all.
--
--  Orders now do the same. Checkout gained an OPTIONAL email
--  field alongside this migration (js/app.js), for exactly this
--  reason: an order that carries one attaches itself on sign-in,
--  and only the orders placed before that — or by someone who
--  left the field blank — need section 5's claim.
--
--  Matching on a Google-verified address is safe in a way that
--  matching on a typed phone number would not be. The customer
--  cannot type someone else's address into their own token; they
--  can type anyone's phone into a form. That asymmetry is why
--  this one is automatic and claiming is not.
--
--  Called on every sign-in. Cheap, idempotent, and it catches
--  somebody who checks out and signs in a minute later.
-- ------------------------------------------------------------
drop function if exists public.link_my_requests();

create or replace function public.link_my_history()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_orders integer := 0;
  v_reqs   integer := 0;
begin
  if v_uid is null or v_email = '' then
    return 0;
  end if;

  update public.orders o
     set user_id = v_uid
   where o.user_id is null
     and lower(trim(coalesce(o.customer ->> 'email', ''))) = v_email;
  get diagnostics v_orders = row_count;

  update public.requests r
     set user_id = v_uid
   where r.user_id is null
     and lower(trim(coalesce(r.customer ->> 'email', ''))) = v_email;
  get diagnostics v_reqs = row_count;

  return v_orders + v_reqs;
end;
$$;

revoke all on function public.link_my_history() from public;
grant execute on function public.link_my_history() to authenticated;

-- Orders are matched by email on every sign-in, so the lookup gets
-- an index rather than a sequential scan of the whole order book.
-- Partial, because only unclaimed rows are ever searched.
create index if not exists orders_email_idx
  on public.orders (lower(customer ->> 'email')) where user_id is null;


-- ============================================================
--  VERIFY
--
--  As a signed-in CUSTOMER (not staff), all four must hold:
--
--    -- 1. sees only their own orders, never the book
--    select count(*) from public.orders;
--
--    -- 2. cannot read anybody's profile but their own
--    select count(*) from public.customer_profiles;
--
--    -- 3. is not staff and never became staff
--    select public.my_role(), public.is_admin();   -- null, false
--
--    -- 4. cannot take an order that already has an owner
--    select public.claim_orders('<someone-elses-id>', '<their phone>');
--         -- 0 once that order is claimed, whatever the pair
-- ============================================================
