-- ============================================================
--  TOSS SPORTS — operations layer
--  Staff & roles, attendance, tasks, targets, payroll, SOPs,
--  expenses, offline sales, customer stats.
--  Run after sql/schema.sql. Safe to re-run.
-- ============================================================

-- ---------- staff replaces the flat admins table ----------
create table if not exists public.staff (
  id             uuid primary key default gen_random_uuid(),
  uid            text unique,                      -- firebase uid, null until they first log in
  name           text not null,
  phone          text,
  email          text,
  role           text not null default 'sales'
                 check (role in ('owner','manager','sales','workshop')),
  base_salary    integer not null default 0,       -- monthly, in rupees
  commission_pct numeric(5,2) not null default 0,  -- % of sales they close
  joined_on      date default current_date,
  active         boolean not null default true,
  created_at     timestamptz default now()
);
create index if not exists staff_uid_idx on public.staff (uid);
alter table public.staff enable row level security;

-- carry across anyone from the retired admins table, if it is still around.
-- Guarded, because schema.sql no longer creates it — an unguarded reference
-- makes this whole file fail on a clean database.
do $$
begin
  if to_regclass('public.admins') is not null then
    insert into public.staff (uid, email, name, role)
    select a.uid, a.email, coalesce(a.email,'Owner'), 'owner'
    from public.admins a
    where a.uid is not null
      and not exists (select 1 from public.staff s where s.uid = a.uid);
    drop table public.admins cascade;
  end if;
end $$;

-- one staff record per email, so re-running a seed cannot duplicate people
create unique index if not exists staff_email_uidx
  on public.staff (lower(email)) where email is not null;

-- ---------- role helpers ----------
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

-- everything written before this file checks is_admin(); keep it meaning
-- "can administer the shop" so the original policies still hold.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() in ('owner','manager');
$$;

-- staff can see the roster; only the owner edits it (salaries live here)
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select
  using (public.my_role() is not null);
drop policy if exists staff_owner_write on public.staff;
create policy staff_owner_write on public.staff for all
  using (public.has_role('owner')) with check (public.has_role('owner'));

-- ---------- attendance ----------
create table if not exists public.attendance (
  id        bigserial primary key,
  staff_id  uuid not null references public.staff(id) on delete cascade,
  on_date   date not null default current_date,
  status    text not null default 'present'
            check (status in ('present','half','absent','leave','holiday')),
  hours     numeric(4,1) default 0,
  note      text,
  unique (staff_id, on_date)
);
alter table public.attendance enable row level security;
drop policy if exists att_read on public.attendance;
create policy att_read on public.attendance for select
  using (public.is_admin() or staff_id = public.my_staff_id());
drop policy if exists att_write on public.attendance;
create policy att_write on public.attendance for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- tasks (work tracking) ----------
create table if not exists public.tasks (
  id          bigserial primary key,
  title       text not null,
  detail      text,
  staff_id    uuid references public.staff(id) on delete set null,
  status      text not null default 'open' check (status in ('open','doing','done')),
  priority    text not null default 'normal' check (priority in ('low','normal','high')),
  due_on      date,
  done_at     timestamptz,
  created_at  timestamptz default now()
);
alter table public.tasks enable row level security;
drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select
  using (public.is_admin() or staff_id = public.my_staff_id());
drop policy if exists task_admin on public.tasks;
create policy task_admin on public.tasks for all
  using (public.is_admin()) with check (public.is_admin());
-- a member of staff may move their own task along, nothing else
drop policy if exists task_own_update on public.tasks;
create policy task_own_update on public.tasks for update
  using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id());

-- ---------- sales targets ----------
create table if not exists public.targets (
  id       bigserial primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  month    date not null,                    -- first of the month
  amount   integer not null default 0,
  unique (staff_id, month)
);
alter table public.targets enable row level security;
drop policy if exists tgt_read on public.targets;
create policy tgt_read on public.targets for select
  using (public.my_role() is not null);
drop policy if exists tgt_write on public.targets;
create policy tgt_write on public.targets for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- payroll (records only, no money movement) ----------
create table if not exists public.payroll (
  id         bigserial primary key,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  month      date not null,
  base       integer not null default 0,
  commission integer not null default 0,
  bonus      integer not null default 0,
  deduction  integer not null default 0,
  net        integer generated always as (base + commission + bonus - deduction) stored,
  status     text not null default 'draft' check (status in ('draft','approved','paid')),
  paid_on    date,
  note       text,
  created_at timestamptz default now(),
  unique (staff_id, month)
);
alter table public.payroll enable row level security;
-- salary is private: the owner sees all, everyone else only their own
drop policy if exists pay_read on public.payroll;
create policy pay_read on public.payroll for select
  using (public.has_role('owner') or staff_id = public.my_staff_id());
