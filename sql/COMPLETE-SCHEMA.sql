-- ============================================================
--  TOSS SPORTS — COMPLETE SCHEMA
--
--  Every migration, in order, in one file. Paste the whole thing
--  into the Supabase SQL editor and run it once.
--
--  GENERATED FILE — do not edit. Change a migration and rebuild:
--      node sql/build.js
--
--  Safe to re-run. Every statement is written to be idempotent:
--  create table if not exists, drop policy if exists before
--  create policy, create or replace function. Running it twice
--  leaves the same database, not a broken one.
--
--  NOT included, on purpose:
--    014-handover-reset.sql     deletes all transactional data
--    015-handover-accounts.sql  replaces the whole team
--  Those are destructive and are run deliberately, once, at
--  handover — never as part of "set up the database".
--
--  ⚠  ONE THING TO KNOW BEFORE RUNNING 12.
--     public.orders currently accepts anonymous inserts
--     (orders_public_insert ... with check (true)), and section
--     12 adds a trigger that decrements stock when an order is
--     inserted. Together those let anyone drain the shop's stock
--     without paying. On a NEW database with no traffic that is
--     fine; before the site is public, order creation needs to
--     move behind a SECURITY DEFINER function that recomputes
--     the total server-side. See the audit.
--
--  Built 2026-08-25 from 13 migrations.
-- ============================================================


-- ############################################################
-- #  01. schema.sql
-- #  Core tables, RLS, and the 29-bat catalogue
-- ############################################################

-- ============================================================
--  TOSS SPORTS — Supabase schema for the Maze Room
--  Run this once in  Supabase Dashboard → SQL Editor → New query
--  Safe to re-run: it drops and recreates cleanly.
-- ============================================================

-- ---------- who is allowed to administer the store ----------
-- Firebase UIDs live here, with a role. A person can administer the shop
-- only if their Firebase uid appears here as owner or manager.
--
-- NOTE: this table and these helpers are defined identically in
-- 002-operations.sql and 004-repair-roles.sql, so re-running any of those
-- files in any order is safe. An earlier version of this file used a
-- separate `admins` table; re-running it silently reverted is_admin() and
-- locked every administrator out. Do not reintroduce that split.
create table if not exists public.staff (
  id             uuid primary key default gen_random_uuid(),
  uid            text unique,
  name           text not null,
  phone          text,
  email          text,
  role           text not null default 'sales'
                 check (role in ('owner','manager','sales','workshop')),
  base_salary    integer not null default 0,
  commission_pct numeric(5,2) not null default 0,
  joined_on      date default current_date,
  active         boolean not null default true,
  created_at     timestamptz default now()
);
create index if not exists staff_uid_idx on public.staff (uid);
alter table public.staff enable row level security;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff where uid = auth.jwt() ->> 'sub' and active;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('owner','manager'), false);
$$;

-- staff can see the roster; only an owner may change it (salaries live here)
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select using (public.my_role() is not null);
drop policy if exists staff_owner_write on public.staff;
create policy staff_owner_write on public.staff for all
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- ---------- products ----------
create table if not exists public.products (
  id         text primary key,
  name       text not null,
  price      integer,          -- null = "price on request"
  mrp        integer,
  tier       text check (tier in ('entry','mid','premium')),
  stock      integer not null default 0,
  active     boolean not null default true,
  sort       integer not null default 0,
  images     text[] not null default '{}',
  data       jsonb  not null default '{}',   -- every spec field
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists products_sort_idx on public.products (sort);
create index if not exists products_active_idx on public.products (active);
alter table public.products enable row level security;

-- the storefront reads active products; only admins write
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select using (active = true);
drop policy if exists products_admin_read on public.products;
create policy products_admin_read on public.products for select using (public.is_admin());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all using (public.is_admin()) with check (public.is_admin());

-- ---------- orders ----------
create table if not exists public.orders (
  id         text primary key,
  customer   jsonb  not null,
  items      jsonb  not null,
  subtotal   integer not null,
  shipping   integer not null default 0,
  discount   integer not null default 0,
  total      integer not null,
  coupon     text,
  method     text not null,             -- cod | online | whatsapp
  status     text not null default 'new',
  payment_id text,
  created_at timestamptz default now()
);
create index if not exists orders_created_idx on public.orders (created_at desc);
alter table public.orders enable row level security;

-- a customer may place an order but may never read the order book
drop policy if exists orders_public_insert on public.orders;
create policy orders_public_insert on public.orders for insert with check (true);
drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select using (public.is_admin());
drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write on public.orders for update using (public.is_admin()) with check (public.is_admin());

-- ---------- coupons ----------
-- Deliberately NOT publicly readable: the codes are meant to stay a
-- surprise until the player earns them.
create table if not exists public.coupons (
  code        text primary key,
  discount    integer not null,
  min_spend   integer not null default 0,
  unlock_runs integer,
  label       text,
  active      boolean not null default true,
  uses        integer not null default 0,
  created_at  timestamptz default now()
);
alter table public.coupons enable row level security;
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all on public.coupons for all using (public.is_admin()) with check (public.is_admin());

-- the storefront never selects from coupons; it calls these instead.

-- reveal the code earned by a given score (returns nothing if not earned)
create or replace function public.claim_reward(runs integer)
returns table (code text, discount integer, min_spend integer, label text)
language sql security definer set search_path = public as $$
  select c.code, c.discount, c.min_spend, c.label
  from public.coupons c
  where c.active and c.unlock_runs is not null and runs >= c.unlock_runs
  order by c.unlock_runs desc;
$$;

-- validate a code at checkout without ever exposing the coupon list
create or replace function public.validate_coupon(p_code text, p_subtotal integer)
returns table (valid boolean, discount integer, label text, reason text)
language plpgsql security definer set search_path = public as $$
declare r public.coupons%rowtype;
begin
  select * into r from public.coupons where upper(code) = upper(p_code) and active;
  if not found then
    return query select false, 0, null::text, 'That code does not exist'; return;
  end if;
  if p_subtotal < r.min_spend then
    return query select false, 0, r.label, 'Needs a subtotal of at least ' || r.min_spend; return;
  end if;
  return query select true, r.discount, r.label, null::text;
end;
$$;

-- ---------- leaderboard ----------
create table if not exists public.scores (
  id         bigserial primary key,
  name       text not null check (char_length(name) between 1 and 12),
  runs       integer not null check (runs between 0 and 500),
  wickets    integer not null default 0 check (wickets between 0 and 3),
  balls      integer not null default 0,
  created_at timestamptz default now()
);
create index if not exists scores_runs_idx on public.scores (runs desc);
alter table public.scores enable row level security;
drop policy if exists scores_public_read on public.scores;
create policy scores_public_read on public.scores for select using (true);
drop policy if exists scores_public_insert on public.scores;
create policy scores_public_insert on public.scores for insert with check (true);
drop policy if exists scores_admin_write on public.scores;
create policy scores_admin_write on public.scores for delete using (public.is_admin());

-- ---------- settings ----------
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);
alter table public.settings enable row level security;
drop policy if exists settings_public_read on public.settings;
create policy settings_public_read on public.settings for select using (true);
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- keep updated_at honest
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ============================================================
--  SEED
-- ============================================================

