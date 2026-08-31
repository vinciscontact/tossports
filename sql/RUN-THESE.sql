-- ============================================================
--  TOSS SPORTS — PENDING MIGRATIONS
--
--  Everything the database still needs, in order, in one file.
--  Paste the whole thing into the Supabase SQL editor and run it.
--
--  GENERATED — do not edit. Rebuild with:
--      node sql/build-pending.js
--
--  ─────────────────────────────────────────────────────────
--  WHY NOT COMPLETE-SCHEMA.sql
--
--  That file re-seeds the catalogue and ends with
--
--      on conflict (id) do update set
--        name = excluded.name, price = excluded.price, ...
--
--  so running it would overwrite every product name, price, MRP
--  and tier with the values committed in schema.sql, reverting
--  anything priced in the Maze Room. Right for a brand new
--  database, wrong for a live one.
--
--  ─────────────────────────────────────────────────────────
--  SAFE TO RE-RUN. Every statement is idempotent: create table
--  if not exists, drop policy before create, create or replace
--  function, insert ... on conflict do nothing.
--
--  The one destructive step — 022 converting customer ids from
--  Supabase UUIDs to Firebase UIDs — is guarded on the column
--  still being uuid, so a second run reports "conversion
--  skipped" and changes nothing.
-- ============================================================

-- ############################################################
-- #  01. 019-corporate-and-warranty.sql
-- ############################################################

-- ============================================================
--  TOSS SPORTS — CORPORATE ORDERS + EXTENDED WARRANTY
--
--  Two things the client asked for after 018:
--
--    1. Corporate and gifting enquiries, as a seventh service.
--       `requests.kind` is constrained to a fixed list, so a new
--       service is a migration and not just a form.
--
--    2. An extended warranty sold per bat at checkout — ₹100 for
--       3 months, ₹200 for 6.
--
--  The warranty is the half that matters here. orders_sanitise()
--  recomputes every anonymous order from the catalogue and IGNORES
--  what the browser claimed the total was (see 016). A priced
--  add-on the function does not know about is therefore an add-on
--  the customer is never charged for: the line would be accepted,
--  the warranty recorded, and the money silently dropped. So the
--  function has to be taught the plan prices at the same time the
--  checkout learns to sell them.
--
--  Prices live in `settings`, not in this file, so the owner can
--  change them in the Maze Room without a developer — the same
--  arrangement engraving_price already uses.
--
--  Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  1. CORPORATE IS A VALID REQUEST KIND
--
--  Dropped and re-added rather than altered: a check constraint
--  cannot be widened in place, and re-running the old definition
--  after this file would silently narrow it again.
-- ------------------------------------------------------------
alter table public.requests drop constraint if exists requests_kind_ck;
alter table public.requests add constraint requests_kind_ck
  check (kind in ('bat_doctor','custom_bat','jersey','wholesale',
                  'trade_in','video','corporate'));


-- ------------------------------------------------------------
--  2. WARRANTY PRICES
--
--  `on conflict do nothing` so re-running never resets a price the
--  owner has since changed in the Maze Room. That is the whole
--  reason these are rows rather than constants.
-- ------------------------------------------------------------
insert into public.settings (key, value) values
  ('warranty_3_price', '100'::jsonb),
  ('warranty_6_price', '200'::jsonb)
on conflict (key) do nothing;


-- ------------------------------------------------------------
--  3. THE SERVER PRICES THE WARRANTY
--
--  A full redefinition of orders_sanitise() from 016, with the
--  warranty added to the per-line price alongside engraving. Same
--  return type, so create-or-replace is enough and no drop is
--  needed.
--
--  Only two lines are genuinely new — the two lookups and the
--  `if` inside the loop — but the function has to be restated in
--  full because Postgres has no way to patch a body.
--
--  Anything other than '3' or '6' in the line adds nothing. An
--  unknown plan is treated as no warranty rather than as an error:
--  refusing the whole order because one line carried a bad string
--  would cost a sale to protect a ₹100 add-on.
-- ------------------------------------------------------------
create or replace function public.orders_sanitise()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it      jsonb;
  v_sub   integer := 0;
  v_qty   integer;
  v_price integer;
  v_eng   integer;
  v_w3    integer;
  v_w6    integer;
  v_wadd  integer;
  v_disc  integer := 0;
  v_free  integer;
  v_fee   integer;
  v_cp    record;