drop policy if exists pay_write on public.payroll;
create policy pay_write on public.payroll for all
  using (public.has_role('owner')) with check (public.has_role('owner'));

-- ---------- SOPs ----------
create table if not exists public.sops (
  id         bigserial primary key,
  title      text not null,
  category   text default 'General',
  body       text not null default '',
  for_roles  text[] not null default '{owner,manager,sales,workshop}',
  version    integer not null default 1,
  active     boolean not null default true,
  updated_at timestamptz default now()
);
alter table public.sops enable row level security;
drop policy if exists sop_read on public.sops;
create policy sop_read on public.sops for select
  using (active and (public.my_role() = any(for_roles) or public.is_admin()));
drop policy if exists sop_write on public.sops;
create policy sop_write on public.sops for all
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.sop_acks (
  sop_id   bigint not null references public.sops(id) on delete cascade,
  staff_id uuid  not null references public.staff(id) on delete cascade,
  acked_at timestamptz default now(),
  primary key (sop_id, staff_id)
);
alter table public.sop_acks enable row level security;
drop policy if exists ack_read on public.sop_acks;
create policy ack_read on public.sop_acks for select
  using (public.is_admin() or staff_id = public.my_staff_id());
drop policy if exists ack_mine on public.sop_acks;
create policy ack_mine on public.sop_acks for insert
  with check (staff_id = public.my_staff_id());

-- ---------- expenses (so finance can show profit, not just turnover) ----------
create table if not exists public.expenses (
  id         bigserial primary key,
  on_date    date not null default current_date,
  category   text not null default 'Other',
  detail     text,
  amount     integer not null,
  created_at timestamptz default now()
);
alter table public.expenses enable row level security;
drop policy if exists exp_read on public.expenses;
create policy exp_read on public.expenses for select using (public.is_admin());
drop policy if exists exp_write on public.expenses;
create policy exp_write on public.expenses for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- offline sales + attribution + unit cost ----------
alter table public.orders add column if not exists channel  text not null default 'web';
alter table public.orders add column if not exists staff_id uuid references public.staff(id) on delete set null;
alter table public.orders add column if not exists paid     boolean not null default false;
do $$ begin
  alter table public.orders add constraint orders_channel_ck
    check (channel in ('web','whatsapp','phone','walkin','instagram'));
exception when duplicate_object then null; end $$;

-- what a bat costs us to make - null until the owner fills it in
alter table public.products add column if not exists cost integer;

-- staff may log an offline sale; only admins may edit one afterwards
drop policy if exists orders_staff_insert on public.orders;
create policy orders_staff_insert on public.orders for insert
  with check (true);
drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders for select
  using (public.is_admin() or staff_id = public.my_staff_id());

-- ---------- customer leaderboard ----------
create or replace view public.customer_stats
with (security_invoker = true) as
select
  coalesce(customer->>'phone','unknown')      as phone,
  max(customer->>'name')                      as name,
  max(customer->>'city')                      as city,
  count(*)::int                               as order_count,
  sum(total)::int                             as spend,
  max(created_at)                             as last_order,
  min(created_at)                             as first_order
from public.orders
where status <> 'cancelled'
group by 1;

-- ---------- seed: a starter SOP set ----------
-- The unique index is what makes `on conflict do nothing` actually do nothing.
-- Without it every re-run of this file silently inserts another copy of each SOP.
create unique index if not exists sops_title_uidx on public.sops (lower(title));

insert into public.sops (title, category, body, for_roles) values
  ('Packing a bat for dispatch','Dispatch',
   E'1. Check the bat matches the order — model, weight, grip.\n2. Photograph the bat face and back.\n3. Bubble wrap the blade, then the handle separately.\n4. Corrugated sleeve over the toe.\n5. Tape the box, add the invoice, stick the label.\n6. Mark the order Packed in the Maze Room.',
   '{owner,manager,workshop}'),
  ('Answering a WhatsApp enquiry','Sales',
   E'1. Reply within 10 minutes in working hours.\n2. Ask: which ball, soft or medium? What is your budget?\n3. Recommend two bats, never more.\n4. Send real photos of the actual bat.\n5. Confirm weight and height before taking payment.\n6. Log the sale in the Maze Room under your name.',
   '{owner,manager,sales}'),
  ('Grading and seasoning','Workshop',
   E'1. Reject any cleft with a knot in the hitting zone.\n2. Press to the profile sheet for the model.\n3. Season, then rest before finishing.\n4. Check the toe is square before toe guard.\n5. Log the finished bat into stock.',
   '{owner,manager,workshop}')
on conflict do nothing;
