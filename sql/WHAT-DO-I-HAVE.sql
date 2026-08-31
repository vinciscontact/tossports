-- ============================================================
--  TOSS SPORTS — WHAT IS ALREADY APPLIED?
--
--  Run this FIRST, on its own. It changes nothing — every line
--  is a select. It reports, migration by migration, whether the
--  objects that migration creates are actually present.
--
--  This beats matching the names of saved snippets. A snippet
--  called "customer auth" might be 013 or 018, might have been
--  edited before it was run, and might have failed halfway. The
--  database is the only thing that knows.
-- ============================================================

select
  '016 security fixes'  as migration,
  case when exists (
    select 1 from pg_trigger where tgname = 'orders_sanitise_ins'
  ) then 'APPLIED' else 'MISSING' end as status,
  'server-side order pricing' as brings

union all select
  '017 play styles',
  case when to_regclass('public.playstyles') is not null
       then 'APPLIED' else 'MISSING' end,
  'play-style vocabulary'

union all select
  '018 customer accounts',
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
  ) then 'APPLIED' else 'MISSING' end,
  'orders.user_id, customer_profiles'

union all select
  '019 corporate + warranty',
  case when exists (
    select 1 from public.settings where key = 'warranty_3_price'
  ) then 'APPLIED' else 'MISSING' end,
  'corporate requests, warranty prices'

union all select
  '020 coupon kinds',
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'coupons' and column_name = 'kind'
  ) then 'APPLIED' else 'MISSING' end,
  'loyalty / referral / offer codes'

union all select
  '021 order versioning',
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'version'
  ) then 'APPLIED' else 'MISSING' end,
  'row versions for the Sheet sync'

union all select
  '022 firebase customer auth',
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name = 'user_id' and data_type = 'text'
  ) then 'APPLIED' else 'MISSING' end,
  'user_id becomes text; phone links history'

order by migration;


-- ============================================================
--  Then run sql/RUN-THESE.sql for anything reported MISSING.
--
--  Running it when something is already applied is harmless —
--  every migration in it is idempotent — so if in doubt, run the
--  whole thing rather than picking pieces out of it.
-- ============================================================