insert into public.coupons (code, discount, min_spend, unlock_runs, label) values
  ('GULLY50',  50,  1200, 30, '₹50 off'),
  ('GULLY100', 100, 1800, 50, '₹100 off')
on conflict (code) do nothing;

insert into public.settings (key, value) values
  ('whatsapp',        '"919176995707"'::jsonb),
  ('instagram',       '"toss_sportz"'::jsonb),
  ('free_ship_over',  '1500'::jsonb),
  ('ship_fee',        '99'::jsonb),
  ('razorpay_key',    '""'::jsonb),
  ('announcement',    '"Handcrafted in our own unit · Free shipping over ₹1,500"'::jsonb)
on conflict (key) do nothing;

insert into public.products (id, name, price, mrp, tier, sort, data) values
  ('regular-bat', 'Regular Bat', 950, 1200, 'entry', 0, '{"tagline":"The one everybody starts with","wood":"srilankan","profile":"standard","ball":["soft"],"weight":[550,850],"height":[34,34.5],"handle":"Single wood handle","sweetSpot":"Mid to low","finish":"Raw bat","spine":true,"edge":"Standard","popularity":78,"rating":4.2,"reviews":214,"badges":["Budget Pick"],"usage":"Street cricket, village tournaments, turf","features":["Sri Lankan wood, single piece","Strong and durable for soft tennis ball","Beginner friendly — nothing to learn, just swing","Most affordable bat in the Toss range"]}'::jsonb),
  ('regular-premium', 'Regular Premium', 1300, 1600, 'entry', 10, '{"tagline":"Same bat, finished properly","wood":"srilankan","profile":"standard","ball":["soft"],"weight":[600,800],"height":[34,34.5],"handle":"Single wood handle","sweetSpot":"Mid to low","finish":"Glossy coated, fully furnished","spine":true,"edge":"Standard","toeGuard":true,"popularity":74,"rating":4.4,"reviews":168,"badges":["Best Value"],"usage":"Soft tennis ball cricket","features":["Glassy coated and fully furnished","Comes with threading, power striker and toe guard","Single piece Sri Lankan wood","Beginner friendly at an affordable price"]}'::jsonb),
  ('varnished-bat', 'Varnished Bat', null, null, 'entry', 20, '{"tagline":"Best seller. Sleek edge, big ping.","wood":"srilankan","profile":"standard","ball":["soft","medium"],"weight":[650,900],"height":[35,36],"handle":"Single wood handle","sweetSpot":"Large, mid to low","finish":"Fully varnished, glossy","spine":true,"edge":"Sleek edge","popularity":88,"rating":4.6,"reviews":302,"badges":["Best Seller"],"usage":"Tennis ball cricket, tournaments","features":["Good grade Sri Lankan wood","Sleek edge for faster play","Lightweight, well-balanced design","Fully varnished for moisture protection","Powerful ping with a large sweet spot"]}'::jsonb),
  ('csl-scoop', 'CSL Customized Scoop', null, null, 'mid', 30, '{"tagline":"Chennai''s favourite","wood":"srilankan","profile":"scoop","ball":["soft","medium"],"weight":[650,800],"height":[34,35.5],"handle":"Single wood handle","sweetSpot":"Mid to low","finish":"Plain / Burnt / Painted (your choice)","spine":true,"edge":"Good edge","customizable":true,"popularity":84,"rating":4.5,"reviews":191,"badges":["Chennai''s Favourite","Customizable"],"usage":"Tennis ball cricket, street cricket, tournament matches","features":["Customized scoop design — plain, burnt or painted","Big hitting area with lightweight pickup","Overall balance thanks to the scoop","Height customizable 34 – 35.5 inches","Better balance, power hitting and fast swing"]}'::jsonb),
  ('jhl', 'JHL Joint Handle', null, null, 'mid', 40, '{"tagline":"Raw look, serious rebound","wood":"srilankan","profile":"standard","ball":["soft"],"weight":[700,850],"height":[35,36],"handle":"Joint handle","sweetSpot":"Mid to low","finish":"Raw bat with stickers","spine":true,"edge":"Standard","popularity":66,"rating":4.3,"reviews":97,"usage":"Soft tennis ball cricket","features":["Sri Lankan wood with an appealing spine","Joint handle construction","Excellent rebound and power transfer","Raw finish with Toss stickers"]}'::jsonb),
  ('mongoose-style', 'Mongoose Style', null, null, 'mid', 50, '{"tagline":"T20 batting, bottled","wood":"srilankan","profile":"mongoose","ball":["soft","medium"],"weight":[650,850],"height":[34,36],"handle":"Single wood, extended handle","sweetSpot":"Higher and larger","finish":"Standard","spine":true,"edge":"Standard","popularity":71,"rating":4.3,"reviews":88,"usage":"Local matches, aggressive hitting","features":["Single-piece Sri Lankan wood","Short blade with extended handle","Higher and larger sweet spot for slog play","Built for aggressive, T20-style batting"]}'::jsonb),
  ('kw-full-scoop', 'Kashmir Willow Full Scoop', 1800, 2200, 'mid', 60, '{"tagline":"A+ willow, full scooped back","wood":"kashmir","profile":"scoop","ball":["soft","medium"],"weight":[750,900],"height":[34.5,36],"handle":"Cane handle with rubber grip","sweetSpot":"Mid to low-middle","finish":"Polished","spine":true,"edge":"Standard","popularity":80,"rating":4.5,"reviews":143,"badges":["A+ Grade"],"usage":"Street cricket, tennis-ball tournaments","features":["A+ grade Kashmir Willow, single blade","Full scoop at the back for lighter pickup","Faster bat swing and easier lofted shots","Short handle (SH) full size","Durable build for regular play"]}'::jsonb),
  ('poplar-full-scoop', 'Poplar Full Scoop', 1500, 1800, 'entry', 70, '{"tagline":"Full scoop feel, half the price","wood":"poplar","profile":"scoop","ball":["soft","medium"],"weight":[750,900],"height":[34,36],"handle":"Normal handle","sweetSpot":"Mid to low","finish":"Standard","spine":true,"edge":"Standard","popularity":69,"rating":4.1,"reviews":112,"usage":"Recreational play, soft and medium tennis ball","features":["Poplar wood, single blade, full scoop back","Lightweight and easy to swing","Good for beginners and casual players","More affordable than Kashmir Willow"]}'::jsonb),
  ('flat-kw-spine', 'Flat Bat — Kashmir Willow', 1250, 1500, 'entry', 80, '{"tagline":"Retro flat, high spine","wood":"kashmir","profile":"flat","ball":["soft","medium"],"weight":[800,950],"height":[34,36],"handle":"Short handle (SH)","sweetSpot":"Mid to low","finish":"Standard","spine":true,"edge":"Standard","popularity":72,"rating":4.2,"reviews":126,"badges":["Retro"],"usage":"Soft and medium tennis ball","features":["A grade Kashmir Willow","High spine for extra punch","Lightweight pickup with good balance","Beginner friendly, retro flat look"]}'::jsonb),
  ('flat-poplar-spine', 'Flat Bat — Poplar', 1100, 1350, 'entry', 90, '{"tagline":"Cheapest way into a flat bat","wood":"poplar","profile":"flat","ball":["soft","medium"],"weight":[800,950],"height":[34,36],"handle":"Short handle (SH)","sweetSpot":"Mid to low","finish":"Standard","spine":true,"edge":"Standard","popularity":64,"rating":4,"reviews":89,"badges":["Budget Pick"],"usage":"Soft and medium tennis ball","features":["Poplar wood, short handle","High spine profile","Lightweight pickup with good balance","Beginner friendly, retro type"]}'::jsonb),
  ('flat-kw-nospine', 'Flat Bat No-Spine — Kashmir', 1850, 2200, 'mid', 100, '{"tagline":"Sleek and sword-like","wood":"kashmir","profile":"flat","ball":["soft"],"weight":[730,850],"height":[34,36],"handle":"Cane handle","sweetSpot":"Mid to low","finish":"Polished","spine":false,"edge":"Flat face","popularity":83,"rating":4.6,"reviews":158,"badges":["Bangalore Best Seller"],"usage":"Soft tennis ball — Wilson, Mercury","features":["Kashmir Willow, flat back with no spine","Sleek, sword-like look","Balanced and lightweight feel","Faster swing, durable build","Best seller in Bangalore"]}'::jsonb),
  ('flat-poplar-nospine', 'Flat Bat No-Spine — Poplar', 1550, 1850, 'mid', 110, '{"tagline":"The sword, on a budget","wood":"poplar","profile":"flat","ball":["soft"],"weight":[730,850],"height":[34,36],"handle":"Normal handle","sweetSpot":"Mid to low","finish":"Standard","spine":false,"edge":"Flat face","popularity":70,"rating":4.2,"reviews":104,"badges":["Bangalore Best Seller"],"usage":"Soft tennis ball","features":["Poplar wood, flat back with no spine","Sleek and sword look","Balanced and lightweight feel","Faster swing"]}'::jsonb),
  ('sl-varnished', 'Varnished Sri Lankan', 1600, 1950, 'mid', 120, '{"tagline":"Glossy armour against the weather","wood":"srilankan","profile":"standard","ball":["soft","medium"],"weight":[650,850],"height":[34,36],"handle":"Single wood handle","sweetSpot":"Mid to low","finish":"Glossy varnished","spine":true,"edge":"Standard","width":"5 inch","toeGuard":true,"popularity":76,"rating":4.4,"reviews":137,"usage":"Soft and medium tennis ball cricket","features":["Good Sri Lankan wood, single blade","Glossy varnish protects the wood surface","Reinforced toe protection","5 inch breadth, smooth flat face","Lightweight and balanced pickup"]}'::jsonb),
  ('sl-furnished', 'Sri Lankan Furnished', 1750, 2100, 'mid', 130, '{"tagline":"Stickers, gutting, the full treatment","wood":"srilankan","profile":"standard","ball":["soft","medium"],"weight":[650,850],"height":[34,36],"handle":"Single wood handle","sweetSpot":"Mid to low","finish":"Furnished and polished","spine":true,"edge":"Standard","popularity":79,"rating":4.5,"reviews":149,"usage":"Soft and medium tennis ball","features":["Premium Sri Lankan wood, single blade","Finished with stickers and gutting work","Strong toe, smooth finished face","Lightweight and well balanced","Enhanced strength for long-lasting performance"]}'::jsonb),
  ('cws', 'CWS', 2200, 2650, 'premium', 140, '{"tagline":"Sri Lankan blade. Indian handle.","wood":"srilankan","profile":"standard","ball":["soft","medium"],"weight":[770,880],"height":[34,36],"handle":"Normal Indian handle (hybrid)","sweetSpot":"Mid to low","finish":"Smooth polished","spine":true,"edge":"Standard","width":"4.7 – 4.9 inch","toeGuard":true,"popularity":92,"rating":4.7,"reviews":268,"badges":["Best Seller in Toss"],"usage":"Soft and medium tennis ball","features":["Premium Sri Lankan blade with Indian handle","Better control, comfort and durability","Rock base toe","Balanced and comfortable pickup","The bat Toss sells the most of"]}'::jsonb),
  ('custom-scoop', 'Customized Scoop', 2400, 2900, 'premium', 150, '{"tagline":"Pick your colour. Pick your finish.","wood":"srilankan","profile":"scoop","ball":["soft","medium"],"weight":[780,880],"height":[34,36],"handle":"Indian handle","sweetSpot":"Mid to low","finish":"Polished / Varnished / Painted colours","spine":true,"edge":"Standard","width":"5 inch","toeGuard":true,"customizable":true,"popularity":87,"rating":4.6,"reviews":201,"badges":["Best Seller","Customizable"],"usage":"Soft and medium tennis ball","features":["Hybrid Sri Lankan bat with middle scoop","Less weight and better overall balance","Toe guard fixed as standard","Paint finish colours available","Powerful hitting, faster bat speed, easy pickup"]}'::jsonb),
  ('cs-pro', 'CS PRO — Scoop + Thick Edges', 2500, 3000, 'premium', 160, '{"tagline":"Maximum power build","wood":"srilankan","profile":"scoop","ball":["soft","medium"],"weight":[800,950],"height":[34,36],"handle":"Premium Indian handle","sweetSpot":"Mid to low","finish":"Polished / Varnished / Painted colours","spine":true,"edge":"Thick edges","customizable":true,"popularity":85,"rating":4.7,"reviews":176,"badges":["Best Seller"],"usage":"Soft and medium tennis ball cricket","features":["Premium Sri Lankan wood, scoop profile","Thick edges for maximum power","Premium Indian handle","Lightweight feel with powerful balance","Attractive paint colours available"]}'::jsonb),
  ('ys-bat', 'YS Bat', 2300, 2800, 'premium', 170, '{"tagline":"Three-split handle. Thick edges.","wood":"srilankan","profile":"bigedge","ball":["soft","medium"],"weight":[750,850],"height":[34.5,34.5],"handle":"Strong handle with 3 split","sweetSpot":"Mid to low","finish":"Polished","spine":true,"edge":"Thick edges","customizable":true,"popularity":89,"rating":4.7,"reviews":223,"badges":["Best Selling Sri Lankan"],"usage":"Tennis ball cricket, street cricket, tournament matches","features":["Strong handle with 3 split construction","Thick edges for maximum power","Lightweight pickup with powerful hitting","Well balanced for easy shots","Weight customizable 750g – 850g"]}'::jsonb),
  ('big-edge-varnish-pro', 'Big Edge Varnish Pro', 2250, 2700, 'premium', 180, '{"tagline":"Made to clear the rope","wood":"srilankan","profile":"bigedge","ball":["soft","medium"],"weight":[780,900],"height":[35,36],"handle":"Joint handle, 2 piece","sweetSpot":"Extended","finish":"Varnished glossy","spine":true,"edge":"Massive big edge","popularity":86,"rating":4.6,"reviews":187,"usage":"Aggressive batsmen and boundary hitters","features":["Premium Sri Lankan hardwood","Big edge with extended sweet spot","Joint handle, 2 piece construction","Excellent rebound and power transfer","Durable varnished glossy finish"]}'::jsonb),
  ('sl-mongoose-joint', 'Sri Lankan Mongoose Joint Handle', 2200, 2650, 'premium', 190, '{"tagline":"Short blade. Long handle. No mercy.","wood":"srilankan","profile":"mongoose","ball":["soft","medium"],"weight":[750,900],"height":[34.5,36],"handle":"Joint handle, 3 piece","sweetSpot":"Larger, higher","finish":"Natural, fully furnished, anti-scuff ready","spine":true,"edge":"Standard","popularity":81,"rating":4.5,"reviews":132,"usage":"Soft and medium tennis ball power hitting and slogs","features":["Premium Sri Lankan willow","Short blade with long handle","Larger sweet spot and faster bat speed","Slightly curved face","Lightweight with excellent bat speed"]}'::jsonb),
  ('swagger', 'Swagger', 2250, 2700, 'premium', 200, '{"tagline":"Burnt finish destroyer","wood":"srilankan","profile":"bigedge","ball":["soft","medium"],"weight":[780,900],"height":[35,36],"handle":"Joint handle","sweetSpot":"Mid to low","finish":"Burnt finish","spine":true,"edge":"Thick edges","popularity":84,"rating":4.6,"reviews":165,"badges":["Great Reviews"],"usage":"Soft tennis, medium weight tennis","features":["A+ Sri Lankan wood","Distinctive burnt finish","Joint handle construction","Light weight and perfect balance","Shipping available across India"]}'::jsonb),
  ('power-x', 'Toss Power X', 2999, 3599, 'premium', 210, '{"tagline":"3 years of research. One bat.","wood":"srilankan","profile":"bigedge","ball":["soft","medium"],"weight":[650,860],"height":[34,36],"handle":"Science-induced handle guard","sweetSpot":"Extended","finish":"Hand crafted, water resistant","spine":true,"edge":"Big edge","toeGuard":true,"flagship":true,"warranty":"3 months assured warranty","variants":[{"id":"feather","name":"Feather Edition","weight":[650,699],"note":"Fastest pickup"},{"id":"mercury","name":"Mercury Plus Edition","weight":[700,760],"note":"Balanced"},{"id":"sixit","name":"Sixit Edition","weight":[790,860],"note":"Maximum power"}],"popularity":96,"rating":4.9,"reviews":341,"badges":["Flagship","3 Month Warranty"],"usage":"Every format of tennis ball cricket","features":["Molecules packed powerful bat","Triple hard seasoned","Science induced rock toe and handle guard","3 months assured warranty","3 years of research behind the build","Water resistant","Feather feel balance with big edge for slogs","Hand crafted — made with love and passion"]}'::jsonb),
  ('four-six-scoop-kw', 'Four & Sixit Scoop — Kashmir', 1750, 2100, 'mid', 220, '{"tagline":"4 and 6 scoop, A+ willow","wood":"kashmir","profile":"scoop","ball":["soft","medium"],"weight":[750,900],"height":[34,36],"handle":"Single cane handle","sweetSpot":"Powerful, mid","finish":"Premium polished","spine":true,"edge":"Thick edges","popularity":82,"rating":4.5,"reviews":154,"badges":["A+ Grade"],"usage":"Soft and medium tennis balls, wind balls","features":["Premium A+ grade Kashmir Willow","4 and 6 scoop design for spine and power","Cane handle for shock absorption and flex","Thick edges with scooped back profile","Quick bat swing and control on lofted shots"]}'::jsonb),
  ('four-six-scoop-poplar', 'Four & Sixit Scoop — Poplar', 1350, 1650, 'entry', 230, '{"tagline":"Affordable edition","wood":"poplar","profile":"scoop","ball":["soft","medium"],"weight":[750,900],"height":[34,36],"handle":"Normal handle","sweetSpot":"Mid","finish":"Premium polished with stickers","spine":true,"edge":"Thick edges","popularity":68,"rating":4.1,"reviews":96,"badges":["Budget Pick"],"usage":"Soft and medium tennis balls, turf cricket","features":["Poplar willow, affordable edition","4 / 6 scoop for spine and powerful hits","Thick edges with balanced weight distribution","Lightweight feel with excellent balance","Premium polished finish with attractive stickers"]}'::jsonb),
  ('kerala-scoop-furnished', 'Kerala Scoop Double Blade — Furnished', 2250, 2700, 'premium', 240, '{"tagline":"Popular across TN and Kerala","wood":"kashmir","profile":"multi","ball":["soft","medium"],"weight":[780,900],"height":[34,36],"handle":"Single cane handle with premium grip","sweetSpot":"Mid","finish":"Premium furnished","spine":true,"edge":"Thick edges","blades":2,"popularity":83,"rating":4.6,"reviews":171,"badges":["Double Blade"],"usage":"Tournament and turf cricket","features":["Double blade structure for added strength","Scoop design for faster bat swing","Thick edges for better power transfer","Premium furnished finishing","Popular in Tamil Nadu and Kerala"]}'::jsonb),
  ('kerala-scoop-unfurnished', 'Kerala Scoop Double Blade — Raw', 2050, 2450, 'premium', 250, '{"tagline":"Unfurnished. Pure wood.","wood":"kashmir","profile":"multi","ball":["medium"],"weight":[780,900],"height":[34,36],"handle":"Premium cane handle with strong binding","sweetSpot":"Mid","finish":"Unfurnished, raw","spine":true,"edge":"Standard","blades":2,"popularity":74,"rating":4.4,"reviews":118,"badges":["Double Blade"],"usage":"Medium tennis ball","features":["Kashmir Willow, raw unfurnished finish","Double blade construction for durability","Premium cane handle with strong binding","Powerful hitting performance","Good balance between pickup and punch"]}'::jsonb),
  ('poplar-double-blade', 'Poplar Double Blade — Furnished', 1950, 2350, 'mid', 260, '{"tagline":"Strong build, honest price","wood":"poplar","profile":"multi","ball":["soft","medium"],"weight":[780,950],"height":[34,36],"handle":"Single cane handle with premium grip","sweetSpot":"Large and extended","finish":"Fully furnished premium","spine":true,"edge":"Thick edges","blades":2,"popularity":73,"rating":4.3,"reviews":121,"badges":["Double Blade"],"usage":"Medium tennis, soft tennis, turf matches","features":["Premium poplar wood, double blade","Thick edges with full body profile","Large and extended sweet spot","Flat face for maximum power transfer","Suitable for front-foot and back-foot shots"]}'::jsonb),
  ('poplar-triple-blade', 'Poplar Triple Blade — Cane Handle', 2150, 2550, 'premium', 270, '{"tagline":"Triple laminated, affordable","wood":"poplar","profile":"multi","ball":["soft","medium"],"weight":[780,900],"height":[34,36],"handle":"Cane handle","sweetSpot":"Mid","finish":"Premium furnished","spine":true,"edge":"Thick edges","blades":3,"popularity":71,"rating":4.3,"reviews":103,"badges":["Triple Blade"],"usage":"Medium and soft tennis ball","features":["Premium quality poplar wood","Triple blade with thick edges","Cane handle for better shock absorption","Well-balanced weight distribution","Affordable edition"]}'::jsonb),
  ('kw-triple-blade', 'Kashmir Willow Triple Blade', 2450, 2950, 'premium', 280, '{"tagline":"Top of the willow range","wood":"kashmir","profile":"multi","ball":["soft","medium"],"weight":[780,900],"height":[34,36],"handle":"Cane handle","sweetSpot":"Mid","finish":"Professional furnished, smooth polished","spine":true,"edge":"Thick edges","blades":3,"popularity":79,"rating":4.6,"reviews":139,"badges":["A+ Grade","Triple Blade"],"usage":"Tournament and competitive tennis ball cricket","features":["Premium A+ grade Kashmir Willow","Triple blade with thick edges","Cane handle reduces vibration","Well-balanced pickup with powerful stroke play","Strong, long-lasting construction"]}'::jsonb)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, mrp = excluded.mrp,
  tier = excluded.tier, data = excluded.data;