begin
  -- Staff keep the numbers they typed. Only anonymous web orders are
  -- recomputed, because only those were priced by a browser.
  if public.my_role() is not null then
    return new;
  end if;

  new.status     := 'new';
  new.paid       := false;
  new.channel    := 'web';
  new.staff_id   := null;
  new.payment_id := null;
  new.created_at := now();

  select coalesce((value #>> '{}')::int, 199) into v_eng
    from public.settings where key = 'engraving_price';
  v_eng := coalesce(v_eng, 199);

  select coalesce((value #>> '{}')::int, 100) into v_w3
    from public.settings where key = 'warranty_3_price';
  v_w3 := coalesce(v_w3, 100);

  select coalesce((value #>> '{}')::int, 200) into v_w6
    from public.settings where key = 'warranty_6_price';
  v_w6 := coalesce(v_w6, 200);

  for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    select coalesce(p.price, 0) into v_price
      from public.products p
     where p.id = it->>'id' and p.active;

    if not found then
      raise exception 'Unknown or inactive product in order: %', it->>'id'
        using errcode = 'check_violation';
    end if;

    v_qty := greatest(1, least(20, coalesce((it->>'qty')::int, 1)));

    if coalesce(it->>'engrave', '') <> '' then
      v_price := v_price + v_eng;
    end if;

    -- Per bat, exactly like engraving: two bats with cover cost two
    -- covers. The browser sends only the plan id; the price comes from
    -- settings here and nowhere else.
    v_wadd := case coalesce(it->>'warranty', '')
                when '3' then v_w3
                when '6' then v_w6
                else 0
              end;
    v_price := v_price + v_wadd;

    v_sub := v_sub + v_price * v_qty;
  end loop;

  if new.coupon is not null then
    select * into v_cp from public.validate_coupon(new.coupon, v_sub);
    v_disc := case when v_cp.valid then coalesce(v_cp.discount, 0) else 0 end;
    if v_disc = 0 then new.coupon := null; end if;
  end if;

  select coalesce((value #>> '{}')::int, 1500) into v_free
    from public.settings where key = 'free_ship_over';
  select coalesce((value #>> '{}')::int, 99) into v_fee
    from public.settings where key = 'ship_fee';

  new.subtotal := v_sub;
  new.discount := least(v_disc, v_sub);
  new.shipping := case
                    when v_sub = 0 or v_sub >= coalesce(v_free, 1500) then 0
                    else coalesce(v_fee, 99)
                  end;
  new.total    := greatest(0, new.subtotal - new.discount + new.shipping);
  return new;
end;
$$;

drop trigger if exists orders_sanitise_ins on public.orders;
create trigger orders_sanitise_ins
  before insert on public.orders
  for each row execute function public.orders_sanitise();


-- ============================================================
--  VERIFY
--
--    -- corporate is now accepted
--    insert into public.requests (kind, customer)
--    values ('corporate', '{"name":"Test","phone":"9000000000"}'::jsonb);
--
--    -- and the warranty is actually charged. As an ANONYMOUS
--    -- caller, insert one bat with a 6-month plan and read the
--    -- total back: it must be the bat price + 200, whatever the
--    -- browser claimed.
--    select key, value from public.settings
--     where key in ('warranty_3_price','warranty_6_price');
-- ============================================================

-- ############################################################
-- #  02. 020-coupon-kinds.sql
-- ############################################################

-- ============================================================
--  TOSS SPORTS — WHAT A CODE IS FOR
--
--  `coupons` held game rewards and nothing else, so every code
--  looked the same in the Maze Room: a value, a minimum spend and
--  an "unlocks at" figure that only means anything if the code is
--  earned by playing. Once the same table starts carrying loyalty
--  and referral codes, "unlocks at 30 runs" against a referral
--  code is noise, and there is no way to answer "how many referral
--  codes are live".
--
--  So a code now says what it is. Four kinds:
--
--    game      earned in Gully Cricket; `unlock_runs` applies
--    loyalty   handed to a returning customer
--    referral  given out to be passed on
--    offer     a campaign — festival, launch, anything timed
--
--  `referred_by` is the one extra column, and it is deliberately
--  free text rather than a foreign key to a customer: most people
--  handing out a referral code are not signed-in accounts, and a
--  phone number written on a card is the real-world case. When
--  proper referral tracking is built it can migrate from here.
--
--  Safe to re-run.
-- ============================================================

alter table public.coupons
  add column if not exists kind text not null default 'game';

alter table public.coupons
  add column if not exists referred_by text;

-- Existing rows are all game rewards, which is what the default
-- already gave them; this only matters if the column existed with
-- something else in it.
update public.coupons set kind = 'game' where kind is null;

alter table public.coupons drop constraint if exists coupons_kind_ck;
alter table public.coupons add constraint coupons_kind_ck
  check (kind in ('game','loyalty','referral','offer'));

create index if not exists coupons_kind_idx on public.coupons (kind);


-- ------------------------------------------------------------
--  The storefront must not learn anything new.
--
--  validate_coupon() is what the checkout calls, and it stays
--  exactly as it was: a code is valid because it exists, is
--  active and clears its minimum spend. What KIND it is has no
--  bearing on whether it works — that is a label for the people
--  running the shop, not a rule for the customer.
--
--  Stated here because the obvious next step is to start
--  filtering by kind in the validator, and that would break every
--  game reward already in circulation.
-- ------------------------------------------------------------


-- ============================================================
--  VERIFY
--
--    select kind, count(*) from public.coupons group by kind;
--
--    -- and the constraint holds
--    insert into public.coupons (code, discount, kind)
--    values ('BADKIND', 50, 'nonsense');   -- must fail
-- ============================================================

-- ############################################################
-- #  03. 021-order-versioning.sql
-- ############################################################

-- ============================================================
--  TOSS SPORTS — ORDER VERSIONING
--
--  Groundwork for the Google Sheet sync, which is allowed to
--  write changes back to `orders`.
--
--  The danger with a two-way sync is not that a write fails — it
--  is that one SUCCEEDS when it should not have. Somebody opens
--  the Sheet at nine, a salesperson marks an order dispatched at
--  ten, and the Sheet — still holding the nine o'clock value —
--  pushes "new" back over it at eleven. The order silently
--  un-ships. Nothing errors, nobody is told, and the bat does not
--  go out.
--
--  `version` is what makes that impossible. Every update bumps
--  it, the Sheet records the version it last read, and its
--  write-back is filtered on that version:
--
--    PATCH /orders?id=eq.TOSS-X&version=eq.7
--
--  If anything changed in between, the row is at version 8, the
--  filter matches nothing, and PostgREST updates ZERO rows. The
--  sync sees the empty result and flags the row as a conflict
--  instead of overwriting. That is optimistic concurrency, and it
--  is the whole reason a write-back is safe to offer at all.
--
--  An integer rather than a timestamp on purpose: comparing
--  timestamptz through a URL means agreeing on microsecond
--  formatting between Postgres, PostgREST and Apps Script, and a
--  guard that silently stops matching is worse than none.
--
--  `updated_at` comes along because it is genuinely useful in the
--  Maze Room, but nothing depends on it for correctness.
--
--  Safe to re-run.
-- ============================================================

alter table public.orders
  add column if not exists version    integer     not null default 1;

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();


-- ------------------------------------------------------------
--  Bump on every update, from the database.
--
--  Not from application code: the Maze Room, the Sheet sync and
--  any future caller all have to be covered, and the only place
--  that sees all three is here. A caller that forgot would leave
--  a stale version behind and quietly disarm the guard.
--
--  `is distinct from` rather than <> so a row whose columns are
--  rewritten with identical values does not burn a version — the
--  Sheet pushing an unchanged row should not invalidate somebody
--  else's in-flight edit.
-- ------------------------------------------------------------
create or replace function public.orders_bump_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if to_jsonb(new) - 'version' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'version' - 'updated_at' then
    new.version    := coalesce(old.version, 1) + 1;
    new.updated_at := now();
  else
    new.version    := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

-- 'orders_zz_bump_version' so it sorts LAST among BEFORE UPDATE
-- triggers: it has to see the row exactly as it will be written,
-- after anything else has finished changing it.
drop trigger if exists orders_zz_bump_version on public.orders;
create trigger orders_zz_bump_version
  before update on public.orders
  for each row execute function public.orders_bump_version();

create index if not exists orders_updated_idx on public.orders (updated_at desc);


-- ============================================================
--  VERIFY
--
--    -- version climbs only on a real change
--    update public.orders set status = status where id = '<an id>';
--    select id, version from public.orders where id = '<an id>';  -- unchanged
--
--    update public.orders set status = 'packed' where id = '<an id>';
--    select id, version from public.orders where id = '<an id>';  -- +1
--
--    -- and the guard refuses a stale write
--    -- (as service_role, with the OLD version number)
--    --   PATCH /orders?id=eq.<id>&version=eq.<old>   ->  []
-- ============================================================

-- ############################################################
-- #  04. 022-firebase-customer-auth.sql
-- ############################################################

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

-- ############################################################
-- #  05. 023-no-role-claim-needed.sql
-- ############################################################

-- ============================================================
--  TOSS SPORTS — CUSTOMER ACCOUNTS WITHOUT THE ROLE CLAIM
--
--  Supabase's Firebase integration tells you to stamp
--  role='authenticated' onto every token with a blocking Cloud
--  Function. That needs Identity Platform and the Blaze plan —
--  a billing account, for two lines of JavaScript.
--
--  It is avoidable, because of one detail in how PostgREST works:
--
--      The ROLE comes from the `role` claim.
--      The CLAIMS come from the verified token, either way.
--
--  PostgREST verifies the Firebase signature (that is what the
--  Third Party Auth integration does), then sets
--  request.jwt.claims from it — and only afterwards decides which
--  Postgres role to run as. With no `role` claim it falls back to
--  `anon`, but auth.jwt() still returns the real, verified claims.
--
--  So `auth.jwt() ->> 'sub'` is the customer's Firebase UID
--  whether they arrive as `authenticated` or as `anon`. Every
--  policy written in 022 already works. Two things were in the
--  way, and only one of them was real:
--
--    · the POLICIES name no role, so they default to PUBLIC and
--      already covered anon. Nothing to do.
--
--    · the FUNCTIONS were granted to `authenticated` only. That
--      is the actual blocker, and this file fixes it.
--
--  ─────────────────────────────────────────────────────────────
--  IS THIS SAFE? Yes, and not by accident.
--
--  Nothing is being opened up. Access was never decided by the
--  role — it is decided by comparing a row's user_id against the
--  `sub` of a cryptographically verified token:
--
--    · a real anonymous visitor has no token, so auth.jwt() is
--      null, so `sub` is null, so user_id = null is false and no
--      row matches. They see nothing.
--
--    · both functions below already refuse a null `sub` on their
--      first line — claim_orders raises, link_my_history returns
--      zero — so granting them to anon hands an anonymous caller
--      an error, not data.
--
--    · a forged token fails signature verification long before
--      any of this, in PostgREST.
--
--  What you give up is defence in depth: if some future migration
--  writes a policy that relies on the role rather than on the
--  claim, it will not protect customers. Worth deploying the
--  blocking functions later; not worth a billing account today.
--
--  Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
--  The one change: let a token-bearing caller run these even
--  when Postgres has resolved them to `anon`.
--
--  `to anon, authenticated` rather than `to public`: public would
--  include every future role, including any service role added
--  later, which is broader than the need.
-- ------------------------------------------------------------
grant execute on function public.link_my_history()          to anon, authenticated;
grant execute on function public.claim_orders(text, text)   to anon, authenticated;

-- track_order() has always been callable by anon — it is the
-- no-account order lookup — and is listed here only so the whole
-- customer-facing surface is visible in one place.
grant execute on function public.track_order(text, text)    to anon, authenticated;


-- ------------------------------------------------------------
--  Customers must be able to write their own profile.
--
--  The policies from 022 permit it; a table-level grant is what
--  makes the permission reachable. Supabase grants these to both
--  roles by default on tables created through the dashboard, but
--  customer_profiles was created by a migration, so it is stated
--  explicitly rather than assumed.
--
--  RLS still decides WHICH rows. A grant without a matching
--  policy gets you nothing — cp_own_read, cp_own_insert and
--  cp_own_update all compare user_id to the token's `sub`.
-- ------------------------------------------------------------
grant select, insert, update on public.customer_profiles to anon, authenticated;

-- Read-only for orders and requests. There is deliberately no
-- insert or update here: an order is written by the storefront
-- through its own anonymous-insert policy and priced by the
-- server, and nothing about signing in should let somebody edit
-- one afterwards.
grant select on public.orders   to anon, authenticated;
grant select on public.requests to anon, authenticated;


-- ============================================================
--  VERIFY
--
--  Signed in on the site, with the browser console open:
--
--    await supaRpc('link_my_history', {})
--
--  A number back — even 0 — means this worked. "permission
--  denied for function link_my_history" means it did not.
--
--  And from the SQL editor, to see what a customer's token
--  actually carries:
--
--    select auth.jwt() ->> 'sub'          as firebase_uid,
--           auth.jwt() ->> 'role'         as role_claim,
--           auth.jwt() ->> 'phone_number' as verified_phone;
--
--  role_claim being null is now FINE. sub being null is not —
--  that means the token is not reaching the database at all.
-- ============================================================


-- ############################################################
-- #  VERIFY — run after, in the SQL editor
-- ############################################################

-- 1. identity columns are text, and the new ones exist
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ( (table_name in ('orders','requests','customer_profiles') and column_name = 'user_id')
      or (table_name = 'orders'  and column_name in ('version','updated_at'))
      or (table_name = 'coupons' and column_name in ('kind','referred_by')) )
 order by table_name, column_name;
-- user_id must read text on all three.

-- 2. corporate is an accepted request kind
select pg_get_constraintdef(oid) from pg_constraint
 where conname = 'requests_kind_ck';

-- 3. warranty prices seeded
select key, value from public.settings
 where key in ('warranty_3_price','warranty_6_price');

-- 4. the customer functions exist
select proname from pg_proc
 where proname in ('link_my_history','claim_orders','orders_bump_version')
 order by proname;