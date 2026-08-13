-- ============================================================
--  TOSS SPORTS — billing
--
--  Two documents, decided by whether a GSTIN is set in settings:
--    · GSTIN present  -> TAX INVOICE with HSN and a CGST/SGST or IGST split
--    · GSTIN absent   -> BILL OF SUPPLY with no tax shown at all
--  Showing GST without being registered is not a cosmetic error, so the
--  system refuses to print tax lines until the GSTIN actually exists.
--
--  Prices on this site are tax-INCLUSIVE ("the price on the bat is the price
--  you pay"), so the taxable value is back-calculated from the total rather
--  than tax being added on top. The customer always pays the marked price.
--
--  Run after 004-repair-roles.sql. Safe to re-run.
-- ============================================================

-- ---------- sequential numbering, per financial year ----------
-- Indian invoice numbers must be unique and unbroken within a financial
-- year (April–March), so the counter is keyed by FY and incremented
-- atomically — two tills billing at once cannot collide.
create table if not exists public.invoice_counters (
  fy text primary key,
  n  integer not null default 0
);
alter table public.invoice_counters enable row level security;
drop policy if exists ic_admin on public.invoice_counters;
create policy ic_admin on public.invoice_counters for all
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.current_fy()
returns text language sql stable as $$
  select case when extract(month from now() at time zone 'Asia/Kolkata') >= 4
    then to_char(now() at time zone 'Asia/Kolkata', 'YY') || '-' ||
         to_char((now() at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else to_char((now() at time zone 'Asia/Kolkata') - interval '1 year', 'YY') || '-' ||
         to_char(now() at time zone 'Asia/Kolkata', 'YY')
  end;
$$;

create or replace function public.next_invoice_no()
returns text language plpgsql security definer set search_path = public as $$
declare v_fy text; v_n integer; v_prefix text;
begin
  v_fy := public.current_fy();
  insert into public.invoice_counters (fy, n) values (v_fy, 1)
    on conflict (fy) do update set n = public.invoice_counters.n + 1
    returning n into v_n;
  select coalesce(value #>> '{}', 'TOSS') into v_prefix
    from public.settings where key = 'invoice_prefix';
  return coalesce(v_prefix,'TOSS') || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end;
$$;

-- ---------- the bills themselves ----------
-- Seller and buyer details are SNAPSHOTTED onto each invoice. A bill is a
-- legal record of a moment: if the shop address or a customer's details
-- change later, an already-issued invoice must not change with them.
create table if not exists public.invoices (
  id            bigserial primary key,
  number        text unique not null,
  fy            text not null,
  order_id      text references public.orders(id) on delete set null,
  issued_at     timestamptz not null default now(),

  seller        jsonb not null default '{}',   -- name, gstin, address, state
  buyer         jsonb not null default '{}',   -- name, phone, address, state
  place_of_supply text,

  items         jsonb not null default '[]',   -- name, hsn, qty, rate, taxable, tax
  is_tax_invoice boolean not null default false,
  gst_rate      numeric(5,2) not null default 0,

  taxable       integer not null default 0,
  cgst          integer not null default 0,
  sgst          integer not null default 0,
  igst          integer not null default 0,
  shipping      integer not null default 0,
  discount      integer not null default 0,
  round_off     integer not null default 0,
  total         integer not null default 0,

  payment       text,                          -- upi | card | cash | whatsapp | online
  channel       text not null default 'web',
  staff_id      uuid references public.staff(id) on delete set null,
  notes         text,
  cancelled     boolean not null default false
);
create index if not exists invoices_issued_idx on public.invoices (issued_at desc);
create index if not exists invoices_order_idx on public.invoices (order_id);
alter table public.invoices enable row level security;

drop policy if exists inv_read on public.invoices;
create policy inv_read on public.invoices for select
  using (public.is_admin() or staff_id = public.my_staff_id());
drop policy if exists inv_write on public.invoices;
create policy inv_write on public.invoices for all
  using (public.is_admin()) with check (public.is_admin());

-- A bill is never deleted, only cancelled — the number must stay in the
-- sequence or the run is broken, which is exactly what auditors look for.
create or replace function public.block_invoice_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Invoices cannot be deleted. Mark cancelled instead.';
end;
$$;
drop trigger if exists invoices_no_delete on public.invoices;
create trigger invoices_no_delete before delete on public.invoices
  for each row execute function public.block_invoice_delete();

-- ---------- settings the invoice needs ----------
insert into public.settings (key, value) values
  ('gstin',            '""'::jsonb),
  ('legal_name',       '"Toss Sports"'::jsonb),
  ('business_address', '""'::jsonb),
  ('business_state',   '"Tamil Nadu"'::jsonb),
  ('gst_rate',         '12'::jsonb),
  ('hsn_code',         '"9506"'::jsonb),
  ('invoice_prefix',   '"TOSS"'::jsonb)
on conflict (key) do nothing;