-- ============================================================
--  LAST STEP — make yourself an admin.
--  Replace the uid below with your Firebase user's UID
--  (Firebase Console → Authentication → Users → copy UID)
-- ============================================================
-- insert into public.admins (uid, email, note)
-- values ('PASTE_FIREBASE_UID_HERE', 'you@example.com', 'owner');

-- ############################################################
-- #  02. 002-operations.sql
-- #  Staff, attendance, tasks, SOPs, payroll
-- ############################################################

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

-- ############################################################
-- #  03. 003-claim-by-email.sql
-- #  claim_staff() — binds a login to a staff row by email
-- ############################################################

-- ============================================================
--  Bind a Firebase login to a staff record by email.
--
--  Without this, every person you hire needs their Firebase UID
--  copied by hand out of the console and pasted into their staff
--  row. Instead the owner adds them by email, and the first time
--  they sign in their UID binds itself.
-- ============================================================

create or replace function public.claim_staff()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   text := auth.jwt() ->> 'sub';
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id    uuid;
begin
  if v_uid is null or v_uid = '' then
    return null;
  end if;

  -- already bound: nothing to do
  select id into v_id from public.staff where uid = v_uid;
  if found then
    return v_id;
  end if;

  if v_email = '' then
    return null;
  end if;

  -- claim an UNCLAIMED row whose email matches the verified token.
  -- uid is null is the important guard: an existing person's record
  -- can never be taken over by a second login.
  update public.staff
     set uid = v_uid
   where lower(email) = v_email
     and uid is null
     and active
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.claim_staff() from public;
grant execute on function public.claim_staff() to authenticated;

