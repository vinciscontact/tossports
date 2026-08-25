-- ============================================================
--  TOSS SPORTS — HANDOVER RESET (transactional data)
--
--  Empties everything that exists only because the site was
--  being tested, and leaves everything the business actually
--  needs: the 29 bats, their prices, stock, photos, categories,
--  branches, coupons, settings and SOPs.
--
--  THIS IS IRREVERSIBLE. Take a backup first:
--    Dashboard → Database → Backups
--
--  Run 015-handover-accounts.sql AFTERWARDS, not before — that
--  one clears the staff table and will lock you out of the Maze
--  Room until the client's login is created.
-- ============================================================


-- ------------------------------------------------------------
--  STEP 1 — look before you leap.
--
--  Select these lines and run them ALONE. They report how many
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


-- ============================================================
--  STEP 2 — THE RESET
--
--  Change ONE word below: 'NO' becomes 'YES-WIPE-TEST-DATA'.
--  Then run this block.
--
--  Everything lives inside a single DO block on purpose. An
--  earlier version armed the guard with a session variable set by
--  a separate statement, which is unreliable here: Supabase pools
--  connections in transaction mode, so session state set by one
--  statement need not survive into the next, and the guard would
--  refuse a run that had been armed correctly.
--
--  One statement removes that whole class of problem. It is also
--  atomic — a DO block runs in its own transaction, so if any
--  delete fails, none of them happened.
-- ============================================================

do $$
declare
  -- ▼▼▼ CHANGE THIS ONE WORD ▼▼▼
  confirm  constant text := 'NO';
  -- ▲▲▲ to 'YES-WIPE-TEST-DATA' ▲▲▲

  n_orders   integer;
  n_requests integer;
  n_files    integer;
  n_scores   integer;
begin
  if confirm <> 'YES-WIPE-TEST-DATA' then
    -- A single E-string spanning real lines. Concatenating several literals
    -- does not work here: only the first carries the E prefix, so escape
    -- sequences in the later ones print literally instead of breaking lines.
    raise exception E'Not armed.

  Edit the line     confirm constant text := ''NO'';
  so that it reads  confirm constant text := ''YES-WIPE-TEST-DATA'';

  Then run this block again. Take a backup first — this cannot be undone.';
  end if;

  -- counted before deleting, so the notice at the end reports what
  -- actually went rather than what was expected to
  select count(*) into n_orders   from public.orders;
  select count(*) into n_requests from public.requests;
  select count(*) into n_files    from storage.objects where bucket_id = 'requests';
  select count(*) into n_scores   from public.scores;

  ---------- customer-facing submissions ----------
  -- Files first, then the rows that point at them. The other order leaves
  -- orphaned uploads in Storage that nothing references and nobody will
  -- ever find to delete.
  delete from storage.objects where bucket_id = 'requests';
  delete from public.requests;
  delete from public.product_questions;

  ---------- money ----------
  delete from public.invoices;
  delete from public.orders;

  -- Invoice numbering restarts at 1 for every financial year. India
  -- requires per-FY sequential numbers, and a client whose first real
  -- bill is #24 has a gap they cannot explain to an assessor.
  delete from public.invoice_counters;

  -- `uses` is a redemption tally, not configuration. The codes stay.
  update public.coupons set uses = 0;

  ---------- the game ----------
  -- Leaderboard only. Codes a player has unlocked live in their own
  -- browser's localStorage; there is nothing server-side to clear.
  delete from public.scores;

  ---------- internal operations ----------
  -- Test tasks, test attendance and test payslips are not the client's
  -- history and should not become their opening balance.
  delete from public.sop_acks;
  delete from public.attendance;
  delete from public.payroll;
  delete from public.tasks;
  delete from public.expenses;
  delete from public.targets;
  delete from public.stock_transfers;

  ---------- deliberately NOT touched ----------
  --   products, categories, branches, product_stock, settings, sops,
  --   coupon definitions, and every file in the `products` bucket.
  --   That is the shop, not the testing.
  --
  --   audit_log is also left alone. 008 grants it no delete policy on
  --   purpose — an audit trail that can be erased is not one. It will
  --   show the setup work under your account, which is the honest
  --   record of who built the shop. To clear it anyway, uncomment:
  --     delete from public.audit_log;

  raise notice 'Reset done. Removed % orders, % requests, % uploaded files, % scores. Catalogue untouched.',
    n_orders, n_requests, n_files, n_scores;
end $$;


-- ------------------------------------------------------------
--  STEP 3 — confirm.
--  Re-run STEP 1. Every line above the KEPT rows should read 0,
--  and the KEPT rows should be unchanged.
-- ------------------------------------------------------------
