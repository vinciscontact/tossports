-- ============================================================
--  TOSS SPORTS — two branches
--
--  Shape decided with the business:
--    · both branches are retail outlets inside Tamil Nadu
--    · ONE GSTIN covers both (legal for additional places of business
--      in the same state), so invoice numbers must stay unique across
--      the whole registration — each branch gets its own letter in the
--      series rather than its own counter starting at 1
--    · stock is held PER BRANCH, because a customer walking into one
--      shop cannot buy what is sitting in the other
--    · a manager sees only their own branch; founders see everything
--
--  Run after 008-access-control.sql. Safe to re-run.
-- ============================================================

-- ---------- the branches ----------
create table if not exists public.branches (
  id         text primary key,          -- slug: 'chennai', 'branch-2'
  name       text not null,
  code       text not null,             -- one or two letters, used in bill numbers
  address    text,
  phone      text,
  is_default boolean not null default false,
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.branches enable row level security;

-- everyone signed in can read the list (they need to know where they work);
-- only founders create or change branches
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select using (true);
drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches for all
  using (public.is_founder()) with check (public.is_founder());

-- the shop that already exists becomes branch one
insert into public.branches (id, name, code, is_default, sort)
values ('chennai', 'Chennai', 'A', true, 0)
on conflict (id) do nothing;

-- exactly one default, always
create unique index if not exists branches_one_default
  on public.branches ((is_default)) where is_default;

create or replace function public.default_branch()
returns text language sql stable security definer set search_path = public as $$
  select id from public.branches where is_default limit 1;
$$;

-- ---------- who works where ----------
-- null branch = every branch. Founders are left null so they are never
-- boxed into one shop; staff are pinned to theirs.
alter table public.staff add column if not exists branch_id text
  references public.branches(id) on update cascade on delete set null;

update public.staff
   set branch_id = public.default_branch()
 where branch_id is null and role not in ('founder','owner');

create or replace function public.my_branch()
returns text language sql stable security definer set search_path = public as $$
  select branch_id from public.staff where uid = auth.jwt() ->> 'sub' and active;
$$;

-- The rule the whole file turns on: founders and anyone unpinned see
-- every branch; everyone else sees exactly one.
create or replace function public.can_see_branch(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_founder()
      or public.my_branch() is null
      or public.my_branch() is not distinct from b;
$$;

-- ---------- which branch made the sale ----------
alter table public.orders add column if not exists branch_id text
  references public.branches(id) on update cascade;

update public.orders set branch_id = public.default_branch() where branch_id is null;

alter table public.orders alter column branch_id set default public.default_branch();

-- staff read: still their own orders, but a manager now also sees their
-- branch's orders rather than the whole company's
drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders for select
  using (
    public.is_founder()
    or staff_id = public.my_staff_id()
    or (public.is_admin() and public.can_see_branch(branch_id))
  );

-- ---------- stock, per branch ----------
create table if not exists public.product_stock (
  product_id text not null references public.products(id) on delete cascade on update cascade,
  branch_id  text not null references public.branches(id) on delete cascade on update cascade,
  stock      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, branch_id)
);

alter table public.product_stock enable row level security;

-- public read: the storefront needs to know if a bat is available anywhere
drop policy if exists ps_read on public.product_stock;
create policy ps_read on public.product_stock for select using (true);
-- writes follow the branch rule
drop policy if exists ps_write on public.product_stock;
create policy ps_write on public.product_stock for all
  using (public.is_admin() and public.can_see_branch(branch_id))
  with check (public.is_admin() and public.can_see_branch(branch_id));

-- every product must have a row for every branch, or a shop looks like it
-- has no stock when it simply has no record
insert into public.product_stock (product_id, branch_id, stock)
select p.id, b.id,
       case when b.is_default then coalesce(p.stock, 0) else 0 end
  from public.products p cross join public.branches b
on conflict (product_id, branch_id) do nothing;

-- products.stock stays alive as the COMPANY TOTAL, kept correct by trigger.
-- Everything already written — the storefront, the low-stock warnings, the
-- reports — keeps reading one number and needs no rewrite.
create or replace function public.sync_product_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  pid := coalesce(new.product_id, old.product_id);
  update public.products p
     set stock = coalesce((select sum(ps.stock) from public.product_stock ps
                            where ps.product_id = pid), 0)
   where p.id = pid;
  return null;
end;
$$;

drop trigger if exists ps_sync_total on public.product_stock;
create trigger ps_sync_total after insert or update or delete on public.product_stock
  for each row execute function public.sync_product_total();

-- a new product opens with a stock row in every branch
create or replace function public.seed_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.product_stock (product_id, branch_id, stock)
  select new.id, b.id, case when b.is_default then coalesce(new.stock, 0) else 0 end
    from public.branches b
  on conflict (product_id, branch_id) do nothing;
  return null;
end;
$$;

drop trigger if exists products_seed_stock on public.products;
create trigger products_seed_stock after insert on public.products
  for each row execute function public.seed_product_stock();

-- a new branch opens with a stock row for every product
create or replace function public.seed_branch_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.product_stock (product_id, branch_id, stock)
  select p.id, new.id, 0 from public.products p
  on conflict (product_id, branch_id) do nothing;
  return null;
end;
$$;

drop trigger if exists branches_seed_stock on public.branches;
create trigger branches_seed_stock after insert on public.branches
  for each row execute function public.seed_branch_stock();

-- ---------- stock moves out of the branch that sold it ----------
create or replace function public.apply_stock_on_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb; b text;
begin
  if new.status = 'cancelled' then return new; end if;
  b := coalesce(new.branch_id, public.default_branch());
  for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    update public.product_stock
       set stock = greatest(0, stock - greatest(1, coalesce((it->>'qty')::int, 1))),
           updated_at = now()
     where product_id = it->>'id' and branch_id = b;
  end loop;
  return new;
end;
$$;

create or replace function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb; b text;
begin
  if new.status = 'cancelled' and coalesce(old.status,'') <> 'cancelled' then
    b := coalesce(new.branch_id, public.default_branch());
    for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
      update public.product_stock
         set stock = stock + greatest(1, coalesce((it->>'qty')::int, 1)),
             updated_at = now()
       where product_id = it->>'id' and branch_id = b;
    end loop;
  end if;
  return new;
end;
$$;

-- ---------- moving stock between branches ----------
-- One function so a transfer can never half-happen: both sides move inside
-- a single statement, and it refuses to send stock that is not there.
create table if not exists public.stock_transfers (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  product_id text not null references public.products(id) on update cascade,
  from_branch text not null references public.branches(id) on update cascade,
  to_branch   text not null references public.branches(id) on update cascade,
  qty        integer not null check (qty > 0),
  by_uid     text,
  by_name    text,
  note       text
);

alter table public.stock_transfers enable row level security;
drop policy if exists st_read on public.stock_transfers;
create policy st_read on public.stock_transfers for select
  using (public.is_admin() and (public.can_see_branch(from_branch) or public.can_see_branch(to_branch)));

create or replace function public.transfer_stock(
  p_product text, p_from text, p_to text, p_qty int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare have int; who record;
begin
  if p_from = p_to then raise exception 'Source and destination are the same branch'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if not public.can_see_branch(p_from) then raise exception 'You cannot send stock out of another branch'; end if;

  select stock into have from public.product_stock
   where product_id = p_product and branch_id = p_from for update;
  if have is null then raise exception 'No stock record for that product at the source branch'; end if;
  if have < p_qty then raise exception 'Only % in stock at the source branch', have; end if;

  update public.product_stock set stock = stock - p_qty, updated_at = now()
   where product_id = p_product and branch_id = p_from;
  update public.product_stock set stock = stock + p_qty, updated_at = now()
   where product_id = p_product and branch_id = p_to;

  select s.uid, s.name into who from public.staff s where s.uid = auth.jwt() ->> 'sub';
  insert into public.stock_transfers (product_id, from_branch, to_branch, qty, by_uid, by_name, note)
  values (p_product, p_from, p_to, p_qty, auth.jwt() ->> 'sub', coalesce(who.name,'system'), p_note);
end;
$$;

-- ---------- billing, one GSTIN, two branches ----------
-- With a single registration every invoice number must be unique across
-- BOTH shops. Each branch therefore carries its own letter inside one
-- shared series rather than restarting at 0001 — TOSS/A/26-27/0001 and
-- TOSS/B/26-27/0001 can never collide.
alter table public.invoices add column if not exists branch_id text
  references public.branches(id) on update cascade;

update public.invoices set branch_id = public.default_branch() where branch_id is null;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invoice_counters'
                    and column_name='branch_id') then
    alter table public.invoice_counters add column branch_id text
      not null default 'chennai';
    alter table public.invoice_counters drop constraint if exists invoice_counters_pkey;
    alter table public.invoice_counters add primary key (fy, branch_id);
  end if;
end $$;

-- The old no-argument version must GO, not merely be replaced: adding a
-- parameter creates an overload, and a bare next_invoice_no() call would
-- still match the old branch-blind function exactly and silently win.
drop function if exists public.next_invoice_no();

create or replace function public.next_invoice_no(p_branch text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_fy text; v_n integer; v_prefix text; v_branch text; v_code text;
begin
  v_fy := public.current_fy();
  v_branch := coalesce(p_branch, public.my_branch(), public.default_branch());

  insert into public.invoice_counters (fy, branch_id, n) values (v_fy, v_branch, 1)
    on conflict (fy, branch_id) do update set n = public.invoice_counters.n + 1
    returning n into v_n;

  select coalesce(value #>> '{}', 'TOSS') into v_prefix
    from public.settings where key = 'invoice_prefix';
  select code into v_code from public.branches where id = v_branch;

  return coalesce(v_prefix,'TOSS')
       || case when (select count(*) from public.branches where active) > 1
               then '/' || coalesce(v_code,'A') else '' end
       || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end;
$$;

-- ---------- audit ----------
do $$
begin
  if to_regclass('public.audit_log') is not null then
    execute 'drop trigger if exists audit_branches on public.branches';
    execute 'create trigger audit_branches after insert or update or delete on public.branches
      for each row execute function public.record_audit(''name,code,address,active'')';
  end if;
end $$;

-- ---------- self-test ----------
do $$
declare n int; b int;
begin
  select count(*) into b from public.branches;
  select count(*) into n from public.products p
   where not exists (select 1 from public.product_stock ps where ps.product_id = p.id);
  if n > 0 then raise exception '% products have no stock rows', n; end if;

  select count(*) into n from public.products p
   where p.stock <> coalesce((select sum(ps.stock) from public.product_stock ps
                               where ps.product_id = p.id), 0);
  if n > 0 then raise exception '% products disagree with their branch stock', n; end if;

  raise notice 'branches ready — % branch(es), every product stocked and totals agree', b;
end $$;
