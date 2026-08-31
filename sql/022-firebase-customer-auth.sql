-- ============================================================
--  TOSS SPORTS — CUSTOMER IDENTITY MOVES TO FIREBASE
--
--  Customers sign in with Firebase (phone OTP and email and
--  password). STAFF ARE NOT TOUCHED — the Maze Room keeps using
--  Supabase Auth, so a problem on the customer side cannot lock
--  anybody out of their own admin panel. That is exactly what
--  happened the last time these two were entangled (see 013).
--
--  ─────────────────────────────────────────────────────────────
--  WHY THE COLUMNS HAVE TO CHANGE
--
--  018 built customer accounts on Supabase Auth:
--
--    user_id uuid references auth.users(id)   +   auth.uid()
--
--  A Firebase UID is a 28-character string, not a UUID, and there
--  is no auth.users row behind it. Both halves of that line are
--  therefore wrong now: the type cannot hold the value, and the
--  foreign key points at a table the user will never be in.
--
--  So user_id becomes text and the policies read the token
--  directly. This is not a new pattern in this schema — staff.uid
--  has been `text unique` matched on auth.jwt() ->> 'sub' since
--  002, from when staff were on Firebase too.
--
--  ─────────────────────────────────────────────────────────────
--  THE THING THIS BUYS: HISTORY LINKS ITSELF
--
--  Every order this shop has ever taken carries a PHONE and no
--  email. On Supabase that was the whole problem — Google gave an
--  email, orders held a phone, and nothing joined them without the
--  customer proving ownership through a claim form.
--
--  Firebase phone sign-in ends that. The token carries
--  `phone_number`, and Firebase only issues it after an OTP has
--  actually been answered on that handset. So the number in the
--  token is VERIFIED, and matching it against the phone on an
--  order is safe in a way that matching a number somebody typed
--  into a form never was.
--
--  A customer signs in with the number they ordered with, and
--  their history is simply there.
--
--  ⚠ REQUIRES, in the Supabase dashboard, and nothing works
--    without it: Authentication → Third Party Auth → add Firebase,
--    with the project id. If Firebase is not registered, Supabase
--    rejects the token and every request 401s — including ones
--    that would have succeeded anonymously. That is PRD C1, it is
--    what broke the Maze Room before, and it is the single step
--    most likely to be missed.
--
--  Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  0. THIS FILE STANDS ALONE
--
--  It used to assume 018 had just run and left uuid columns
--  behind for it to convert. That assumption breaks the moment
--  018 is re-run against a database this file has ALREADY
--  converted: 018 tries to recreate its policies as
--  `user_id = auth.uid()`, the column is text by then, and
--  Postgres refuses with
--
--      operator does not exist: text = uuid
--
--  Two migrations owning the type of one column is the actual
--  fault. So this one now creates whatever is missing as text,
--  converts whatever is uuid, and does not care which of the two
--  states it finds. 018 is no longer required ahead of it.
-- ------------------------------------------------------------
create table if not exists public.customer_profiles (
  user_id    text primary key,
  name       text,
  phone      text,
  addresses  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;

-- text, not uuid: a Firebase UID is a 28-character string. On a
-- database that already has these as uuid, section 2 converts them.
alter table public.orders   add column if not exists user_id text;
alter table public.requests add column if not exists user_id text;

-- Partial: the account area only ever asks for rows that HAVE an
-- owner, and most of this table never will.
create index if not exists orders_user_idx
  on public.orders (user_id, created_at desc) where user_id is not null;
create index if not exists requests_user_idx
  on public.requests (user_id, created_at desc) where user_id is not null;


-- ------------------------------------------------------------
--  1. DROP THE POLICIES THAT DEPEND ON THE COLUMNS
--
--  A column's type cannot change while a policy references it.
--  These are all recreated in section 3.
-- ------------------------------------------------------------
drop policy if exists orders_own_read   on public.orders;
drop policy if exists requests_own_read on public.requests;
drop policy if exists cp_own_read       on public.customer_profiles;
drop policy if exists cp_own_insert     on public.customer_profiles;
drop policy if exists cp_own_update     on public.customer_profiles;
drop policy if exists cp_admin_read     on public.customer_profiles;


-- ------------------------------------------------------------
--  2. uuid → text
--
--  The old values are Supabase user UUIDs. They are cast rather
--  than dropped so nothing is destroyed, then blanked, because a
--  Supabase UUID will never equal a Firebase UID and leaving it
--  in place would only mean a row nobody can ever read again.
--  Those customers re-link on their next sign-in — by phone
--  automatically, or through claim_orders() as before.
-- ------------------------------------------------------------
--  ⚠ The whole conversion is guarded on the column STILL BEING uuid.
--
--  Without that guard this file is not re-runnable, and this file is
--  part of COMPLETE-SCHEMA, which the setup guide tells people to run
--  whenever they are unsure. The `delete from customer_profiles` below
--  is correct exactly once — on the way across from Supabase UIDs. Run
--  unguarded a second time it would wipe every saved address in the
--  business, silently, as part of a command whose own header promises
--  it is safe to repeat.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name = 'user_id' and data_type = 'uuid'
  ) then

    alter table public.orders   drop constraint if exists orders_user_id_fkey;
    alter table public.requests drop constraint if exists requests_user_id_fkey;

    alter table public.orders
      alter column user_id type text using user_id::text;
    alter table public.requests
      alter column user_id type text using user_id::text;

    -- Old values are Supabase UUIDs. Cast rather than dropped so nothing
    -- is destroyed, then blanked, because a Supabase UUID will never
    -- equal a Firebase UID and leaving it would only mean a row nobody
    -- can read again. Those customers re-link on their next sign-in —
    -- by phone automatically, or through claim_orders().
    update public.orders   set user_id = null where user_id is not null;
    update public.requests set user_id = null where user_id is not null;

    -- customer_profiles.user_id is the primary key, so the key and the
    -- foreign key both have to come off before the type will move.
    alter table public.customer_profiles
      drop constraint if exists customer_profiles_user_id_fkey;
    alter table public.customer_profiles
      drop constraint if exists customer_profiles_pkey;

    -- Nothing in it survives the change of identity system, and a
    -- profile is a name, a phone and addresses — cheap to type again.
    delete from public.customer_profiles;

    alter table public.customer_profiles
      alter column user_id type text using user_id::text;
    alter table public.customer_profiles
      add primary key (user_id);

    raise notice 'Customer identity converted from Supabase UUIDs to Firebase UIDs.';
  else
    raise notice 'Customer identity is already text — conversion skipped.';
  end if;