-- Put the owner on the staff list now, by email. The UID binds on first
-- successful sign-in, once Firebase is trusted as a third-party provider.
-- Guarded on the email rather than `on conflict do nothing`: there is no
-- unique constraint to conflict against on a fresh database, so the bare
-- form silently inserts a duplicate person every time this file is re-run.
insert into public.staff (name, email, role, base_salary)
select 'Sathyanarayana', 'dsathyanarayana2004@gmail.com', 'owner', 0
where not exists (
  select 1 from public.staff where lower(email) = 'dsathyanarayana2004@gmail.com'
);

-- ############################################################
-- #  04. 004-repair-roles.sql
-- #  Repairs role data left behind by the early admins table
-- ############################################################

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

-- ############################################################
-- #  05. 005-billing.sql
-- #  Invoices, GST, per-financial-year numbering
-- ############################################################

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

-- ############################################################
-- #  06. 006-stock-and-photos.sql
-- #  Stock counts and the product photo bucket
-- ############################################################

-- ============================================================
--  TOSS SPORTS — stock movement + product photo storage
--
--  Stock is adjusted by a database trigger rather than by the browser.
--  A web checkout, a counter sale and a hand-logged WhatsApp order all
--  insert into `orders`, so putting the rule here means every route is
--  covered and none can be bypassed or forgotten.
--
--  Run after 005-billing.sql. Safe to re-run.
-- ============================================================

