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
  -- Announcement marquee: { on, items }. Edited in Maze Room → Settings.
  ('announcement',    '{"on":true,"items":["Handcrafted in our own unit — not resold","Free shipping over ₹1,500","Order on WhatsApp — 9176995707"]}'::jsonb),
  -- Engraving add-on: { enabled, price, maxChars }. Fonts/positions live in code.
  ('engraving',       '{"enabled":true,"price":199,"maxChars":18}'::jsonb)
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