end $$;


-- ------------------------------------------------------------
--  3. POLICIES, READING THE TOKEN DIRECTLY
--
--  auth.uid() casts the `sub` claim to uuid and returns null when
--  it is not one — which for a Firebase token is always. Reading
--  the claim as text is the only thing that works, and it is what
--  my_role() has always done for staff.
-- ------------------------------------------------------------
create policy orders_own_read on public.orders
  for select using (
    user_id is not null and user_id = auth.jwt() ->> 'sub'
  );

create policy requests_own_read on public.requests
  for select using (
    user_id is not null and user_id = auth.jwt() ->> 'sub'
  );

create policy cp_own_read on public.customer_profiles
  for select using (user_id = auth.jwt() ->> 'sub');

create policy cp_own_insert on public.customer_profiles
  for insert with check (user_id = auth.jwt() ->> 'sub');

create policy cp_own_update on public.customer_profiles
  for update using (user_id = auth.jwt() ->> 'sub')
           with check (user_id = auth.jwt() ->> 'sub');

-- Staff may look a customer up to help them on the phone. Still
-- read-only: nobody in the Maze Room edits somebody's saved
-- address behind their back.
create policy cp_admin_read on public.customer_profiles
  for select using (public.is_admin());


-- ------------------------------------------------------------
--  4. STAMPING THE OWNER ON THE WAY IN
-- ------------------------------------------------------------
create or replace function public.orders_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A staff-logged sale belongs to the customer, not to the
  -- salesperson who typed it. Same reasoning as 018.
  if public.my_role() is null then
    new.user_id := auth.jwt() ->> 'sub';     -- null for anonymous checkout
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.requests_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then
    new.user_id := auth.jwt() ->> 'sub';
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.customer_profiles_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.user_id := coalesce(auth.jwt() ->> 'sub', old.user_id, new.user_id);
  return new;
end;
$$;

-- The triggers themselves, not just the functions they call. 018 used to
-- create these; now that this file no longer depends on 018 having run,
-- it has to attach them itself — a redefined function with no trigger
-- pointing at it does nothing at all.
drop trigger if exists customer_profiles_touch on public.customer_profiles;
create trigger customer_profiles_touch
  before update on public.customer_profiles
  for each row execute function public.customer_profiles_touch();

drop trigger if exists orders_stamp_user on public.orders;
create trigger orders_stamp_user
  before insert on public.orders
  for each row execute function public.orders_stamp_user();

drop trigger if exists requests_stamp_user on public.requests;
create trigger requests_stamp_user
  before insert on public.requests
  for each row execute function public.requests_stamp_user();