-- ---------- stock movement ----------
create or replace function public.apply_stock_on_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.status = 'cancelled' then return new; end if;
  for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    update public.products
       set stock = greatest(0, stock - greatest(1, coalesce((it->>'qty')::int, 1)))
     where id = it->>'id';
  end loop;
  return new;
end;
$$;

drop trigger if exists orders_take_stock on public.orders;
create trigger orders_take_stock after insert on public.orders
  for each row execute function public.apply_stock_on_order();

-- Cancelling an order puts the bats back. Without this the count drifts
-- down every time an order is voided and never recovers.
create or replace function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.status = 'cancelled' and coalesce(old.status,'') <> 'cancelled' then
    for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
      update public.products
         set stock = stock + greatest(1, coalesce((it->>'qty')::int, 1))
       where id = it->>'id';
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_restore_stock on public.orders;
create trigger orders_restore_stock after update of status on public.orders
  for each row execute function public.restore_stock_on_cancel();

-- ---------- product photos ----------
-- Public bucket: product images are meant to be seen by everyone. Writing
-- is restricted to admins by the policies below.
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set public = true;

drop policy if exists product_photos_read on storage.objects;
create policy product_photos_read on storage.objects for select
  using (bucket_id = 'products');

drop policy if exists product_photos_write on storage.objects;
create policy product_photos_write on storage.objects for insert
  with check (bucket_id = 'products' and public.is_admin());

