-- ============================================================
-- 020 — RESET BUTTON (founder-only, from the Maze Room)
-- Run once in: Supabase → SQL editor.
--
-- Powers Settings → Danger zone → "Reset test data". Same wipe
-- list as sql/999-reset-test-data.sql, but callable from the
-- panel: the browser cannot create backup tables or bypass RLS,
-- so the whole backup-then-wipe runs here, server-side.
--
-- Three locks against a mistake:
--   1. only an active founder/owner login can call it,
--   2. the caller must pass the literal confirmation text 'RESET'
--      (the panel makes the user type it),
--   3. everything wiped is snapshotted to the reset_backup schema
--      first, so even a confirmed mistake is recoverable.
-- ============================================================

create or replace function public.reset_test_data(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t       text;
  n       bigint;
  wiped   jsonb := '{}'::jsonb;
  suffix  text  := to_char(now(), 'YYYYMMDD_HH24MI');
  tables  text[] := array[
    'invoices',            -- before orders: invoices reference orders
    'orders',
    'invoice_counters',    -- restart billing numbers at 1
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
  if coalesce(public.my_role(), '') not in ('founder', 'owner') then
    raise exception 'Only the founder can reset data.';
  end if;
  if p_confirm is distinct from 'RESET' then
    raise exception 'Confirmation text did not match.';
  end if;

  execute 'create schema if not exists reset_backup';

  /* Invoices carry a no-delete trigger (bills are cancelled, never deleted —
     the audit rule for live trading). This one-time reset suspends it just
     for this transaction; ALTER TABLE is transactional, so even a failure
     mid-run rolls the trigger back to enabled. */
  if to_regclass('public.invoices') is not null then
    execute 'alter table public.invoices disable trigger invoices_no_delete';
  end if;

  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('create table reset_backup.%I as table public.%I',
                     t || '_' || suffix, t);
      /* "where true" satisfies Supabase's safe-update guard, which
         refuses any DELETE that has no WHERE clause at all */
      execute format('delete from public.%I where true', t);
      get diagnostics n = row_count;
      wiped := wiped || jsonb_build_object(t, n);
    end if;
  end loop;

  if to_regclass('public.invoices') is not null then
    execute 'alter table public.invoices enable trigger invoices_no_delete';
  end if;

  return jsonb_build_object('backup_suffix', suffix, 'wiped', wiped);
end $$;

revoke all on function public.reset_test_data(text) from public;
grant execute on function public.reset_test_data(text) to authenticated;

-- Restore after a mistake (replace the suffix with the one the
-- panel showed, or list snapshots):
--   select table_name from information_schema.tables
--   where table_schema = 'reset_backup' order by 1;
--   insert into public.orders select * from reset_backup.orders_20260903_1830;
--
-- Once launch is confirmed good, clear the snapshots:
--   drop schema reset_backup cascade;
