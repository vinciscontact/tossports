-- ============================================================
--  TOSS SPORTS — access control, hierarchy and audit trail
--
--  Three things:
--    1. 'owner' is renamed to 'founder' in the language of the business.
--       Both words keep working forever — is_founder() accepts either —
--       so a half-migrated row can never lock anybody out.
--    2. Store settings (payment keys, GST identity, WhatsApp number)
--       become founder-only. A manager keeps day-to-day power over
--       products, stock, orders and billing.
--    3. Sensitive actions are recorded in an append-only audit log that
--       only founders can read and NOBODY can edit or delete — not even
--       a founder. An audit trail you can rewrite is not an audit trail.
--
--  Run after 007-categories.sql. Safe to re-run.
-- ============================================================

-- ---------- 1. founder replaces owner ----------
-- Accepts both spellings on purpose: the rename is a vocabulary change,
-- not a security boundary, and old rows must never stop working.
create or replace function public.is_founder()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('founder','owner'), false);
$$;

-- "can administer the shop" — founder or manager. Unchanged meaning, so
-- every policy written before this file still holds.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('founder','owner','manager'), false);
$$;

-- The staff table was created with an INLINE check on role, which Postgres
-- auto-named `staff_role_check` and which only permits the old four words.
-- It has to go before any row can say 'founder'. Every check constraint
-- mentioning `role` is dropped by lookup rather than by name, because the
-- auto-generated name differs between databases and a hard-coded guess is
-- exactly what broke the first run of this file.
-- by name first (this is what Postgres called it), then by lookup as a
-- catch-all for any database where it was named differently
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff drop constraint if exists staff_role_ck;

do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class      rel on rel.oid = con.conrelid
      join pg_namespace  ns  on ns.oid  = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'staff'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.staff drop constraint %I', c.conname);
    raise notice 'dropped old role constraint %', c.conname;
  end loop;
end $$;

-- now the rename can happen
update public.staff set role = 'founder' where role = 'owner';

-- and the replacement constraint goes on, accepting both spellings
alter table public.staff add constraint staff_role_ck
  check (role in ('founder','owner','manager','sales','workshop'));

-- SOPs addressed to 'owner' should follow the rename. Founders can read
-- every SOP through is_admin() regardless, but leaving stale values here
-- would quietly mislabel who each procedure is for.
do $$
begin
  if to_regclass('public.sops') is not null then
    update public.sops
       set for_roles = array_replace(for_roles, 'owner', 'founder')
     where 'owner' = any(for_roles);
    alter table public.sops alter column for_roles
      set default '{founder,manager,sales,workshop}';
  end if;
end $$;

-- policies that were owner-only become founder-only (same people)
drop policy if exists staff_owner_write on public.staff;
create policy staff_owner_write on public.staff for all
  using (public.is_founder()) with check (public.is_founder());

drop policy if exists pay_read on public.payroll;
create policy pay_read on public.payroll for select
  using (public.is_founder() or staff_id = public.my_staff_id());
drop policy if exists pay_write on public.payroll;
create policy pay_write on public.payroll for all
  using (public.is_founder()) with check (public.is_founder());

-- ---------- 2. settings are founder-only ----------
-- Reading stays public: the storefront needs the WhatsApp number and
-- shipping thresholds. Writing is the founder's alone.
drop policy if exists settings_admin_write on public.settings;
drop policy if exists settings_founder_write on public.settings;
create policy settings_founder_write on public.settings for all
  using (public.is_founder()) with check (public.is_founder());

-- ---------- 3. the audit log ----------
create table if not exists public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_uid   text,
  actor_name  text,
  actor_role  text,
  entity      text not null,      -- 'products', 'staff', …
  action      text not null,      -- insert | update | delete
  row_id      text,
  summary     text,               -- human sentence for the Activity screen
  detail      jsonb               -- what actually changed
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;

