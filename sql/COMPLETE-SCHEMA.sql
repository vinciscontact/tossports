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
--  Built 2026-08-31 from 20 migrations.
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
-- #  14. 016-security-fixes.sql
-- #  Order id format, server-side pricing, private request photos
-- ############################################################

-- ============================================================
--  TOSS SPORTS — SECURITY FIXES
--
--  Closes the findings from the August 2026 application security
--  review. Run after 015-handover-accounts.sql. Safe to re-run.
--
--  Three things change:
--
--    1. An order id can no longer be arbitrary text. It was a
--       free-text primary key that anyone could choose, and the
--       Maze Room printed it into an HTML attribute — so a
--       stranger could put script into the staff panel and read
--       the session token out of it.
--
--    2. The browser no longer decides what an order costs or
--       whether it was paid. `orders` accepted anonymous inserts
--       with no sanitising trigger — the one `requests` and
--       `product_questions` have both had all along — so a
--       crafted POST produced a paid-looking ₹1 order.
--
--    3. Customer photos and videos stop being public. The
--       `requests` bucket was readable AND LISTABLE by anyone.
--
--  ⚠ Item 3 requires the matching JavaScript change (js/services.js
--    and js/maze-ops.js in the same commit). Running this file
--    without shipping that code leaves the Requests screen unable
--    to show photos. Deploy both together.
-- ============================================================


-- ============================================================
--  1. ORDER IDS ARE NOT A FREE TEXT FIELD
--
--  The storefront generates TOSS-K3M9QA-427 and the Maze Room
--  generates TS-M1KX9P. Both fit comfortably. Anything carrying a
--  quote, an angle bracket or a space does not, which is the
--  point.
--
--  NOT VALID on purpose: it enforces on every new row from now
--  on, without failing this migration on whatever test data
--  happens to be sitting in the table already. To check the
--  existing rows and promote it later:
--
--    select id from public.orders where id !~ '^[A-Za-z0-9._-]{4,40}$';
--    alter table public.orders validate constraint orders_id_ck;
-- ============================================================

alter table public.orders drop constraint if exists orders_id_ck;
alter table public.orders add constraint orders_id_ck
  check (id ~ '^[A-Za-z0-9._-]{4,40}$') not valid;


-- ============================================================
--  2. THE DATABASE PRICES THE ORDER, NOT THE BROWSER
--
--  `orders_public_insert` grants a whole row on insert; RLS
--  cannot withhold eight columns. So a trigger resets them, the
--  same way requests_sanitise does for the service forms.
--
--  Staff-logged sales pass straight through. A counter sale, a
--  WhatsApp order and a wholesale deal are all priced by a person
--  who can see the bat, and re-pricing those from the catalogue
--  would overwrite a real negotiated number with a wrong one.
--  my_role() is null for anonymous callers and non-null for
--  anyone on the staff list, which is exactly the line.
-- ============================================================

-- The engraving surcharge has to live where the trigger can read it.
-- It was only in js/config.js, which is not a place the database can
-- see, and an engraved bat costs more than a plain one.
insert into public.settings (key, value)
values ('engraving_price', '199'::jsonb)
on conflict (key) do nothing;

create or replace function public.orders_sanitise()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it      jsonb;
  v_sub   integer := 0;
  v_qty   integer;
  v_price integer;
  v_eng   integer;
  v_disc  integer := 0;
  v_free  integer;
  v_fee   integer;
  v_cp    record;