drop policy if exists product_photos_update on storage.objects;
create policy product_photos_update on storage.objects for update
  using (bucket_id = 'products' and public.is_admin());

drop policy if exists product_photos_delete on storage.objects;
create policy product_photos_delete on storage.objects for delete
  using (bucket_id = 'products' and public.is_admin());

-- ############################################################
-- #  07. 007-categories.sql
-- #  Product categories
-- ############################################################

-- ============================================================
--  TOSS SPORTS — product categories
--
--  Bats stop being the only thing the store can sell. Categories are a
--  flat list managed in the Maze Room; every product belongs to exactly
--  one. The storefront reads the same table, so a category created in
--  the Maze Room appears on the shop page automatically.
--
--  Deleting a category that still has products is blocked BY THE
--  DATABASE (restrict FK), not just by the UI — stock can never
--  silently vanish with its category.
--
--  Run after 006-stock-and-photos.sql. Safe to re-run.
-- ============================================================

create table if not exists public.categories (
  id         text primary key,                 -- slug: 'bats', 'rare-balls'
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

-- everyone can see categories (the shop needs them); only admins write
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select using (true);

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- the founding category — every existing product is a bat
insert into public.categories (id, name, sort)
values ('bats', 'Bats', 0)
on conflict (id) do nothing;

-- products point at their category; existing rows backfill to 'bats'
alter table public.products
  add column if not exists category text not null default 'bats';

update public.products set category = 'bats'
 where category is null or category = '';

-- restrict: a category with products in it cannot be deleted
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_category_fkey'
  ) then
    alter table public.products
      add constraint products_category_fkey
      foreign key (category) references public.categories(id)
      on update cascade on delete restrict;
  end if;
