-- ============================================================
--  TOSS SPORTS — analysis that stays true as the business grows
--
--  The problem this solves: the Maze Room downloads the most recent
--  orders and adds them up in the browser. That is fine at 50 orders
--  and quietly wrong at 5,000 — the totals would silently describe
--  only recent history while looking like all-time figures.
--
--  So the aggregates move into Postgres, which counts EVERY row every
--  time regardless of what the browser holds. The screens keep their
--  live feel; the numbers stop depending on a download limit.
--
--  Also here:
--    · expenses gain a branch, so each shop can have a real P&L
--    · product profitability, dead stock and repeat customers
--    · a health check the founder screen can run against raw data
--
--  Run after 009-branches.sql. Safe to re-run.
-- ============================================================

-- ---------- expenses belong to a branch ----------
alter table public.expenses add column if not exists branch_id text
  references public.branches(id) on update cascade;

update public.expenses set branch_id = public.default_branch() where branch_id is null;
alter table public.expenses alter column branch_id set default public.default_branch();

-- a manager may only see and record their own branch's spending
drop policy if exists exp_read on public.expenses;
create policy exp_read on public.expenses for select
  using (public.is_admin() and public.can_see_branch(branch_id));
drop policy if exists exp_write on public.expenses;
create policy exp_write on public.expenses for all
  using (public.is_admin() and public.can_see_branch(branch_id))
  with check (public.is_admin() and public.can_see_branch(branch_id));

-- ---------- month by month, computed over EVERYTHING ----------
-- security_invoker so each person's RLS still applies: a branch manager
-- querying this sees their branch only, a founder sees all.
create or replace view public.v_month_sales
with (security_invoker = true) as
select
  to_char(o.created_at at time zone 'Asia/Kolkata', 'YYYY-MM')  as month,
  coalesce(o.branch_id, 'chennai')                              as branch_id,
  count(*)::int                                                 as orders,
  coalesce(sum(o.total), 0)::bigint                             as revenue,
  coalesce(sum((
    select sum(coalesce(p.cost, 0) * greatest(1, coalesce((it->>'qty')::int, 1)))
      from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
      join public.products p on p.id = it->>'id'
  )), 0)::bigint                                                as cogs,
  count(*) filter (where o.paid)::int                           as paid_orders
from public.orders o
where o.status <> 'cancelled'
group by 1, 2;

create or replace view public.v_month_expenses
with (security_invoker = true) as
select
  to_char(e.on_date, 'YYYY-MM')          as month,
  coalesce(e.branch_id, 'chennai')       as branch_id,
  coalesce(sum(e.amount), 0)::bigint     as expenses
from public.expenses e
group by 1, 2;

-- payroll follows the person's branch
create or replace view public.v_month_payroll
with (security_invoker = true) as
select
  to_char(pr.month, 'YYYY-MM')           as month,
  coalesce(s.branch_id, 'chennai')       as branch_id,
  coalesce(sum(pr.net), 0)::bigint       as salaries
from public.payroll pr
left join public.staff s on s.id = pr.staff_id
where pr.status = 'paid'
group by 1, 2;

-- one row per month per branch, everything joined: THE report
create or replace view public.v_month_pl
with (security_invoker = true) as
select
  coalesce(sa.month, ex.month, pa.month)             as month,
  coalesce(sa.branch_id, ex.branch_id, pa.branch_id) as branch_id,
  coalesce(sa.orders, 0)                             as orders,
  coalesce(sa.revenue, 0)                            as revenue,
  coalesce(sa.cogs, 0)                               as cogs,
  coalesce(ex.expenses, 0)                           as expenses,
  coalesce(pa.salaries, 0)                           as salaries,
  coalesce(sa.revenue, 0) - coalesce(sa.cogs, 0)
    - coalesce(ex.expenses, 0) - coalesce(pa.salaries, 0) as net
from public.v_month_sales sa
full join public.v_month_expenses ex using (month, branch_id)
full join public.v_month_payroll  pa using (month, branch_id);

-- ---------- which bats actually make money ----------
-- Units sold and PROFIT, not just revenue: a ₹950 bat selling twenty
-- times can earn less than a ₹2,999 bat selling five.
create or replace view public.v_product_performance
with (security_invoker = true) as
select
  p.id, p.name, p.category, p.tier, p.price, p.cost,
  coalesce(sum(greatest(1, coalesce((it->>'qty')::int, 1))), 0)::int as units,
  coalesce(sum(greatest(1, coalesce((it->>'qty')::int, 1)) * coalesce(p.price, 0)), 0)::bigint as revenue,
  coalesce(sum(greatest(1, coalesce((it->>'qty')::int, 1))
             * (coalesce(p.price, 0) - coalesce(p.cost, 0))), 0)::bigint as profit,
  max(o.created_at) as last_sold
from public.products p
left join public.orders o
       on o.status <> 'cancelled'
      and exists (select 1 from jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) x
                   where x->>'id' = p.id)
