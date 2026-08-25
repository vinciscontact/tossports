-- ============================================================
-- 011 — SERVICE REQUESTS AND PRODUCT QUESTIONS
--
-- Backs the Tier 1 features: Bat Doctor, custom bat, custom
-- jersey, wholesale, trade-in, customer video, and public Q&A
-- on product pages.
--
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- requests
--
-- One table, discriminated by `kind`, rather than six tables
-- that would differ only in their payload columns. Six tables
-- would mean six sets of RLS policies to keep in step, six Maze
-- Room screens, and six places to fix when a shared field like
-- `status` changes. The parts that are genuinely common —
-- who asked, what state it is in, what it was quoted, which
-- coupon settled it — are real columns; the parts that differ
-- per kind live in `payload`.
--
-- This mirrors how `orders` already stores customer and items
-- as jsonb, so it is the pattern this codebase established.
-- ------------------------------------------------------------
create table if not exists public.requests (
  id          bigserial primary key,
  kind        text not null,
  customer    jsonb not null default '{}'::jsonb,   -- name, phone, email, city
  payload     jsonb not null default '{}'::jsonb,   -- everything kind-specific
  photos      text[] not null default '{}',         -- storage URLs
  status      text not null default 'new',          -- new|quoted|accepted|done|declined
  quote       integer,                              -- rupees, set by staff
  coupon      text,                                 -- code issued, if any
  staff_note  text,
  branch      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Constrain `kind` so a typo in the client cannot quietly create a
-- category of request that no Maze Room screen ever lists.
alter table public.requests drop constraint if exists requests_kind_ck;
alter table public.requests add constraint requests_kind_ck
  check (kind in ('bat_doctor','custom_bat','jersey','wholesale','trade_in','video'));

alter table public.requests drop constraint if exists requests_status_ck;
alter table public.requests add constraint requests_status_ck
  check (status in ('new','quoted','accepted','done','declined'));

create index if not exists requests_kind_idx    on public.requests (kind, created_at desc);
create index if not exists requests_status_idx  on public.requests (status);

alter table public.requests enable row level security;

-- Anyone may submit a request — these are public forms on the storefront.
drop policy if exists requests_public_insert on public.requests;
create policy requests_public_insert on public.requests
  for insert with check (true);

-- But nobody anonymous may READ them. A request carries a phone number and
-- often photos of someone's home; public insert must never imply public
-- select. This is the same shape as the orders policies above it.
drop policy if exists requests_admin_read on public.requests;
create policy requests_admin_read on public.requests
  for select using (public.is_admin());

drop policy if exists requests_admin_write on public.requests;
create policy requests_admin_write on public.requests
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists requests_admin_delete on public.requests;
create policy requests_admin_delete on public.requests
  for delete using (public.is_admin());

-- Columns a submitter must never set for themselves. `quote`, `coupon` and
-- `status` decide money and are staff-only, but RLS grants a whole row on
-- insert — it cannot withhold three columns. This trigger resets them, so
-- a crafted POST cannot arrive pre-approved with a coupon attached.
create or replace function public.requests_sanitise()
returns trigger language plpgsql as $$
begin
  new.status     := 'new';
  new.quote      := null;
  new.coupon     := null;
  new.staff_note := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists requests_sanitise_ins on public.requests;
create trigger requests_sanitise_ins
  before insert on public.requests
  for each row execute function public.requests_sanitise();

create or replace function public.requests_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists requests_touch_upd on public.requests;
create trigger requests_touch_upd
  before update on public.requests
  for each row execute function public.requests_touch();


-- ------------------------------------------------------------
-- product_questions
--
-- Public Q&A on a product page. Kept separate from `requests`
-- because the read rule is the opposite: an answered question is
-- meant to be read by everyone, which is the entire point — the
-- same question answered on WhatsApp helps one person and then
-- disappears.
-- ------------------------------------------------------------
create table if not exists public.product_questions (
  id          bigserial primary key,
  product_id  text not null,
  asker       text,                                  -- first name only
  question    text not null,
  answer      text,
  answered_by text,
  answered_at timestamptz,
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists pq_product_idx
  on public.product_questions (product_id, published, created_at desc);

alter table public.product_questions enable row level security;

drop policy if exists pq_public_insert on public.product_questions;
create policy pq_public_insert on public.product_questions
  for insert with check (true);

-- Only answered AND published questions are readable. Both conditions on
-- purpose: `published` is the moderator's decision, and the answer check
-- means an approved-but-unanswered row can never leak a bare question onto
-- the page.
drop policy if exists pq_public_read on public.product_questions;
create policy pq_public_read on public.product_questions
  for select using (published = true and answer is not null);

drop policy if exists pq_admin_read on public.product_questions;
create policy pq_admin_read on public.product_questions
  for select using (public.is_admin());

drop policy if exists pq_admin_write on public.product_questions;
create policy pq_admin_write on public.product_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- Same reasoning as requests: a submitter cannot publish their own answer.
create or replace function public.pq_sanitise()
returns trigger language plpgsql as $$
begin
  new.answer      := null;
  new.answered_by := null;
  new.answered_at := null;
  new.published   := false;
  new.created_at  := now();
  return new;
end;
$$;

drop trigger if exists pq_sanitise_ins on public.product_questions;
create trigger pq_sanitise_ins
  before insert on public.product_questions
  for each row execute function public.pq_sanitise();


-- ------------------------------------------------------------
-- track_order
--
-- Order tracking without an account. The customer has their order
-- number and the phone they ordered with; requiring both is what
-- stops someone walking the id space and reading other people's
-- orders, so `orders` itself stays admin-read-only and this
-- function is the single narrow window through it.
--
-- It returns only what a tracking page needs. Address, email and
-- payment id are deliberately not in the result.
-- ------------------------------------------------------------
-- Dropped first, not merely replaced. CREATE OR REPLACE cannot change a
-- function's return type, and 012 later widens this one to carry the courier
-- columns. On a database where 012 has already run, re-running this file — or
-- the consolidated COMPLETE-SCHEMA — would hit the 10-column version with a
-- 7-column definition and fail with "cannot change return type of existing
-- function". Dropping makes this file re-runnable from any state, which is
-- the whole promise made at the top of it.
drop function if exists public.track_order(text, text);

create or replace function public.track_order(p_id text, p_phone text)
returns table (
  id text, status text, total integer, method text,
  items jsonb, created_at timestamptz, name text
)
language sql stable security definer set search_path = public as $$
  select o.id, o.status, o.total, o.method, o.items, o.created_at,
         coalesce(o.customer->>'name', '')
  from public.orders o
  where lower(o.id) = lower(trim(p_id))
    -- compare digits only: someone who typed +91 98765 43210 at checkout
    -- will type 9876543210 here, and both should match.
    and right(regexp_replace(coalesce(o.customer->>'phone',''), '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10)
    and length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 10
  limit 1;
$$;

revoke all on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Storage bucket for request photos and customer videos.
-- Public read (the URLs are unguessable), authenticated write is
-- not possible here because submitters are anonymous — so uploads
-- go to a dedicated bucket that holds nothing sensitive.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('requests', 'requests', true)
on conflict (id) do nothing;

drop policy if exists requests_upload on storage.objects;
create policy requests_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'requests');

drop policy if exists requests_read on storage.objects;
create policy requests_read on storage.objects
  for select using (bucket_id = 'requests');

-- ============================================================
-- After running this, verify RLS is actually holding:
--
--   select * from public.requests;            -- must return 0 rows for anon
--   select * from public.product_questions;   -- only published+answered
--
-- Run both from the SQL editor's "anon" role, not as postgres.
-- ============================================================