end $$;

-- self-test: the founding state must hold
do $$
declare n int;
begin
  select count(*) into n from public.categories where id = 'bats';
  if n <> 1 then raise exception 'categories seed failed'; end if;
  select count(*) into n from public.products where category not in
    (select id from public.categories);
  if n <> 0 then raise exception '% products have an unknown category', n; end if;
end $$;

-- ############################################################
-- #  08. 008-access-control.sql
-- #  Founder role, settings lock, append-only audit log
-- ############################################################

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

-- ############################################################
-- #  09. 009-branches.sql
-- #  Second branch, per-branch stock and transfers
-- ############################################################

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

-- ############################################################
-- #  10. 010-analytics.sql
-- #  P&L, product performance, dead stock, loyalty views
-- ############################################################

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

-- ############################################################
-- #  11. 011-services.sql
-- #  Requests, product Q&A, order tracking
-- ############################################################

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

-- ############################################################
-- #  12. 012-fulfilment.sql
-- #  Stock decrement on order, courier and tracking fields
-- ############################################################

-- ============================================================
-- 012 — FULFILMENT
--
--   · stock actually comes down when an order is placed
--   · courier and tracking number on an order
--   · a queue of customers who still need to be told
--
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Delivery fields on orders.
--
-- `notified_at` is what makes the confirmation queue work: null
-- means nobody has told this customer their order was received.
-- ------------------------------------------------------------
alter table public.orders add column if not exists courier      text;
alter table public.orders add column if not exists tracking_no  text;
alter table public.orders add column if not exists tracking_url text;
alter table public.orders add column if not exists notified_at  timestamptz;
alter table public.orders add column if not exists branch       text;

create index if not exists orders_unnotified_idx
  on public.orders (created_at desc) where notified_at is null;


-- ------------------------------------------------------------
-- Stock comes down with the order.
--
-- This is a trigger rather than a call the browser makes after
-- inserting, because the browser is not a place to enforce
-- anything. Two people buying the last bat within the same second
-- both see stock 1; whichever insert lands second must fail, and
-- only the database can decide that.
--
-- The UPDATE ... WHERE stock >= qty is the whole mechanism. Row
-- locking inside a single statement means the second transaction
-- waits for the first to commit and then re-evaluates against the
-- new value, so it cannot read a stale number. Reading the stock,
-- checking it, then writing it would leave a window between the
-- read and the write where exactly this race lives.
--
-- Orders that name no branch, or a product with no stock row, are
-- allowed through untouched: a made-to-order bat and a walk-in
-- sale are both real, and refusing them would be worse than not
-- tracking them.
-- ------------------------------------------------------------
create or replace function public.orders_take_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item     jsonb;
  pid      text;
  qty      integer;
  br       text;
  affected integer;
begin
  br := coalesce(new.branch, (select id from public.branches order by id limit 1));
  if br is null then return new; end if;

  for item in select * from jsonb_array_elements(new.items)
  loop
    pid := item->>'id';
    qty := greatest(1, coalesce((item->>'qty')::int, 1));
    if pid is null then continue; end if;

    update public.product_stock
       set stock = stock - qty, updated_at = now()
     where product_id = pid and branch_id = br and stock >= qty;

    get diagnostics affected = row_count;

    if affected = 0 then
      -- Distinguish "we do not track this one" from "there are not enough".
      -- Only the second is an error; the first is normal for made-to-order.
      if exists (select 1 from public.product_stock
                  where product_id = pid and branch_id = br) then
        raise exception
          'Not enough stock for % at %. Someone else may have just taken the last one.',
          pid, br
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists orders_take_stock_ins on public.orders;
create trigger orders_take_stock_ins
  before insert on public.orders
  for each row execute function public.orders_take_stock();