-- founders read it; nobody writes, updates or deletes it by hand. Rows
-- arrive only through the security-definer trigger below, which bypasses
-- RLS. That is what makes the trail trustworthy.
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select
  using (public.is_founder());

-- The recorder. Runs as definer so it can write while the actor cannot.
-- TG_ARGV[0] is a comma-separated list of columns worth logging on update;
-- an update touching nothing else (a stock decrement from an order, say)
-- is skipped so the log stays readable.
create or replace function public.record_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who     record;
  watched text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  changed text[] := '{}';
  col     text;
  oldj    jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  newj    jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
  label   text;
  rid     text;
begin
  if TG_OP = 'UPDATE' and array_length(watched, 1) is not null then
    foreach col in array watched loop
      if oldj -> col is distinct from newj -> col then
        changed := changed || col;
      end if;
    end loop;
    if array_length(changed, 1) is null then
      return null;                       -- nothing worth recording
    end if;
  end if;

  select s.uid, s.name, s.role into who
    from public.staff s where s.uid = auth.jwt() ->> 'sub';

  rid   := coalesce(newj ->> 'id', oldj ->> 'id', newj ->> 'key', oldj ->> 'key');
  label := coalesce(newj ->> 'name', oldj ->> 'name', newj ->> 'key', oldj ->> 'key', rid);

  insert into public.audit_log (actor_uid, actor_name, actor_role, entity, action, row_id, summary, detail)
  values (
    auth.jwt() ->> 'sub',
    coalesce(who.name, 'system'),
    coalesce(who.role, 'system'),
    TG_TABLE_NAME,
    lower(TG_OP),
    rid,
    case lower(TG_OP)
      when 'insert' then 'Added ' || coalesce(label, 'a record')
      when 'delete' then 'Deleted ' || coalesce(label, 'a record')
      else 'Changed ' || coalesce(label, 'a record') ||
           case when array_length(changed, 1) is not null
                then ' (' || array_to_string(changed, ', ') || ')' else '' end
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'fields', to_jsonb(changed),
      'old', case when TG_OP = 'INSERT' then null else oldj end,
      'new', case when TG_OP = 'DELETE' then null else newj end
    ))
  );
  return null;                            -- after-trigger, result ignored
end;
$$;

-- What gets watched. Stock alone is deliberately absent from the products
-- list: every web order moves stock, and that would bury the entries that
-- matter (a price edit, a bat switched off, a product deleted).
drop trigger if exists audit_products on public.products;
create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.record_audit('price,mrp,cost,name,active,category,tier');

drop trigger if exists audit_settings on public.settings;
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.record_audit('value');

drop trigger if exists audit_staff on public.staff;
create trigger audit_staff after insert or update or delete on public.staff
  for each row execute function public.record_audit('name,role,base_salary,commission_pct,active,email,uid');

drop trigger if exists audit_payroll on public.payroll;
create trigger audit_payroll after insert or update or delete on public.payroll
  for each row execute function public.record_audit('net,status,bonus,deduction');

drop trigger if exists audit_coupons on public.coupons;
create trigger audit_coupons after insert or update or delete on public.coupons
  for each row execute function public.record_audit('code,discount,min_spend,active');

do $$
begin
  if to_regclass('public.invoices') is not null then
    execute 'drop trigger if exists audit_invoices on public.invoices';
    execute 'create trigger audit_invoices after insert or update or delete on public.invoices
      for each row execute function public.record_audit(''status,total'')';
  end if;
end $$;

-- ---------- self-test ----------
do $$
declare n int;
begin
  if to_regclass('public.audit_log') is null then
    raise exception 'audit_log was not created';
  end if;
  select count(*) into n from public.staff where role = 'owner';
  if n <> 0 then raise exception '% staff rows still say owner', n; end if;
  select count(*) into n from public.staff where role = 'founder';
  raise notice 'access control ready — % founder(s)', n;
end $$;