begin
  -- Staff keep the numbers they typed. Only anonymous web orders are
  -- recomputed, because only those were priced by a browser.
  if public.my_role() is not null then
    return new;
  end if;

  -- Columns a customer must never set for themselves. `paid` is the
  -- important one: nothing about a Razorpay checkout that happens
  -- entirely in the customer's browser proves money moved, so the
  -- claim is recorded as unpaid and a person confirms it against the
  -- Razorpay dashboard before the bat is posted.
  new.status     := 'new';
  new.paid       := false;
  new.channel    := 'web';
  new.staff_id   := null;
  new.payment_id := null;
  new.created_at := now();

  select coalesce((value #>> '{}')::int, 199) into v_eng
    from public.settings where key = 'engraving_price';
  v_eng := coalesce(v_eng, 199);

  for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    -- coalesce, not a raise: a "price on request" bat has price null and
    -- the storefront sends those to WhatsApp rather than the cart, so this
    -- is belt and braces. It lands at zero and staff price it by hand
    -- rather than the whole order being refused.
    select coalesce(p.price, 0) into v_price
      from public.products p
     where p.id = it->>'id' and p.active;

    if not found then
      raise exception 'Unknown or inactive product in order: %', it->>'id'
        using errcode = 'check_violation';
    end if;

    -- Matches cartSubtotal() in js/app.js: engraving is per bat, so it
    -- multiplies with quantity exactly like the bat does.
    v_qty := greatest(1, least(20, coalesce((it->>'qty')::int, 1)));
    if coalesce(it->>'engrave', '') <> '' then
      v_price := v_price + v_eng;
    end if;
    v_sub := v_sub + v_price * v_qty;
  end loop;

  -- The coupon is re-checked here even though the storefront already
  -- called validate_coupon: that call happened in a browser, and its
  -- answer arrived back through one.
  if new.coupon is not null then
    select * into v_cp from public.validate_coupon(new.coupon, v_sub);
    v_disc := case when v_cp.valid then coalesce(v_cp.discount, 0) else 0 end;
    if v_disc = 0 then new.coupon := null; end if;
  end if;

  select coalesce((value #>> '{}')::int, 1500) into v_free
    from public.settings where key = 'free_ship_over';
  select coalesce((value #>> '{}')::int, 99) into v_fee
    from public.settings where key = 'ship_fee';

  new.subtotal := v_sub;
  new.discount := least(v_disc, v_sub);        -- a discount never exceeds the goods
  new.shipping := case
                    when v_sub = 0 or v_sub >= coalesce(v_free, 1500) then 0
                    else coalesce(v_fee, 99)
                  end;
  new.total    := greatest(0, new.subtotal - new.discount + new.shipping);
  return new;
end;
$$;

-- Name matters. BEFORE ROW triggers fire in alphabetical order, and
-- 'orders_sanitise_ins' sorts before 'orders_take_stock_ins', so the
-- items are validated before stock is taken against them.
drop trigger if exists orders_sanitise_ins on public.orders;
create trigger orders_sanitise_ins
  before insert on public.orders
  for each row execute function public.orders_sanitise();


-- ============================================================
--  3. REQUEST PHOTOS ARE PRIVATE
--
--  The bucket was created public with
--    for select using (bucket_id = 'requests')
--  and a comment reasoning that the URLs are unguessable. They
--  did not have to be guessed: a select grant on storage.objects
--  is precisely what the storage LIST endpoint checks, so
--
--    POST /storage/v1/object/list/requests  {"prefix":""}
--
--  handed any anonymous caller the name of every file. The bucket
--  holds bat-doctor photos, trade-in photos and the customer
--  videos the consent box is asked about — pictures of
--  identifiable people.
--
--  It is private now, staff read it through signed URLs, and the
--  upload policy no longer accepts arbitrary files at arbitrary
--  paths.
-- ============================================================

update storage.buckets
   set public             = false,
       file_size_limit    = 26214400,      -- 25 MB, so the video service still fits
       allowed_mime_types = array['image/webp','image/jpeg','image/png',
                                  'video/mp4','video/quicktime','video/webm']
 where id = 'requests';

drop policy if exists requests_read on storage.objects;
create policy requests_read on storage.objects for select
  using (bucket_id = 'requests' and public.is_admin());

-- Submitters are anonymous by nature — these are public forms — so the
-- write stays open, but only into the six folders the service forms use
-- and only for file types a photo or a video actually has. Without this
-- the bucket is an open drop box on the shop's own domain.
drop policy if exists requests_upload on storage.objects;
create policy requests_upload on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'requests'
    and (storage.foldername(name))[1] in
        ('bat_doctor','custom_bat','jersey','wholesale','trade_in','video')
    and name ~* '\.(webp|jpe?g|png|mp4|mov|webm)$'
  );

-- `photos` is a text[] the submitter fills in, and requests_sanitise reset
-- everything around it but not it. A crafted POST could therefore put
-- javascript:… into an array the Maze Room renders as a link. Only storage
-- paths this project writes survive now.
create or replace function public.requests_sanitise()
returns trigger language plpgsql as $$
begin
  new.status     := 'new';
  new.quote      := null;
  new.coupon     := null;
  new.staff_note := null;
  new.created_at := now();
  new.updated_at := now();
  new.photos := coalesce((
    select array_agg(u)
      from unnest(coalesce(new.photos, '{}'::text[])) u
     where u ~ '^[a-z_]+/[A-Za-z0-9._-]+$'
  ), '{}'::text[]);
  return new;
end;
$$;

-- The trigger is recreated because the function signature is unchanged
-- but re-pointing it costs nothing and makes this file re-runnable.
drop trigger if exists requests_sanitise_ins on public.requests;
create trigger requests_sanitise_ins
  before insert on public.requests
  for each row execute function public.requests_sanitise();


-- ============================================================
--  VERIFY — run these as the anon role, not as postgres
-- ============================================================
--
--  Order ids are constrained:
--    insert into public.orders (id, customer, items, subtotal, total, method)
--    values ('x"><img src=x onerror=alert(1)>', '{}', '[]', 0, 0, 'cod');
--    -- expect: new row violates check constraint "orders_id_ck"
--
--  Totals are recomputed and paid is forced false:
--    insert into public.orders (id, customer, items, subtotal, total, paid, status, method)
--    values ('TOSS-TEST01-1', '{"name":"t","phone":"9999999999"}',
--            '[{"id":"regular-bat","qty":1}]', 1, 1, true, 'shipped', 'online');
--    select subtotal, discount, shipping, total, paid, status
--      from public.orders where id = 'TOSS-TEST01-1';
--    -- expect: 950 | 0 | 99 | 1049 | false | new     (not 1 / true / shipped)
--    delete from public.orders where id = 'TOSS-TEST01-1';   -- as an admin
--
--  Request photos cannot be listed:
--    curl -X POST 'https://<project>.supabase.co/storage/v1/object/list/requests' \
--         -H 'apikey: <anon key>' -H 'Content-Type: application/json' \
--         -d '{"prefix":"","limit":100}'
--    -- expect: []   (and the real list when called with a founder token)
--
--  A crafted photo link is dropped:
--    insert into public.requests (kind, customer, payload, photos)
--    values ('bat_doctor', '{}', '{}', array['javascript:alert(1)']);
--    select photos from public.requests order by id desc limit 1;
--    -- expect: {}
-- ============================================================

-- ############################################################
-- #  15. 017-playstyles.sql
-- #  Play-style vocabulary and product mapping
-- ############################################################

-- ============================================================
--  TOSS SPORTS — PLAY STYLES
--
--  Marketing bats by the player rather than by the timber.
--  "I'm an attacker who likes a light bat" is how a customer
--  actually thinks; "Kashmir willow, scoop profile, 750–900g"
--  is how a workshop thinks. This adds the first vocabulary
--  without removing the second.
--
--  Two groups, because they answer different questions and a
--  bat belongs in both:
--
--    Best for     — Attacker, Defender, All-rounder, Beginner
--    Weight feel  — Light, Medium, Heavy
--
--  WHY THIS IS NOT `categories`
--  ----------------------------
--  `categories` is what a product IS — a bat, a ball — and a
--  product has exactly one. A play style is who a product is
--  FOR, and a bat has several: the Toss Power X is an attacker's
--  bat AND can be made light AND can be made heavy. Bolting a
--  second meaning onto products.category would have forced a
--  choice between them and broken the shop's category chips.
--  Hence a join table.
--
--  WEIGHT IS A RANGE, NOT A NUMBER
--  -------------------------------
--  Every bat is cut to the weight the customer asks for, so
--  "Light" cannot mean "this bat weighs 700g". It means "this
--  model sits light in the hand" — the Regular Bat centres on
--  700g, the Flat Kashmir on 875g, and that gap is real.
--
--  The first version of these rules tagged on the ends of the
--  range and produced a Medium chip matching all 29 bats, because
--  every range overlaps 720–870g. Useless as a filter. They tag
--  on the MIDPOINT now, in three bands that do not overlap, so
--  each chip returns a different third of the catalogue:
--  7 light, 12 medium, 10 heavy.
--
--  Run after 016-security-fixes.sql. Safe to re-run.
-- ============================================================


-- ---------- the two groups ----------
create table if not exists public.playstyle_groups (
  id    text primary key,          -- 'style' | 'weight'
  name  text not null,             -- what the shop prints above the chips
  hint  text,                      -- one line of help in the Maze Room
  sort  integer not null default 0
);

insert into public.playstyle_groups (id, name, hint, sort) values
  ('style',  'Best for',    'How the player bats. A bat can suit more than one.', 0),
  ('weight', 'Weight feel', 'Which weights this model can be cut to.',            1)
on conflict (id) do update
  set name = excluded.name, hint = excluded.hint, sort = excluded.sort;


-- ---------- the styles themselves ----------
-- `id` doubles as the URL slug: /cricket-bats-for-attackers uses it, and so
-- does the shop filter in the address bar. Renaming a style therefore changes
-- its display name only — the link keeps working, which matters once the SEO
-- pages are indexed.
create table if not exists public.playstyles (
  id         text primary key,
  group_id   text not null references public.playstyle_groups(id) on update cascade,
  name       text not null,
  tagline    text,                          -- the marketing line
  emoji      text,
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists playstyles_group_idx on public.playstyles (group_id, sort);

insert into public.playstyles (id, group_id, name, tagline, emoji, sort) values
  ('attacker',   'style',  'Attacker',   'Built to clear the rope',            '💥', 0),
  ('all-rounder','style',  'All-rounder','Rotate strike, then take them on',   '⚖️', 1),
  ('defender',   'style',  'Defender',   'Holds an innings together',          '🛡️', 2),
  ('beginner',   'style',  'Beginner',   'Your first proper bat',              '🌱', 3),
  ('light',      'weight', 'Light',      'Fast hands, quicker swing',          '🪶', 0),
  ('medium',     'weight', 'Medium',     'The weight most players settle on',  '🎯', 1),
  ('heavy',      'weight', 'Heavy',      'Maximum power through the ball',     '🔨', 2)
on conflict (id) do nothing;      -- never overwrite a renamed style


-- ---------- which bat is for whom ----------
-- `auto` records where the row came from. A suggestion the owner has not
-- looked at yet is auto = true; the moment they tick or untick anything on a
-- bat, that bat's rows become auto = false and re-running the suggester
-- leaves them alone. Without this flag the suggester would either be
-- single-use or would quietly undo the owner's judgement.
create table if not exists public.product_playstyles (
  product_id   text not null references public.products(id)   on delete cascade on update cascade,
  playstyle_id text not null references public.playstyles(id) on delete cascade on update cascade,
  auto         boolean not null default false,
  primary key (product_id, playstyle_id)
);

create index if not exists pps_style_idx on public.product_playstyles (playstyle_id);


-- ---------- who may read and write ----------
alter table public.playstyle_groups   enable row level security;
alter table public.playstyles         enable row level security;
alter table public.product_playstyles enable row level security;

-- The shop needs all three to render its filter chips, so read is public.
-- None of it is sensitive: it is the marketing copy itself.
drop policy if exists psg_public_read on public.playstyle_groups;
create policy psg_public_read on public.playstyle_groups for select using (true);
drop policy if exists psg_admin_write on public.playstyle_groups;
create policy psg_admin_write on public.playstyle_groups for all
  using (public.is_admin()) with check (public.is_admin());

-- Only live styles are public. A style being built out, or retired after a
-- season, should not appear on the shop while the owner decides.
drop policy if exists ps_public_read on public.playstyles;
create policy ps_public_read on public.playstyles for select using (active = true);
drop policy if exists ps_admin_read on public.playstyles;
create policy ps_admin_read on public.playstyles for select using (public.is_admin());
drop policy if exists ps_admin_write on public.playstyles;
create policy ps_admin_write on public.playstyles for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists pps_public_read on public.product_playstyles;
create policy pps_public_read on public.product_playstyles for select using (true);
drop policy if exists pps_admin_write on public.product_playstyles;
create policy pps_admin_write on public.product_playstyles for all
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================
--  THE SUGGESTER
--
--  29 bats across 7 styles is 203 yes/no decisions. Nobody is
--  going to make those by hand, and a feature that ships empty
--  looks broken. So the rules that already live in the finder
--  quiz — js/app.js scoreProduct() — are written down here once,
--  against the spec fields every bat already has.
--
--  It is a SUGGESTER, not a classifier. It writes auto = true
--  rows and never touches a row the owner has confirmed. The
--  Maze Room runs it from a button, so it can be re-run after
--  the catalogue changes.
--
--  Returns the number of suggestions written.
-- ============================================================

create or replace function public.suggest_playstyles()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only a manager or the owner can re-tag the catalogue';
  end if;

  -- Clear only what a previous run wrote. Anything the owner has touched
  -- carries auto = false and survives.
  delete from public.product_playstyles where auto;

  with bat as (
    select
      p.id,
      p.tier,
      lower(coalesce(p.data->>'profile', ''))  as profile,
      lower(coalesce(p.data->>'edge', ''))     as edge,
      lower(coalesce(p.data->>'features', '')) as features,
      -- The midpoint, not the ends. Every range overlaps 720–870g, so a rule
      -- written on the ends tags all 29 bats "Medium" and the chip becomes a
      -- synonym for "everything". The midpoint is where the model actually
      -- sits when you pick it up, which is also what the finder quiz scores
      -- against, so the two agree.
      ( nullif(p.data->'weight'->>0, '')::numeric
      + nullif(p.data->'weight'->>1, '')::numeric ) / 2 as wmid
    from public.products p
    where p.category = 'bats'
  ),
  tagged as (
    -- ----- Best for -----
    -- Thick edges, laminated blades and mongoose builds exist to hit through
    -- the line. The edge test matters as much as the profile: a scoop called
    -- "CS PRO — Scoop + Thick Edges" is an attacker's bat whatever its shape.
    select id, 'attacker'::text as playstyle_id from bat
     where profile in ('bigedge', 'multi', 'mongoose')
        or edge ~ '(thick|big|massive)'
    union
    -- The do-everything shapes. A massive edge disqualifies: that bat has
    -- committed to one job.
    select id, 'all-rounder' from bat
     where profile in ('standard', 'scoop', 'flat')
       and edge !~ 'massive'
    union
    -- A defender's bat is the controlled one: classic blade, ordinary edge,
    -- nothing exaggerated. Deliberately the narrowest rule here — in tennis
    -- ball cricket this is a small, real segment, not half the catalogue.
    select id, 'defender' from bat
     where profile = 'standard'
       and edge in ('standard', 'sleek edge', 'good edge')
    union
    -- Forgiving and affordable. Entry tier is the honest signal; the
    -- features text confirms it where the workshop has said so.
    select id, 'beginner' from bat
     where tier = 'entry'
        or features ~ 'beginner'

    -- ----- Weight feel -----
    -- Three bands that do not overlap, so each chip returns a different
    -- third of the catalogue instead of the same 29 bats.
    union
    select id, 'light'  from bat where wmid is not null and wmid <  760
    union
    select id, 'medium' from bat where wmid >= 760 and wmid < 840
    union
    select id, 'heavy'  from bat where wmid >= 840
  )
  insert into public.product_playstyles (product_id, playstyle_id, auto)
  select t.id, t.playstyle_id, true
    from tagged t
   where exists (select 1 from public.playstyles s
                  where s.id = t.playstyle_id and s.active)
  on conflict (product_id, playstyle_id) do nothing;   -- never clobber a manual row

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.suggest_playstyles() from public;
revoke all on function public.suggest_playstyles() from anon;
grant execute on function public.suggest_playstyles() to authenticated;


-- ---------- run it once so the feature is not born empty ----------
-- Wrapped because suggest_playstyles() refuses a non-admin caller, and the
-- SQL editor runs as postgres, which has no staff row. This does the same
-- work with the same rules and no permission check — appropriate for a
-- migration, not for a function the browser can reach.
do $$
declare n integer;
begin
  delete from public.product_playstyles where auto;

  with bat as (
    select p.id, p.tier,
           lower(coalesce(p.data->>'profile', ''))  as profile,
           lower(coalesce(p.data->>'edge', ''))     as edge,
           lower(coalesce(p.data->>'features', '')) as features,
           ( nullif(p.data->'weight'->>0, '')::numeric
           + nullif(p.data->'weight'->>1, '')::numeric ) / 2 as wmid
      from public.products p
     where p.category = 'bats'
  ),
  tagged as (
    select id, 'attacker'::text as playstyle_id from bat
     where profile in ('bigedge','multi','mongoose')
        or edge ~ '(thick|big|massive)'
    union select id, 'all-rounder' from bat where profile in ('standard','scoop','flat')
                                     and edge !~ 'massive'
    union select id, 'defender'    from bat where profile = 'standard'
                                     and edge in ('standard','sleek edge','good edge')
    union select id, 'beginner'    from bat where tier = 'entry' or features ~ 'beginner'
    union select id, 'light'       from bat where wmid is not null and wmid <  760
    union select id, 'medium'      from bat where wmid >= 760 and wmid < 840
    union select id, 'heavy'       from bat where wmid >= 840
  )
  insert into public.product_playstyles (product_id, playstyle_id, auto)
  select t.id, t.playstyle_id, true from tagged t
  on conflict (product_id, playstyle_id) do nothing;

  get diagnostics n = row_count;
  raise notice 'Suggested % play-style assignments across the bat catalogue.', n;
end $$;


-- ============================================================
--  VERIFY
-- ============================================================
--
--  How the catalogue landed, style by style:
--
--    select s.group_id, s.name, count(pp.product_id) as bats
--      from public.playstyles s
--      left join public.product_playstyles pp on pp.playstyle_id = s.id
--     group by s.group_id, s.name, s.sort
--     order by s.group_id, s.sort;
--
--  Any bat the rules missed entirely (should be none):
--
--    select p.id, p.name from public.products p
--     where p.category = 'bats'
--       and not exists (select 1 from public.product_playstyles pp
--                        where pp.product_id = p.id);
--
--  What a single bat was tagged as:
--
--    select s.group_id, s.name, pp.auto
--      from public.product_playstyles pp
--      join public.playstyles s on s.id = pp.playstyle_id
--     where pp.product_id = 'toss-power-x'
--     order by s.group_id, s.sort;
--
--  Anonymous callers can read the marketing data and write none of it:
--
--    select count(*) from public.playstyles;            -- 7
--    insert into public.playstyles (id, group_id, name)
--      values ('x','style','X');                        -- must be refused
-- ============================================================

-- ############################################################
-- #  16. 018-customer-accounts.sql
-- #  Customer sign-in, order history, claiming past orders
-- ############################################################

-- ============================================================
--  TOSS SPORTS — CUSTOMER ACCOUNTS
--
--  The PRD listed customer accounts as out of scope ("no demand
--  identified"). The client has since asked for them: sign in,
--  see past orders, reorder, keep addresses, follow a delivery.
--
--  Sign-in is Google, through Supabase Auth. That decision is
--  what shapes this file, because of one awkward fact:
--
--      Google gives us a verified EMAIL.
--      Every order ever placed carries only a PHONE.
--
--  js/app.js collects name, phone, address, city, pin and state
--  at checkout — never an email. So a new account cannot simply
--  be matched to its history; there is no shared column to match
--  on. Three mechanisms below close that gap, in order of how
--  much they can be trusted:
--
--    1. FROM NOW ON  — orders_stamp_user() writes the signed-in
--       user's id onto the order as it is placed. Nothing to
--       reconcile later; this is the path that matters long term.
--
--    2. SERVICE REQUESTS — `requests` does collect an email, and
--       Google has verified the one in the token, so those link
--       themselves with no help from the customer.
--
--    3. PAST ORDERS — claim_orders() below. The customer proves
--       one order is theirs and everything on that phone follows.
--
--  Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  1. WHO AN ORDER BELONGS TO
--
--  Nullable, and it must stay nullable. Most orders in this
--  business arrive over WhatsApp or across a counter and will
--  never have an account behind them; a not-null column would
--  make the storefront's anonymous checkout — the one that takes
--  most of the money — impossible.
--
--  ON DELETE SET NULL rather than CASCADE. If a customer deletes
--  their account the order does not evaporate: it is a financial
--  record the business is required to keep, and the shop still
--  has to post the bat. Only the link goes.
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.requests
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Partial: the account area only ever asks for rows that HAVE an
-- owner, and the majority of this table never will. Indexing the
-- nulls would be most of the table for no read it serves.
create index if not exists orders_user_idx
  on public.orders (user_id, created_at desc) where user_id is not null;

create index if not exists requests_user_idx
  on public.requests (user_id, created_at desc) where user_id is not null;


-- ------------------------------------------------------------
--  2. THE PROFILE
--
--  Deliberately thin. Name, phone and a list of addresses — the
--  things that make the next checkout shorter. It holds nothing
--  that is not already in an order, so a leak here costs nothing
--  a leaked order would not have cost anyway.
--
--  `addresses` is jsonb and not its own table for the same reason
--  `orders.items` is jsonb: this codebase already made that
--  choice, and a customer has three addresses, not three hundred.
--
--  No email column with a UNIQUE on it. Supabase Auth already
--  owns the email and already enforces uniqueness; a second copy
--  here would only be a second thing to keep in step.
-- ------------------------------------------------------------
create table if not exists public.customer_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  addresses  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

-- A customer may read and write exactly one row: their own. The
-- WITH CHECK is what stops the obvious attack — sending someone
-- else's user_id in the body of an insert or an update.
drop policy if exists cp_own_read on public.customer_profiles;
-- NOTE ON THE CASTS BELOW.
-- Both sides are cast to text so these policies apply whether user_id is
-- still uuid (this migration's own world) or already text (after 022 moved
-- customer identity to Firebase). Without the casts, re-running this file
-- against a converted database fails with
--     operator does not exist: text = uuid
-- which is exactly what it did, because a policy is compared with the `=`
-- operator and Postgres has no text = uuid.
create policy cp_own_read on public.customer_profiles
  for select using (user_id::text = auth.uid()::text);

drop policy if exists cp_own_insert on public.customer_profiles;
create policy cp_own_insert on public.customer_profiles
  for insert with check (user_id::text = auth.uid()::text);

drop policy if exists cp_own_update on public.customer_profiles;
create policy cp_own_update on public.customer_profiles
  for update using (user_id::text = auth.uid()::text)
           with check (user_id::text = auth.uid()::text);

-- Staff need to see a customer to help them on the phone, but
-- nobody in the Maze Room has any business editing someone's
-- saved address behind their back. Read only, on purpose.
drop policy if exists cp_admin_read on public.customer_profiles;
create policy cp_admin_read on public.customer_profiles
  for select using (public.is_admin());

create or replace function public.customer_profiles_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- user_id is the primary key and the whole basis of the policy
  -- above. Pinning it to the caller means an UPDATE that tries to
  -- move a row to another account changes nothing instead.
  new.user_id := coalesce(auth.uid(), old.user_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists customer_profiles_touch on public.customer_profiles;
create trigger customer_profiles_touch
  before update on public.customer_profiles
  for each row execute function public.customer_profiles_touch();


-- ------------------------------------------------------------
--  3. A CUSTOMER READS THEIR OWN ORDERS — AND ONLY THOSE
--
--  `orders` has been admin-read-only since schema.sql, and the
--  comment there ("a customer may place an order but may never
--  read the order book") is still right. This does not loosen it.
--  Postgres ORs multiple SELECT policies together, so this adds
--  exactly one row-shaped hole per signed-in customer: the rows
--  already stamped with their own id.
--
--  Note what is NOT here. There is no update policy and no delete
--  policy for customers. Cancelling an order is a conversation
--  with a person, not a button that rewrites a financial record.
-- ------------------------------------------------------------
drop policy if exists orders_own_read on public.orders;
create policy orders_own_read on public.orders
  for select using (user_id is not null and user_id::text = auth.uid()::text);

drop policy if exists requests_own_read on public.requests;
create policy requests_own_read on public.requests
  for select using (user_id is not null and user_id::text = auth.uid()::text);


-- ------------------------------------------------------------
--  4. STAMPING THE OWNER ON THE WAY IN
--
--  A separate trigger rather than a few lines inside
--  orders_sanitise(), because that function returns early for
--  staff (`if public.my_role() is not null then return new`) and
--  the stamp has to be decided for staff too — by NOT applying.
--
--  Why staff are excluded: a salesperson logging a walk-in sale
--  is signed in as themselves. Stamping their uid would file the
--  customer's bat under the salesperson's own order history and
--  show it to them in the account area. The customer who actually
--  bought it can still claim it later by phone, which is correct.
--
--  Postgres fires BEFORE ROW triggers in name order, so
--  `orders_sanitise_ins` (016) runs before `orders_stamp_user`.
--  That order does not matter today — the two touch different
--  columns — but it is worth knowing before a third is added.
--
--  A forged user_id in the POST body is not a concern either way:
--  orders_public_insert grants the whole row, but this trigger
--  overwrites the column afterwards, so what the browser claimed
--  never survives. The same reasoning as orders_sanitise itself.
-- ------------------------------------------------------------
create or replace function public.orders_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then
    new.user_id := auth.uid();          -- null for anonymous checkout
  else
    new.user_id := null;                -- staff-logged sale belongs to nobody yet
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_user on public.orders;
create trigger orders_stamp_user
  before insert on public.orders
  for each row execute function public.orders_stamp_user();

create or replace function public.requests_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then
    new.user_id := auth.uid();
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_stamp_user on public.requests;
create trigger requests_stamp_user
  before insert on public.requests
  for each row execute function public.requests_stamp_user();


-- ------------------------------------------------------------
--  5. CLAIMING WHAT CAME BEFORE
--
--  The customer types one order number and the phone it was
--  placed with. If the pair matches a real order, every unclaimed
--  order on that phone becomes theirs.
--
--  Why a whole phone rather than the single order named: someone
--  with five past orders should not have to find five order
--  numbers, and the pair is already the proof. The exposure is
--  bounded by how hard the id is to produce — newOrderId() in
--  js/app.js is 'TOSS-' + six base-36 digits of the millisecond
--  clock + three random digits, so hitting one without having
--  been sent it means guessing an exact millisecond and then one
--  of 900. This is the same bar track_order() has enforced since
--  011; it is not a new class of access, only a larger prize
--  behind the same lock.
--
--  `and o.user_id is null` is the line that matters most. Without
--  it, a second person knowing the same phone — a shared family
--  number, a resold SIM — could pull orders out of an account
--  that already holds them. Claiming is one-way and first-come.
--
--  SECURITY DEFINER because the caller cannot see the order book
--  to check the pair for themselves; that is the entire point.
--  Granted to `authenticated` only: there is no such thing as an
--  anonymous claim, and anon already has track_order().
-- ------------------------------------------------------------
create or replace function public.claim_orders(p_id text, p_phone text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    uuid    := auth.uid();
  v_digits text    := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_proven boolean;
  v_orders integer := 0;
  v_reqs   integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in before claiming an order.' using errcode = '28000';
  end if;

  -- Ten digits, matched from the right, exactly as track_order does:
  -- somebody who typed +91 98765 43210 at checkout will type
  -- 9876543210 here and both have to land on the same order.
  if length(v_digits) < 10 then
    raise exception 'A 10-digit phone number is required.' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.orders o
     where lower(o.id) = lower(trim(coalesce(p_id, '')))
       and right(regexp_replace(coalesce(o.customer->>'phone', ''), '\D', '', 'g'), 10) = v_digits
  ) into v_proven;

  -- Deliberately indistinguishable from "that pair is wrong": a
  -- function that answered differently for a real order number
  -- with the wrong phone would confirm the order number exists.
  if not v_proven then
    return 0;
  end if;

  update public.orders o
     set user_id = v_uid
   where o.user_id is null
     and right(regexp_replace(coalesce(o.customer->>'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_orders = row_count;

  -- Service requests carry the same phone, and someone claiming
  -- their orders means the Bat Doctor repair on the same number
  -- too. Counted separately so the caller can say so.
  update public.requests r
     set user_id = v_uid
   where r.user_id is null
     and right(regexp_replace(coalesce(r.customer->>'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_reqs = row_count;

  return v_orders + v_reqs;
end;
$$;

revoke all on function public.claim_orders(text, text) from public;
grant execute on function public.claim_orders(text, text) to authenticated;


-- ------------------------------------------------------------
--  6. THE FREE HALF — LINKING BY VERIFIED EMAIL
--
--  `requests` has collected an email since 011, and the address
--  in a Google token has been verified by Google. Those two facts
--  together mean service requests need no claim step at all.
--
--  Orders now do the same. Checkout gained an OPTIONAL email
--  field alongside this migration (js/app.js), for exactly this
--  reason: an order that carries one attaches itself on sign-in,
--  and only the orders placed before that — or by someone who
--  left the field blank — need section 5's claim.
--
--  Matching on a Google-verified address is safe in a way that
--  matching on a typed phone number would not be. The customer
--  cannot type someone else's address into their own token; they
--  can type anyone's phone into a form. That asymmetry is why
--  this one is automatic and claiming is not.
--
--  Called on every sign-in. Cheap, idempotent, and it catches
--  somebody who checks out and signs in a minute later.
-- ------------------------------------------------------------
drop function if exists public.link_my_requests();

create or replace function public.link_my_history()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_orders integer := 0;
  v_reqs   integer := 0;
begin
  if v_uid is null or v_email = '' then
    return 0;
  end if;

  update public.orders o
     set user_id = v_uid
   where o.user_id is null
     and lower(trim(coalesce(o.customer ->> 'email', ''))) = v_email;
  get diagnostics v_orders = row_count;

  update public.requests r
     set user_id = v_uid
   where r.user_id is null
     and lower(trim(coalesce(r.customer ->> 'email', ''))) = v_email;
  get diagnostics v_reqs = row_count;

  return v_orders + v_reqs;
end;
$$;

revoke all on function public.link_my_history() from public;
grant execute on function public.link_my_history() to authenticated;

-- Orders are matched by email on every sign-in, so the lookup gets
-- an index rather than a sequential scan of the whole order book.
-- Partial, because only unclaimed rows are ever searched.
create index if not exists orders_email_idx
  on public.orders (lower(customer ->> 'email')) where user_id is null;


-- ============================================================
--  VERIFY
--
--  As a signed-in CUSTOMER (not staff), all four must hold:
--
--    -- 1. sees only their own orders, never the book
--    select count(*) from public.orders;
--
--    -- 2. cannot read anybody's profile but their own
--    select count(*) from public.customer_profiles;
--
--    -- 3. is not staff and never became staff
--    select public.my_role(), public.is_admin();   -- null, false
--
--    -- 4. cannot take an order that already has an owner
--    select public.claim_orders('<someone-elses-id>', '<their phone>');
--         -- 0 once that order is claimed, whatever the pair
-- ============================================================

-- ############################################################
-- #  17. 019-corporate-and-warranty.sql
-- #  Corporate requests, and the paid extended warranty
-- ############################################################

-- ============================================================
--  TOSS SPORTS — CORPORATE ORDERS + EXTENDED WARRANTY
--
--  Two things the client asked for after 018:
--
--    1. Corporate and gifting enquiries, as a seventh service.
--       `requests.kind` is constrained to a fixed list, so a new
--       service is a migration and not just a form.
--
--    2. An extended warranty sold per bat at checkout — ₹100 for
--       3 months, ₹200 for 6.
--
--  The warranty is the half that matters here. orders_sanitise()
--  recomputes every anonymous order from the catalogue and IGNORES
--  what the browser claimed the total was (see 016). A priced
--  add-on the function does not know about is therefore an add-on
--  the customer is never charged for: the line would be accepted,
--  the warranty recorded, and the money silently dropped. So the
--  function has to be taught the plan prices at the same time the
--  checkout learns to sell them.
--
--  Prices live in `settings`, not in this file, so the owner can
--  change them in the Maze Room without a developer — the same
--  arrangement engraving_price already uses.
--
--  Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  1. CORPORATE IS A VALID REQUEST KIND
--
--  Dropped and re-added rather than altered: a check constraint
--  cannot be widened in place, and re-running the old definition
--  after this file would silently narrow it again.
-- ------------------------------------------------------------
alter table public.requests drop constraint if exists requests_kind_ck;
alter table public.requests add constraint requests_kind_ck
  check (kind in ('bat_doctor','custom_bat','jersey','wholesale',
                  'trade_in','video','corporate'));


-- ------------------------------------------------------------
--  2. WARRANTY PRICES
--
--  `on conflict do nothing` so re-running never resets a price the
--  owner has since changed in the Maze Room. That is the whole
--  reason these are rows rather than constants.
-- ------------------------------------------------------------
insert into public.settings (key, value) values
  ('warranty_3_price', '100'::jsonb),
  ('warranty_6_price', '200'::jsonb)
on conflict (key) do nothing;


-- ------------------------------------------------------------
--  3. THE SERVER PRICES THE WARRANTY
--
--  A full redefinition of orders_sanitise() from 016, with the
--  warranty added to the per-line price alongside engraving. Same
--  return type, so create-or-replace is enough and no drop is
--  needed.
--
--  Only two lines are genuinely new — the two lookups and the
--  `if` inside the loop — but the function has to be restated in
--  full because Postgres has no way to patch a body.
--
--  Anything other than '3' or '6' in the line adds nothing. An
--  unknown plan is treated as no warranty rather than as an error:
--  refusing the whole order because one line carried a bad string
--  would cost a sale to protect a ₹100 add-on.
-- ------------------------------------------------------------
create or replace function public.orders_sanitise()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it      jsonb;
  v_sub   integer := 0;
  v_qty   integer;
  v_price integer;
  v_eng   integer;
  v_w3    integer;
  v_w6    integer;
  v_wadd  integer;
  v_disc  integer := 0;
  v_free  integer;
  v_fee   integer;
  v_cp    record;
begin
  -- Staff keep the numbers they typed. Only anonymous web orders are
  -- recomputed, because only those were priced by a browser.
  if public.my_role() is not null then
    return new;
  end if;

  new.status     := 'new';
  new.paid       := false;
  new.channel    := 'web';
  new.staff_id   := null;
  new.payment_id := null;
  new.created_at := now();

  select coalesce((value #>> '{}')::int, 199) into v_eng
    from public.settings where key = 'engraving_price';
  v_eng := coalesce(v_eng, 199);

  select coalesce((value #>> '{}')::int, 100) into v_w3
    from public.settings where key = 'warranty_3_price';
  v_w3 := coalesce(v_w3, 100);

  select coalesce((value #>> '{}')::int, 200) into v_w6
    from public.settings where key = 'warranty_6_price';
  v_w6 := coalesce(v_w6, 200);

  for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    select coalesce(p.price, 0) into v_price
      from public.products p
     where p.id = it->>'id' and p.active;

    if not found then
      raise exception 'Unknown or inactive product in order: %', it->>'id'
        using errcode = 'check_violation';
    end if;

    v_qty := greatest(1, least(20, coalesce((it->>'qty')::int, 1)));

    if coalesce(it->>'engrave', '') <> '' then
      v_price := v_price + v_eng;
    end if;

    -- Per bat, exactly like engraving: two bats with cover cost two
    -- covers. The browser sends only the plan id; the price comes from
    -- settings here and nowhere else.
    v_wadd := case coalesce(it->>'warranty', '')
                when '3' then v_w3
                when '6' then v_w6
                else 0
              end;
    v_price := v_price + v_wadd;

    v_sub := v_sub + v_price * v_qty;
  end loop;

  if new.coupon is not null then
    select * into v_cp from public.validate_coupon(new.coupon, v_sub);
    v_disc := case when v_cp.valid then coalesce(v_cp.discount, 0) else 0 end;
    if v_disc = 0 then new.coupon := null; end if;
  end if;

  select coalesce((value #>> '{}')::int, 1500) into v_free
    from public.settings where key = 'free_ship_over';
  select coalesce((value #>> '{}')::int, 99) into v_fee
    from public.settings where key = 'ship_fee';

  new.subtotal := v_sub;
  new.discount := least(v_disc, v_sub);
  new.shipping := case
                    when v_sub = 0 or v_sub >= coalesce(v_free, 1500) then 0
                    else coalesce(v_fee, 99)
                  end;
  new.total    := greatest(0, new.subtotal - new.discount + new.shipping);
  return new;
end;
$$;

drop trigger if exists orders_sanitise_ins on public.orders;
create trigger orders_sanitise_ins
  before insert on public.orders
  for each row execute function public.orders_sanitise();


-- ============================================================
--  VERIFY
--
--    -- corporate is now accepted
--    insert into public.requests (kind, customer)
--    values ('corporate', '{"name":"Test","phone":"9000000000"}'::jsonb);
--
--    -- and the warranty is actually charged. As an ANONYMOUS
--    -- caller, insert one bat with a 6-month plan and read the
--    -- total back: it must be the bat price + 200, whatever the
--    -- browser claimed.
--    select key, value from public.settings
--     where key in ('warranty_3_price','warranty_6_price');
-- ============================================================

-- ############################################################
-- #  18. 020-coupon-kinds.sql
-- #  Game, loyalty, referral and offer codes
-- ############################################################

-- ============================================================
--  TOSS SPORTS — WHAT A CODE IS FOR
--
--  `coupons` held game rewards and nothing else, so every code
--  looked the same in the Maze Room: a value, a minimum spend and
--  an "unlocks at" figure that only means anything if the code is
--  earned by playing. Once the same table starts carrying loyalty
--  and referral codes, "unlocks at 30 runs" against a referral
--  code is noise, and there is no way to answer "how many referral
--  codes are live".
--
--  So a code now says what it is. Four kinds:
--
--    game      earned in Gully Cricket; `unlock_runs` applies
--    loyalty   handed to a returning customer
--    referral  given out to be passed on
--    offer     a campaign — festival, launch, anything timed
--
--  `referred_by` is the one extra column, and it is deliberately
--  free text rather than a foreign key to a customer: most people
--  handing out a referral code are not signed-in accounts, and a
--  phone number written on a card is the real-world case. When
--  proper referral tracking is built it can migrate from here.
--
--  Safe to re-run.
-- ============================================================

alter table public.coupons
  add column if not exists kind text not null default 'game';

alter table public.coupons
  add column if not exists referred_by text;

-- Existing rows are all game rewards, which is what the default
-- already gave them; this only matters if the column existed with
-- something else in it.
update public.coupons set kind = 'game' where kind is null;

alter table public.coupons drop constraint if exists coupons_kind_ck;
alter table public.coupons add constraint coupons_kind_ck
  check (kind in ('game','loyalty','referral','offer'));

create index if not exists coupons_kind_idx on public.coupons (kind);


-- ------------------------------------------------------------
--  The storefront must not learn anything new.
--
--  validate_coupon() is what the checkout calls, and it stays
--  exactly as it was: a code is valid because it exists, is
--  active and clears its minimum spend. What KIND it is has no
--  bearing on whether it works — that is a label for the people
--  running the shop, not a rule for the customer.
--
--  Stated here because the obvious next step is to start
--  filtering by kind in the validator, and that would break every
--  game reward already in circulation.
-- ------------------------------------------------------------


-- ============================================================
--  VERIFY
--
--    select kind, count(*) from public.coupons group by kind;
--
--    -- and the constraint holds
--    insert into public.coupons (code, discount, kind)
--    values ('BADKIND', 50, 'nonsense');   -- must fail
-- ============================================================

-- ############################################################
-- #  19. 021-order-versioning.sql
-- #  Row versions, so the Sheet sync cannot overwrite newer edits
-- ############################################################

-- ============================================================
--  TOSS SPORTS — ORDER VERSIONING
--
--  Groundwork for the Google Sheet sync, which is allowed to
--  write changes back to `orders`.
--
--  The danger with a two-way sync is not that a write fails — it
--  is that one SUCCEEDS when it should not have. Somebody opens
--  the Sheet at nine, a salesperson marks an order dispatched at
--  ten, and the Sheet — still holding the nine o'clock value —
--  pushes "new" back over it at eleven. The order silently
--  un-ships. Nothing errors, nobody is told, and the bat does not
--  go out.
--
--  `version` is what makes that impossible. Every update bumps
--  it, the Sheet records the version it last read, and its
--  write-back is filtered on that version:
--
--    PATCH /orders?id=eq.TOSS-X&version=eq.7
--
--  If anything changed in between, the row is at version 8, the
--  filter matches nothing, and PostgREST updates ZERO rows. The
--  sync sees the empty result and flags the row as a conflict
--  instead of overwriting. That is optimistic concurrency, and it
--  is the whole reason a write-back is safe to offer at all.
--
--  An integer rather than a timestamp on purpose: comparing
--  timestamptz through a URL means agreeing on microsecond
--  formatting between Postgres, PostgREST and Apps Script, and a
--  guard that silently stops matching is worse than none.
--
--  `updated_at` comes along because it is genuinely useful in the
--  Maze Room, but nothing depends on it for correctness.
--
--  Safe to re-run.
-- ============================================================

alter table public.orders
  add column if not exists version    integer     not null default 1;

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();


-- ------------------------------------------------------------
--  Bump on every update, from the database.
--
--  Not from application code: the Maze Room, the Sheet sync and
--  any future caller all have to be covered, and the only place
--  that sees all three is here. A caller that forgot would leave
--  a stale version behind and quietly disarm the guard.
--
--  `is distinct from` rather than <> so a row whose columns are
--  rewritten with identical values does not burn a version — the
--  Sheet pushing an unchanged row should not invalidate somebody
--  else's in-flight edit.
-- ------------------------------------------------------------
create or replace function public.orders_bump_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if to_jsonb(new) - 'version' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'version' - 'updated_at' then
    new.version    := coalesce(old.version, 1) + 1;
    new.updated_at := now();
  else
    new.version    := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

-- 'orders_zz_bump_version' so it sorts LAST among BEFORE UPDATE
-- triggers: it has to see the row exactly as it will be written,
-- after anything else has finished changing it.
drop trigger if exists orders_zz_bump_version on public.orders;
create trigger orders_zz_bump_version
  before update on public.orders
  for each row execute function public.orders_bump_version();

create index if not exists orders_updated_idx on public.orders (updated_at desc);


-- ============================================================
--  VERIFY
--
--    -- version climbs only on a real change
--    update public.orders set status = status where id = '<an id>';
--    select id, version from public.orders where id = '<an id>';  -- unchanged
--
--    update public.orders set status = 'packed' where id = '<an id>';
--    select id, version from public.orders where id = '<an id>';  -- +1
--
--    -- and the guard refuses a stale write
--    -- (as service_role, with the OLD version number)
--    --   PATCH /orders?id=eq.<id>&version=eq.<old>   ->  []
-- ============================================================

-- ############################################################
-- #  20. 022-firebase-customer-auth.sql
-- #  Customer identity moves to Firebase; phone links history
-- ############################################################

-- ============================================================
--  TOSS SPORTS — CUSTOMER IDENTITY MOVES TO FIREBASE
--
--  Customers sign in with Firebase (phone OTP and email and
--  password). STAFF ARE NOT TOUCHED — the Maze Room keeps using
--  Supabase Auth, so a problem on the customer side cannot lock
--  anybody out of their own admin panel. That is exactly what
--  happened the last time these two were entangled (see 013).
--
--  ─────────────────────────────────────────────────────────────
--  WHY THE COLUMNS HAVE TO CHANGE
--
--  018 built customer accounts on Supabase Auth:
--
--    user_id uuid references auth.users(id)   +   auth.uid()
--
--  A Firebase UID is a 28-character string, not a UUID, and there
--  is no auth.users row behind it. Both halves of that line are
--  therefore wrong now: the type cannot hold the value, and the
--  foreign key points at a table the user will never be in.
--
--  So user_id becomes text and the policies read the token
--  directly. This is not a new pattern in this schema — staff.uid
--  has been `text unique` matched on auth.jwt() ->> 'sub' since
--  002, from when staff were on Firebase too.
--
--  ─────────────────────────────────────────────────────────────
--  THE THING THIS BUYS: HISTORY LINKS ITSELF
--
--  Every order this shop has ever taken carries a PHONE and no
--  email. On Supabase that was the whole problem — Google gave an
--  email, orders held a phone, and nothing joined them without the
--  customer proving ownership through a claim form.
--
--  Firebase phone sign-in ends that. The token carries
--  `phone_number`, and Firebase only issues it after an OTP has
--  actually been answered on that handset. So the number in the
--  token is VERIFIED, and matching it against the phone on an
--  order is safe in a way that matching a number somebody typed
--  into a form never was.
--
--  A customer signs in with the number they ordered with, and
--  their history is simply there.
--
--  ⚠ REQUIRES, in the Supabase dashboard, and nothing works
--    without it: Authentication → Third Party Auth → add Firebase,
--    with the project id. If Firebase is not registered, Supabase
--    rejects the token and every request 401s — including ones
--    that would have succeeded anonymously. That is PRD C1, it is
--    what broke the Maze Room before, and it is the single step
--    most likely to be missed.
--
--  Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  0. THIS FILE STANDS ALONE
--
--  It used to assume 018 had just run and left uuid columns
--  behind for it to convert. That assumption breaks the moment
--  018 is re-run against a database this file has ALREADY
--  converted: 018 tries to recreate its policies as
--  `user_id = auth.uid()`, the column is text by then, and
--  Postgres refuses with
--
--      operator does not exist: text = uuid
--
--  Two migrations owning the type of one column is the actual
--  fault. So this one now creates whatever is missing as text,
--  converts whatever is uuid, and does not care which of the two
--  states it finds. 018 is no longer required ahead of it.
-- ------------------------------------------------------------
create table if not exists public.customer_profiles (
  user_id    text primary key,
  name       text,
  phone      text,
  addresses  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;

-- text, not uuid: a Firebase UID is a 28-character string. On a
-- database that already has these as uuid, section 2 converts them.
alter table public.orders   add column if not exists user_id text;
alter table public.requests add column if not exists user_id text;

-- Partial: the account area only ever asks for rows that HAVE an
-- owner, and most of this table never will.
create index if not exists orders_user_idx
  on public.orders (user_id, created_at desc) where user_id is not null;
create index if not exists requests_user_idx
  on public.requests (user_id, created_at desc) where user_id is not null;


-- ------------------------------------------------------------
--  1. DROP THE POLICIES THAT DEPEND ON THE COLUMNS
--
--  A column's type cannot change while a policy references it.
--  These are all recreated in section 3.
-- ------------------------------------------------------------
drop policy if exists orders_own_read   on public.orders;
drop policy if exists requests_own_read on public.requests;
drop policy if exists cp_own_read       on public.customer_profiles;
drop policy if exists cp_own_insert     on public.customer_profiles;
drop policy if exists cp_own_update     on public.customer_profiles;
drop policy if exists cp_admin_read     on public.customer_profiles;


-- ------------------------------------------------------------
--  2. uuid → text
--
--  The old values are Supabase user UUIDs. They are cast rather
--  than dropped so nothing is destroyed, then blanked, because a
--  Supabase UUID will never equal a Firebase UID and leaving it
--  in place would only mean a row nobody can ever read again.
--  Those customers re-link on their next sign-in — by phone
--  automatically, or through claim_orders() as before.
-- ------------------------------------------------------------
--  ⚠ The whole conversion is guarded on the column STILL BEING uuid.
--
--  Without that guard this file is not re-runnable, and this file is
--  part of COMPLETE-SCHEMA, which the setup guide tells people to run
--  whenever they are unsure. The `delete from customer_profiles` below
--  is correct exactly once — on the way across from Supabase UIDs. Run
--  unguarded a second time it would wipe every saved address in the
--  business, silently, as part of a command whose own header promises
--  it is safe to repeat.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name = 'user_id' and data_type = 'uuid'
  ) then

    alter table public.orders   drop constraint if exists orders_user_id_fkey;
    alter table public.requests drop constraint if exists requests_user_id_fkey;

    alter table public.orders
      alter column user_id type text using user_id::text;
    alter table public.requests
      alter column user_id type text using user_id::text;

    -- Old values are Supabase UUIDs. Cast rather than dropped so nothing
    -- is destroyed, then blanked, because a Supabase UUID will never
    -- equal a Firebase UID and leaving it would only mean a row nobody
    -- can read again. Those customers re-link on their next sign-in —
    -- by phone automatically, or through claim_orders().
    update public.orders   set user_id = null where user_id is not null;
    update public.requests set user_id = null where user_id is not null;

    -- customer_profiles.user_id is the primary key, so the key and the
    -- foreign key both have to come off before the type will move.
    alter table public.customer_profiles
      drop constraint if exists customer_profiles_user_id_fkey;
    alter table public.customer_profiles
      drop constraint if exists customer_profiles_pkey;

    -- Nothing in it survives the change of identity system, and a
    -- profile is a name, a phone and addresses — cheap to type again.
    delete from public.customer_profiles;

    alter table public.customer_profiles
      alter column user_id type text using user_id::text;
    alter table public.customer_profiles
      add primary key (user_id);

    raise notice 'Customer identity converted from Supabase UUIDs to Firebase UIDs.';
  else
    raise notice 'Customer identity is already text — conversion skipped.';
  end if;
end $$;


-- ------------------------------------------------------------
--  3. POLICIES, READING THE TOKEN DIRECTLY
--
--  auth.uid() casts the `sub` claim to uuid and returns null when
--  it is not one — which for a Firebase token is always. Reading
--  the claim as text is the only thing that works, and it is what
--  my_role() has always done for staff.
-- ------------------------------------------------------------
create policy orders_own_read on public.orders
  for select using (
    user_id is not null and user_id = auth.jwt() ->> 'sub'
  );

create policy requests_own_read on public.requests
  for select using (
    user_id is not null and user_id = auth.jwt() ->> 'sub'
  );

create policy cp_own_read on public.customer_profiles
  for select using (user_id = auth.jwt() ->> 'sub');

create policy cp_own_insert on public.customer_profiles
  for insert with check (user_id = auth.jwt() ->> 'sub');

create policy cp_own_update on public.customer_profiles
  for update using (user_id = auth.jwt() ->> 'sub')
           with check (user_id = auth.jwt() ->> 'sub');

-- Staff may look a customer up to help them on the phone. Still
-- read-only: nobody in the Maze Room edits somebody's saved
-- address behind their back.
create policy cp_admin_read on public.customer_profiles
  for select using (public.is_admin());


-- ------------------------------------------------------------
--  4. STAMPING THE OWNER ON THE WAY IN
-- ------------------------------------------------------------
create or replace function public.orders_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A staff-logged sale belongs to the customer, not to the
  -- salesperson who typed it. Same reasoning as 018.
  if public.my_role() is null then
    new.user_id := auth.jwt() ->> 'sub';     -- null for anonymous checkout
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.requests_stamp_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then
    new.user_id := auth.jwt() ->> 'sub';
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.customer_profiles_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.user_id := coalesce(auth.jwt() ->> 'sub', old.user_id, new.user_id);
  return new;
end;
$$;

-- The triggers themselves, not just the functions they call. 018 used to
-- create these; now that this file no longer depends on 018 having run,
-- it has to attach them itself — a redefined function with no trigger
-- pointing at it does nothing at all.
drop trigger if exists customer_profiles_touch on public.customer_profiles;
create trigger customer_profiles_touch
  before update on public.customer_profiles
  for each row execute function public.customer_profiles_touch();

drop trigger if exists orders_stamp_user on public.orders;
create trigger orders_stamp_user
  before insert on public.orders
  for each row execute function public.orders_stamp_user();

drop trigger if exists requests_stamp_user on public.requests;
create trigger requests_stamp_user
  before insert on public.requests
  for each row execute function public.requests_stamp_user();


-- ------------------------------------------------------------
--  5. LINKING HISTORY — NOW MOSTLY AUTOMATIC
--
--  Two verified claims, two ways in:
--
--    phone_number  present only after an OTP was answered on that
--                  handset, so it can be matched against the phone
--                  on an order directly
--    email         present and verified for an email sign-in
--
--  Compared on the last ten digits, exactly as track_order() has
--  since 011: somebody who typed "+91 98765 43210" at checkout and
--  signs in as "+919876543210" is the same person, and both have
--  to land on the same order.
--
--  Called on every sign-in. Cheap, idempotent, and it catches the
--  customer who orders as a guest and signs in a minute later.
-- ------------------------------------------------------------
drop function if exists public.link_my_history();

create or replace function public.link_my_history()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   text := auth.jwt() ->> 'sub';
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_phone text := right(regexp_replace(
                    coalesce(auth.jwt() ->> 'phone_number', ''), '\D', '', 'g'), 10);
  v_n     integer := 0;
  v_x     integer := 0;
begin
  if v_uid is null then return 0; end if;

  -- ---- by verified phone: the one that matters here ----
  if length(v_phone) = 10 then
    update public.orders o
       set user_id = v_uid
     where o.user_id is null
       and right(regexp_replace(coalesce(o.customer ->> 'phone', ''), '\D', '', 'g'), 10)
           = v_phone;
    get diagnostics v_x = row_count; v_n := v_n + v_x;

    update public.requests r
       set user_id = v_uid
     where r.user_id is null
       and right(regexp_replace(coalesce(r.customer ->> 'phone', ''), '\D', '', 'g'), 10)
           = v_phone;
    get diagnostics v_x = row_count; v_n := v_n + v_x;
  end if;

  -- ---- by verified email, for orders that carry one ----
  if v_email <> '' then
    update public.orders o
       set user_id = v_uid
     where o.user_id is null
       and lower(trim(coalesce(o.customer ->> 'email', ''))) = v_email;
    get diagnostics v_x = row_count; v_n := v_n + v_x;

    update public.requests r
       set user_id = v_uid
     where r.user_id is null
       and lower(trim(coalesce(r.customer ->> 'email', ''))) = v_email;
    get diagnostics v_x = row_count; v_n := v_n + v_x;
  end if;

  return v_n;
end;
$$;

revoke all on function public.link_my_history() from public;
grant execute on function public.link_my_history() to authenticated;


-- ------------------------------------------------------------
--  6. CLAIMING, FOR THE CASES PHONE CANNOT COVER
--
--  Still needed. Somebody who signs in with email but ordered
--  under a phone number has nothing for section 5 to match on,
--  and proving one order number against its phone is how they
--  get their history.
--
--  `and o.user_id is null` remains the important line: claiming
--  is one-way and first-come, so a shared or resold number cannot
--  pull orders out of an account that already holds them.
-- ------------------------------------------------------------
create or replace function public.claim_orders(p_id text, p_phone text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    text    := auth.jwt() ->> 'sub';
  v_digits text    := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_proven boolean;
  v_orders integer := 0;
  v_reqs   integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in before claiming an order.' using errcode = '28000';
  end if;
  if length(v_digits) < 10 then
    raise exception 'A 10-digit phone number is required.' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.orders o
     where lower(o.id) = lower(trim(coalesce(p_id, '')))
       and right(regexp_replace(coalesce(o.customer ->> 'phone', ''), '\D', '', 'g'), 10) = v_digits
  ) into v_proven;

  -- Deliberately indistinguishable from "that pair is wrong": an
  -- answer that differed would confirm the order number exists.
  if not v_proven then return 0; end if;

  update public.orders o
     set user_id = v_uid
   where o.user_id is null
     and right(regexp_replace(coalesce(o.customer ->> 'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_orders = row_count;

  update public.requests r
     set user_id = v_uid
   where r.user_id is null
     and right(regexp_replace(coalesce(r.customer ->> 'phone', ''), '\D', '', 'g'), 10) = v_digits;
  get diagnostics v_reqs = row_count;

  return v_orders + v_reqs;
end;
$$;

revoke all on function public.claim_orders(text, text) from public;
grant execute on function public.claim_orders(text, text) to authenticated;


-- ============================================================
--  VERIFY
--
--  As a signed-in CUSTOMER holding a FIREBASE token:
--
--    -- the token is actually being read
--    select auth.jwt() ->> 'sub'          as firebase_uid,
--           auth.jwt() ->> 'phone_number' as verified_phone,
--           auth.uid()                    as should_be_null;
--
--    -- history linked itself
--    select public.link_my_history();     -- rows joined
--    select count(*) from public.orders;  -- only their own
--
--    -- and they are not staff
--    select public.my_role(), public.is_admin();   -- null, false
--
--  If auth.jwt() returns null, Firebase is NOT registered under
--  Authentication → Third Party Auth. Fix that before anything
--  else; nothing here can work without it.
-- ============================================================


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
