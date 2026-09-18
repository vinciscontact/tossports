-- ============================================================
-- PRE-LAUNCH RESET — wipe test data, keep the real setup
-- Run in: Supabase → SQL editor (runs as postgres, bypasses RLS)
-- Date written: 2026-09-03
--
-- WIPES  : orders, invoices, invoice_counters (billing restarts at 1),
--          expenses, payroll, attendance, targets,
--          customer_profiles, requests, scores (game leaderboard),
--          audit_log, stock_transfers (history only)
-- KEEPS  : products, categories, playstyles, playstyle_groups,
--          product_playstyles, product_questions, branches,
--          product_stock (current counts), staff, tasks, sops,
--          sop_acks, coupons, settings
--
-- Every wiped table is snapshotted first into the reset_backup
-- schema with a timestamp suffix, so this is recoverable. The
-- derived views (v_month_pl, customer_stats, …) clear on their own
-- because they read from these tables.
-- ============================================================

do $$
declare
  t      text;
  suffix text := to_char(now(), 'YYYYMMDD_HH24MI');
  tables text[] := array[
    'invoices',            -- before orders: invoices reference orders
    'orders',
    'invoice_counters',    -- deleting the counter rows restarts numbering at 1
    'expenses',
    'payroll',
    'attendance',
    'targets',
    'customer_profiles',
    'requests',
    'scores',
    'audit_log',
    'stock_transfers'
  ];
begin
  create schema if not exists reset_backup;

  /* invoices carry a no-delete trigger (audit rule for live trading) —
     suspend it for this transaction only; rollback restores it */
  if to_regclass('public.invoices') is not null then
    execute 'alter table public.invoices disable trigger invoices_no_delete';
  end if;

  foreach t in array tables loop
    -- to_regclass guard: a table that a later migration renamed or that
    -- this project never created is skipped instead of killing the run
    if to_regclass('public.' || t) is not null then
      execute format('create table reset_backup.%I as table public.%I',
                     t || '_' || suffix, t);
      /* "where true" satisfies Supabase's safe-update guard, which
         refuses any DELETE that has no WHERE clause at all */
      execute format('delete from public.%I where true', t);
      raise notice 'wiped % (backup: reset_backup.%)', t, t || '_' || suffix;
    else
      raise notice 'skipped % — table does not exist', t;
    end if;
  end loop;

  if to_regclass('public.invoices') is not null then
    execute 'alter table public.invoices enable trigger invoices_no_delete';
  end if;
end $$;

-- ------------------------------------------------------------
-- Check the result: wiped tables should all read 0,
-- kept tables should still show their real counts.
-- ------------------------------------------------------------
select 'orders (wiped)'          as what, count(*) from public.orders
union all select 'invoices (wiped)',        count(*) from public.invoices
union all select 'expenses (wiped)',        count(*) from public.expenses
union all select 'payroll (wiped)',         count(*) from public.payroll
union all select 'attendance (wiped)',      count(*) from public.attendance
union all select 'scores (wiped)',          count(*) from public.scores
union all select 'products (kept)',         count(*) from public.products
union all select 'branches (kept)',         count(*) from public.branches
union all select 'product_stock (kept)',    count(*) from public.product_stock
union all select 'staff (kept)',            count(*) from public.staff
union all select 'tasks (kept)',            count(*) from public.tasks
union all select 'sops (kept)',             count(*) from public.sops
union all select 'coupons (kept)',          count(*) from public.coupons
order by what;

-- ------------------------------------------------------------
-- IF SOMETHING WAS WRONG — restore any table from its snapshot.
-- List snapshots:
--   select table_name from information_schema.tables
--   where table_schema = 'reset_backup' order by 1;
-- Restore one (example, replace the suffix with yours):
--   insert into public.orders select * from reset_backup.orders_20260903_1830;
--
-- ONCE THE LAUNCH IS CONFIRMED GOOD (give it a week or two),
-- drop the snapshots:
--   drop schema reset_backup cascade;
-- ------------------------------------------------------------