left join lateral jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) it
       on it->>'id' = p.id
group by p.id, p.name, p.category, p.tier, p.price, p.cost;

-- ---------- best seller of each month, ranked ----------
create or replace view public.v_month_best_seller
with (security_invoker = true) as
with sold as (
  select
    to_char(o.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
    coalesce(o.branch_id, 'chennai')                            as branch_id,
    it->>'id'                                                   as product_id,
    sum(greatest(1, coalesce((it->>'qty')::int, 1)))::int        as units,
    sum(greatest(1, coalesce((it->>'qty')::int, 1))
        * coalesce(p.price, 0))::bigint                         as revenue
  from public.orders o
  cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
  left join public.products p on p.id = it->>'id'
  where o.status <> 'cancelled'
  group by 1, 2, 3
)
select month, branch_id, product_id, units, revenue,
       rank() over (partition by month, branch_id order by units desc, revenue desc) as rank
  from sold;

-- ---------- stock that is not moving ----------
create or replace view public.v_dead_stock
with (security_invoker = true) as
select
  ps.product_id, p.name, ps.branch_id, ps.stock,
  coalesce(p.cost, 0) * ps.stock            as tied_up,
  perf.last_sold,
  case when perf.last_sold is null then null
       else (now()::date - perf.last_sold::date) end as days_since_sale
from public.product_stock ps
join public.products p on p.id = ps.product_id
left join (
  select it->>'id' as product_id, max(o.created_at) as last_sold
    from public.orders o
    cross join lateral jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) it
   where o.status <> 'cancelled'
   group by 1
) perf on perf.product_id = ps.product_id
where ps.stock > 0
  and (perf.last_sold is null or perf.last_sold < now() - interval '60 days');

-- ---------- repeat customers ----------
create or replace view public.v_customer_loyalty
with (security_invoker = true) as
select
  coalesce(customer->>'phone', 'unknown')  as phone,
  max(customer->>'name')                   as name,
  count(*)::int                            as orders,
  sum(total)::bigint                       as spend,
  min(created_at)                          as first_order,
  max(created_at)                          as last_order,
  case when count(*) > 1
       then (max(created_at)::date - min(created_at)::date) / greatest(1, count(*) - 1)
       else null end::int                  as avg_days_between
from public.orders
where status <> 'cancelled'
group by 1;

-- ---------- the health check ----------
-- Everything that could quietly make a number wrong, in one place, read
-- straight from the raw tables. The founder screen renders whatever this
-- returns, so adding a check later needs no browser change.
create or replace function public.data_health()
returns table (severity text, area text, detail text, count bigint)
language sql stable security definer set search_path = public as $$
  select 'error', 'Stock', 'products whose total disagrees with their branch stock', count(*)
    from public.products p
   where p.stock <> coalesce((select sum(ps.stock) from public.product_stock ps
                               where ps.product_id = p.id), 0)
  having count(*) > 0
  union all
  select 'error', 'Stock', 'products with no stock record at some branch', count(*)
    from public.products p cross join public.branches b
   where not exists (select 1 from public.product_stock ps
                      where ps.product_id = p.id and ps.branch_id = b.id)
  having count(*) > 0
  union all
  select 'error', 'Orders', 'live orders not assigned to any branch', count(*)
    from public.orders where branch_id is null and status <> 'cancelled'
  having count(*) > 0
  union all
  select 'warn', 'Profit', 'products with no cost price — profit is optimistic', count(*)
    from public.products where cost is null and active
  having count(*) > 0
  union all
  select 'warn', 'Profit', 'sold items whose product no longer exists', count(distinct it->>'id')
    from public.orders o cross join lateral jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) it
   where o.status <> 'cancelled'
     and not exists (select 1 from public.products p where p.id = it->>'id')
  having count(*) > 0
  union all
  select 'warn', 'Team', 'staff with no login yet', count(*)
    from public.staff where uid is null and active
  having count(*) > 0
  union all
  select 'warn', 'Team', 'staff not assigned to a branch (they see everything)', count(*)
    from public.staff where branch_id is null and active and role not in ('founder','owner')
  having count(*) > 0
  union all
  select 'warn', 'Billing', 'orders with no bill raised', count(*)
    from public.orders o
   where o.status <> 'cancelled'
     and not exists (select 1 from public.invoices i
                      where i.order_id = o.id and not i.cancelled)
  having count(*) > 0
  union all
  select 'info', 'Sales', 'orders recorded in total', count(*) from public.orders
  having count(*) > 0;
$$;

-- ---------- self-test ----------
do $$
declare n int;
begin
  perform 1 from public.v_month_pl limit 1;
  perform 1 from public.v_product_performance limit 1;
  perform 1 from public.v_month_best_seller limit 1;
  perform 1 from public.v_dead_stock limit 1;
  perform 1 from public.v_customer_loyalty limit 1;
  select count(*) into n from public.data_health() where severity = 'error';
  raise notice 'analytics ready — % data error(s) found by the health check', n;
end $$;