-- ------------------------------------------------------------
--  5. LINKING HISTORY — NOW MOSTLY AUTOMATIC
--
--  Two verified claims, two ways in:
--
--    phone_number  present only after an OTP was answered on that
--                  handset, so it can be matched against the phone
--                  on an order directly
--    email         present and verified for an email sign-in
--
--  Compared on the last ten digits, exactly as track_order() has
--  since 011: somebody who typed "+91 98765 43210" at checkout and
--  signs in as "+919876543210" is the same person, and both have
--  to land on the same order.
--
--  Called on every sign-in. Cheap, idempotent, and it catches the
--  customer who orders as a guest and signs in a minute later.
-- ------------------------------------------------------------
drop function if exists public.link_my_history();

create or replace function public.link_my_history()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   text := auth.jwt() ->> 'sub';
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_phone text := right(regexp_replace(
                    coalesce(auth.jwt() ->> 'phone_number', ''), '\D', '', 'g'), 10);
  v_n     integer := 0;
  v_x     integer := 0;
begin
  if v_uid is null then return 0; end if;

  -- ---- by verified phone: the one that matters here ----
  if length(v_phone) = 10 then
    update public.orders o
       set user_id = v_uid
     where o.user_id is null
       and right(regexp_replace(coalesce(o.customer ->> 'phone', ''), '\D', '', 'g'), 10)
           = v_phone;
    get diagnostics v_x = row_count; v_n := v_n + v_x;

    update public.requests r
       set user_id = v_uid
     where r.user_id is null
       and right(regexp_replace(coalesce(r.customer ->> 'phone', ''), '\D', '', 'g'), 10)
           = v_phone;
    get diagnostics v_x = row_count; v_n := v_n + v_x;
  end if;

  -- ---- by verified email, for orders that carry one ----
  if v_email <> '' then
    update public.orders o
       set user_id = v_uid
     where o.user_id is null
       and lower(trim(coalesce(o.customer ->> 'email', ''))) = v_email;
    get diagnostics v_x = row_count; v_n := v_n + v_x;

    update public.requests r
       set user_id = v_uid
     where r.user_id is null
       and lower(trim(coalesce(r.customer ->> 'email', ''))) = v_email;
    get diagnostics v_x = row_count; v_n := v_n + v_x;
  end if;

  return v_n;
end;
$$;

revoke all on function public.link_my_history() from public;
grant execute on function public.link_my_history() to authenticated;


-- ------------------------------------------------------------
--  6. CLAIMING, FOR THE CASES PHONE CANNOT COVER
--
--  Still needed. Somebody who signs in with email but ordered
--  under a phone number has nothing for section 5 to match on,
--  and proving one order number against its phone is how they
--  get their history.
--
--  `and o.user_id is null` remains the important line: claiming
--  is one-way and first-come, so a shared or resold number cannot
--  pull orders out of an account that already holds them.
-- ------------------------------------------------------------
create or replace function public.claim_orders(p_id text, p_phone text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    text    := auth.jwt() ->> 'sub';
  v_digits text    := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_proven boolean;
  v_orders integer := 0;
  v_reqs   integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in before claiming an order.' using errcode = '28000';
  end if;
  if length(v_digits) < 10 then
    raise exception 'A 10-digit phone number is required.' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.orders o
     where lower(o.id) = lower(trim(coalesce(p_id, '')))
       and right(regexp_replace(coalesce(o.customer ->> 'phone', ''), '\D', '', 'g'), 10) = v_digits
  ) into v_proven;

  -- Deliberately indistinguishable from "that pair is wrong": an
  -- answer that differed would confirm the order number exists.
  if not v_proven then return 0; end if;

  update public.orders o
     set user_id = v_uid
   where o.user_id is null
     and right(regexp_replace(coalesce(o.customer ->> 'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_orders = row_count;

  update public.requests r
     set user_id = v_uid
   where r.user_id is null
     and right(regexp_replace(coalesce(r.customer ->> 'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_reqs = row_count;

  return v_orders + v_reqs;
end;
$$;

revoke all on function public.claim_orders(text, text) from public;
grant execute on function public.claim_orders(text, text) to authenticated;


-- ============================================================
--  VERIFY
--
--  As a signed-in CUSTOMER holding a FIREBASE token:
--
--    -- the token is actually being read
--    select auth.jwt() ->> 'sub'          as firebase_uid,
--           auth.jwt() ->> 'phone_number' as verified_phone,
--           auth.uid()                    as should_be_null;
--
--    -- history linked itself
--    select public.link_my_history();     -- rows joined
--    select count(*) from public.orders;  -- only their own
--
--    -- and they are not staff
--    select public.my_role(), public.is_admin();   -- null, false
--
--  If auth.jwt() returns null, Firebase is NOT registered under
--  Authentication → Third Party Auth. Fix that before anything
--  else; nothing here can work without it.
-- ============================================================