-- ------------------------------------------------------------
-- Put stock back when an order is cancelled.
--
-- Without this, every cancelled order silently loses inventory
-- and the count drifts away from the shelf until someone
-- recounts by hand.
-- ------------------------------------------------------------
create or replace function public.orders_return_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare item jsonb; pid text; qty integer; br text;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  br := coalesce(new.branch, (select id from public.branches order by id limit 1));
  if br is null then return new; end if;

  for item in select * from jsonb_array_elements(new.items)
  loop
    pid := item->>'id';
    qty := greatest(1, coalesce((item->>'qty')::int, 1));
    if pid is null then continue; end if;
    update public.product_stock
       set stock = stock + qty, updated_at = now()
     where product_id = pid and branch_id = br;
  end loop;
  return new;
end;
$$;

drop trigger if exists orders_return_stock_upd on public.orders;
create trigger orders_return_stock_upd
  before update on public.orders
  for each row execute function public.orders_return_stock();


-- ------------------------------------------------------------
-- track_order, replaced to carry the courier details.
--
-- Dropped first and not merely replaced: adding columns to the
-- RETURNS TABLE changes the signature, and CREATE OR REPLACE
-- refuses that. Without the drop this migration fails on a
-- database that already ran 011.
-- ------------------------------------------------------------
drop function if exists public.track_order(text, text);

create or replace function public.track_order(p_id text, p_phone text)
returns table (
  id text, status text, total integer, method text,
  items jsonb, created_at timestamptz, name text,
  courier text, tracking_no text, tracking_url text
)
language sql stable security definer set search_path = public as $$
  select o.id, o.status, o.total, o.method, o.items, o.created_at,
         coalesce(o.customer->>'name', ''),
         o.courier, o.tracking_no, o.tracking_url
  from public.orders o
  where lower(o.id) = lower(trim(p_id))
    and right(regexp_replace(coalesce(o.customer->>'phone',''), '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10)
    and length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 10
  limit 1;
$$;

revoke all on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- Who still needs telling.
--
-- There is no email or WhatsApp API wired up, so nothing can be
-- sent automatically. This view is the honest version of that:
-- a worklist a person clears, rather than a promise the system
-- cannot keep.
-- ------------------------------------------------------------
create or replace view public.v_orders_to_notify as
  select o.id, o.created_at, o.total, o.status, o.branch,
         o.customer->>'name'  as name,
         o.customer->>'phone' as phone,
         round(extract(epoch from (now() - o.created_at)) / 3600)::int as hours_waiting
    from public.orders o
   where o.notified_at is null
     and o.status not in ('cancelled')
   order by o.created_at;

-- ============================================================
-- After running this, confirm the race is actually closed:
--
--   1. set a product's stock to 1
--   2. insert two orders for it in two sessions
--   3. the second must fail with 'Not enough stock'
--
-- If both succeed, the trigger did not attach — check that the
-- orders being inserted carry a `branch` that exists.
-- ============================================================

-- ############################################################
-- #  13. 013-supabase-auth.sql
-- #  Moves logins from Firebase to Supabase Auth
-- ############################################################

-- ============================================================
--  TOSS SPORTS — move Maze Room logins from Firebase to Supabase Auth
--
--  Why: the Firebase → Supabase third-party token handoff failed
--  silently (tokens rejected → session degraded to anonymous →
--  every admin write refused with an opaque 403, photo uploads
--  included). Supabase Auth mints the same token RLS checks, so
--  that whole failure class is gone.
--
--  What changes in the data: staff.uid used to hold Firebase UIDs;
--  from now on it holds Supabase Auth user UUIDs. claim_staff()
--  already binds by email on first sign-in, so clearing the old
--  UIDs is the whole migration — each person re-binds themselves
--  the first time they log in with their Supabase account.
--
--  Safe to run any number of times.
--
--  AFTER running this, for each person who needs access:
--    Supabase Dashboard → Authentication → Users → Add user
--      · same email as their staff row
--      · a strong password (hand it over; they should change it)
--      · tick "Auto Confirm" so they can sign in immediately
--
--  The old Firebase project and the Third-Party Auth integration
--  in Supabase are no longer used and can be removed once everyone
--  has signed in successfully.
-- ============================================================

-- 1. unbind the old Firebase UIDs so email re-binding can happen
update public.staff set uid = null
where uid is not null
  and uid not in (select id::text from auth.users);

-- 2. claim_staff() must be callable by a signed-in Supabase user and
--    nobody else. (It was granted to `authenticated` for the Firebase
--    flow too, so this is a re-assertion, not a change.)
revoke all on function public.claim_staff() from public;
revoke all on function public.claim_staff() from anon;
grant execute on function public.claim_staff() to authenticated;

-- 3. prove the seeded owner row is claimable: email present, unclaimed, active
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.staff
  where role in ('owner','manager') and active and uid is null and email is not null;
  if v_n = 0 then
    raise warning 'No unclaimed owner/manager row remains — if nobody can log in as admin, '
      'insert one: insert into public.staff (name,email,role) values (''Name'',''email'',''owner'');';
  else
    raise notice '% owner/manager row(s) ready to bind on first Supabase sign-in', v_n;
  end if;
end $$;


-- ############################################################
-- #  VERIFY
-- #  Run this last. It should list every table with RLS on.
-- ############################################################

select c.relname as table_name,
       case when c.relrowsecurity then 'RLS on' else 'RLS OFF — investigate' end as security,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Expected afterwards:
--   · 21 tables, every one with "RLS on" and at least one policy
--   · 29 products, 2 coupons, 1+ branch, 1+ category
--
--   select (select count(*) from public.products)  as products,
--          (select count(*) from public.coupons)   as coupons,
--          (select count(*) from public.branches)  as branches,
--          (select count(*) from public.categories) as categories;
--
--  Then create your founder in Authentication → Users (tick Auto
--  Confirm), add the matching staff row, and sign in — claim_staff()
--  binds the two together on that first sign-in:
--
--   insert into public.staff (name, email, role)
--   values ('Your Name', 'you@example.com', 'founder');
