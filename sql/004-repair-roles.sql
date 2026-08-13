-- ============================================================
--  REPAIR: is_admin() must read `staff`, never the retired `admins`.
--
--  Re-running schema.sql after the operations layer recreated the old
--  `admins` table and reverted is_admin() to look at it. Because that
--  table is always empty, is_admin() returned false for everyone and
--  owner + manager silently lost access to orders, expenses, coupons,
--  settings, SOPs, attendance and tasks.
--
--  This file is safe to run any number of times, in any order.
-- ============================================================

-- 1. the role helpers, defined against staff
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff where uid = auth.jwt() ->> 'sub' and active;
$$;

create or replace function public.my_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.staff where uid = auth.jwt() ->> 'sub' and active;
$$;

create or replace function public.has_role(variadic roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = any(roles);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('owner','manager'), false);
$$;

-- 2. rescue anyone stranded in the resurrected admins table, then remove it
do $$
begin
  if to_regclass('public.admins') is not null then
    insert into public.staff (uid, email, name, role)
    select a.uid, a.email, coalesce(a.email, 'Owner'), 'owner'
    from public.admins a
    where a.uid is not null
      and not exists (select 1 from public.staff s where s.uid = a.uid);
    drop table public.admins cascade;
  end if;
end $$;

-- 3. prove it: this must report owner = true, stranger = false
do $$
declare v_ok boolean;
begin
  insert into public.staff (uid, name, role) values ('__selftest__','Self Test','owner');
  perform set_config('request.jwt.claims', '{"sub":"__selftest__"}', true);
  select public.is_admin() into v_ok;
  delete from public.staff where uid = '__selftest__';
  perform set_config('request.jwt.claims', '', true);
  if not v_ok then
    raise exception 'is_admin() is still broken after repair';
  end if;
  raise notice 'is_admin() verified working for an owner';
end $$;
