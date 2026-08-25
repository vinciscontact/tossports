-- ============================================================
--  TOSS SPORTS — HANDOVER RESET (transactional data)
--
--  Empties everything that exists only because the site was
--  being tested, and leaves everything the business actually
--  needs: the 29 bats, their prices, stock, photos, categories,
--  branches, coupons, settings and SOPs.
--
--  THIS IS IRREVERSIBLE. Supabase keeps automatic backups on
--  paid plans only. Take one first:
--    Dashboard → Database → Backups, or
--    Dashboard → Settings → Database → "Download backup"
--
--  Run 015-handover-accounts.sql AFTERWARDS, not before — that
--  one clears the staff table and will lock you out of the Maze
--  Room until the client's login is created.
-- ============================================================


-- ------------------------------------------------------------
--  STEP 1 — look before you leap.
--
--  Run this SELECT on its own first. It reports exactly how many
--  rows each statement below would destroy, so the blast radius
--  is a number you have seen rather than one you are trusting.
-- ------------------------------------------------------------
select 'orders'            as table_name, count(*) from public.orders
union all select 'invoices',           count(*) from public.invoices
union all select 'invoice_counters',   count(*) from public.invoice_counters
union all select 'requests',           count(*) from public.requests
union all select 'product_questions',  count(*) from public.product_questions
union all select 'request uploads',    count(*) from storage.objects where bucket_id = 'requests'
union all select 'scores',             count(*) from public.scores
union all select 'tasks',              count(*) from public.tasks
union all select 'attendance',         count(*) from public.attendance
union all select 'payroll',            count(*) from public.payroll
union all select 'expenses',           count(*) from public.expenses
union all select 'targets',            count(*) from public.targets
union all select 'sop_acks',           count(*) from public.sop_acks
union all select 'stock_transfers',    count(*) from public.stock_transfers
union all select '-- KEPT: products',  count(*) from public.products
union all select '-- KEPT: coupons',   count(*) from public.coupons
union all select '-- KEPT: product photos', count(*) from storage.objects where bucket_id = 'products'
order by 1;


-- ------------------------------------------------------------
--  STEP 2 — arm it.
--
--  Nothing below runs until this line is present in the same
--  session. It exists so that pasting this file in and hitting
--  Run out of habit cannot empty a live shop: the guard raises
--  and the transaction rolls back untouched.
-- ------------------------------------------------------------
-- Plain SET, not SET LOCAL: SET LOCAL outside a transaction block is a
-- no-op with a warning, so the guard below would never see the value and
-- would refuse every run. Session scope also means STEP 1 and the wipe can
-- be executed as separate statements in the same editor session.
set toss.confirm_wipe = 'NO';
-- Change 'NO' to 'YES-WIPE-TEST-DATA' when you actually mean it.


begin;

do $$
begin
  if coalesce(current_setting('toss.confirm_wipe', true), 'NO') <> 'YES-WIPE-TEST-DATA' then
    raise exception
      'Reset not armed. Set toss.confirm_wipe to YES-WIPE-TEST-DATA in STEP 2, and take a backup first.';
  end if;
end $$;


-- ---------- customer-facing submissions ----------

-- The files first, then the rows that point at them. The other order
-- leaves orphaned uploads in Storage that nothing references and nobody
-- will ever find to delete.
delete from storage.objects where bucket_id = 'requests';

delete from public.requests;
delete from public.product_questions;


-- ---------- money ----------

delete from public.invoices;
delete from public.orders;

-- Invoice numbering restarts at 1 for every financial year.
-- India requires per-FY sequential numbers, and a client whose first
-- real bill is #24 has a gap they cannot explain to an assessor.
delete from public.invoice_counters;

-- `uses` is a redemption counter, not configuration. The codes themselves
-- stay — it is the tally of test redemptions that has to go.
update public.coupons set uses = 0;


-- ---------- the game ----------

-- Leaderboard only. The codes a player has unlocked live in their own
-- browser's localStorage, so there is nothing server-side to clear and
-- nothing that follows a real customer here.
delete from public.scores;


-- ---------- internal operations ----------
-- Test tasks, test attendance and test payslips are not the client's
-- history and should not become their opening balance.

delete from public.sop_acks;
delete from public.attendance;
delete from public.payroll;
delete from public.tasks;
delete from public.expenses;
delete from public.targets;
delete from public.stock_transfers;


-- ---------- deliberately NOT touched ----------
--   products, categories, branches, product_stock, settings, sops,
--   coupons (definitions), and every file in the `products` storage
--   bucket. That is the shop, not the testing.
--
--   audit_log is also left alone. 008 grants it no delete policy on
--   purpose — an audit trail that can be erased is not one. It will
--   show the setup work under your account, which is the honest
--   record of who built the shop. If the client would rather start
--   with an empty log, that is a decision to make out loud:
--     delete from public.audit_log;


commit;


-- ------------------------------------------------------------
--  STEP 3 — confirm.
--  Re-run the SELECT from STEP 1. Every line above the KEPT rows
--  should read 0, and the KEPT rows should be unchanged.
-- ------------------------------------------------------------
