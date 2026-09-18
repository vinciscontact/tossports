-- ============================================================
--  TOSS SPORTS — THE 2026 CATALOGUE
--
--  Replaces the whole bat range with the 31 bats in the printed
--  TOSS Bat Catalogue, and teaches the database the two things
--  that catalogue knows which the old one did not:
--
--    · a third ball type — hard tennis / stumper, 95g-130g
--    · level and style per bat, in the catalogue's own words
--
--  GENERATED, NOT HAND-WRITTEN
--  ---------------------------
--  Every row below came out of js/products.js, which is the
--  bundled catalogue the shop falls back to when Supabase is
--  unreachable. Generating one from the other is what stops the
--  offline catalogue and the live one drifting apart — the failure
--  mode being a shopper who loses their connection and is quietly
--  shown different prices. Regenerate, never edit by hand.
--
--  THE OLD RANGE IS SWITCHED OFF, NOT DELETED
--  ------------------------------------------
--  Deactivating is reversible and deleting is not, and there is a
--  real order in the table referencing the old catalogue. Hidden
--  rows cost nothing and cannot be bought. Purge them separately
--  once the new range has traded for a while.
--
--  Run after 026-payment-verification.sql. Safe to re-run.
-- ============================================================

begin;

-- ---------- 1. the catalogue's player vocabulary ----------
-- 'style' already exists as a group and is reused; its MEMBERS change,
-- because the catalogue says Attacker / Classic / Quick Hands where the
-- site used to say Attacker / All-rounder / Defender / Beginner. 'level'
-- is new. 'weight' is left exactly as it was.
insert into public.playstyle_groups (id, name, hint, sort) values
  ('level',  'Level',       'How far along the player is. Every bat has exactly one.', 0),
  ('style',  'Best for',    'How the player bats. A bat can suit more than one.',      1),
  ('weight', 'Weight feel', 'How the bat picks up, judged against its own ball type.', 2)
on conflict (id) do update
  set name = excluded.name, hint = excluded.hint, sort = excluded.sort;

-- The old 'style' members are retired rather than dropped: a retired style
-- keeps its rows and its landing-page slug working, and anything already
-- linked to it simply stops being offered as a filter.
update public.playstyles set active = false
 where id in ('all-rounder', 'defender')
    or (group_id = 'style' and id not in ('attacker', 'classic', 'quick-hands'));

-- 'beginner' moves from being a batting style to being a level. Same id,
-- same slug, so any indexed /cricket-bats-for-beginners page keeps working.
insert into public.playstyles (id, group_id, name, tagline, sort, active) values
  ('beginner', 'level', 'Beginner', 'Your first proper bat', 0, true),
  ('serious', 'level', 'Serious', 'You play every week and it shows', 1, true),
  ('tournament', 'level', 'Tournament', 'Built for the weekend that counts', 2, true),
  ('attacker', 'style', 'Attacker', 'Bottom weight, low-mid sweet spot', 0, true),
  ('classic', 'style', 'Classic', 'Even balance, mid sweet spot', 1, true),
  ('quick-hands', 'style', 'Quick Hands', 'Top-light, mid-high sweet spot', 2, true)
on conflict (id) do update
  set group_id = excluded.group_id,
      name     = excluded.name,
      tagline  = excluded.tagline,
      sort     = excluded.sort,
      active   = true;

-- ---------- 2. the 31 bats ----------
-- Upsert rather than delete-and-insert: 'cws' already exists under the same
-- name, and deleting it would cascade away its stock row and its tags for
-- no reason.
insert into public.products (id, name, category, price, mrp, tier, sort, images, data) values
  ('regular-srilankan', 'Regular Srilankan', 'bats', 950, null, 'entry', 10, array[]::text[], '{"tagline":"The one everybody starts with","wood":"srilankan","profile":"standard","ball":["soft"],"level":"beginner","style":["quick-hands"],"weight":[650,750],"height":[34.5,35.5],"handle":"Single wood handle","sweetSpot":"Mid to high","finish":"Raw bat","spine":true,"edge":"Standard","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Soft tennis ball cricket — street, gully and practice","features":["Sri Lankan wood in a raw, unfinished build","Light 650–750g pickup for quick hands","Lightweight and easy to handle — ideal for beginners","The most affordable bat in the Toss range"]}'::jsonb),
  ('regular-upgraded', 'Regular Upgraded', 'bats', 1300, null, 'entry', 20, array[]::text[], '{"tagline":"Same easy bat, finished properly","wood":"srilankan","profile":"standard","ball":["soft"],"level":"beginner","style":["quick-hands"],"weight":[650,750],"height":[34.5,35],"handle":"Single wood handle","sweetSpot":"Mid to high","finish":"Finished","spine":true,"edge":"Standard","popularity":78,"rating":0,"reviews":0,"badges":["Value"],"usage":"Soft tennis ball cricket","features":["Upgraded look with better durability","Sri Lankan wood, single piece","Light 650–750g pickup for quick hands","Beginner friendly at an affordable price"]}'::jsonb),
  ('srilankan-prime', 'Srilankan Prime', 'bats', 1200, null, 'entry', 30, array[]::text[], '{"tagline":"Best value pick in the range","wood":"srilankan","profile":"standard","ball":["soft"],"level":"beginner","style":["classic"],"weight":[650,850],"height":[35,36],"handle":"Single wood handle","sweetSpot":"Mid","finish":"Raw bat","spine":true,"edge":"Standard","popularity":70,"rating":0,"reviews":0,"badges":[],"usage":"Soft tennis ball cricket","features":["Best value pick — better durability for the money","Reliable performance at affordable pricing","Even balance with a mid sweet spot","Sri Lankan wood, raw finish"]}'::jsonb),
  ('double-wood-pressed', 'Double Wood Pressed', 'bats', 1650, null, 'mid', 40, array[]::text[], '{"tagline":"Two blades pressed into one","wood":"srilankan","profile":"multi","ball":["soft"],"level":"beginner","style":["classic"],"weight":[650,850],"height":[35,36],"handle":"Single wood handle","sweetSpot":"Mid","finish":"Raw bat","spine":true,"edge":"Standard","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Soft tennis ball cricket","features":["Double-wood pressed build for added strength and durability","Noticeably tougher than a single-piece blade","Even balance with a mid sweet spot","Sri Lankan wood, raw finish"]}'::jsonb),
  ('srilankan-pro', 'Srilankan PRO', 'bats', 1650, null, 'mid', 50, array['https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/varnished-bat/1787638467779-1-md.webp', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/varnished-bat/1787638484726-2-md.webp', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/varnished-bat/1787638487277-3-md.webp', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/varnished-bat/1787638697389-4-md.webp'], '{"tagline":"Smooth varnish, easy to play","wood":"srilankan","profile":"standard","ball":["soft"],"level":"serious","style":["quick-hands","attacker"],"weight":[650,850],"height":[35,36],"handle":"Single wood handle","sweetSpot":"Mid to high","finish":"Smooth varnished","spine":true,"edge":"Standard","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Value"],"usage":"Soft tennis ball cricket, local tournaments","features":["Smooth varnished finish with a balanced, easy-playing profile","Varnish protects the blade against moisture","Suits quick hands and attacking players alike","Sri Lankan wood, single piece"]}'::jsonb),
  ('alpha-bat', 'Alpha Bat', 'bats', 1250, null, 'entry', 60, array[]::text[], '{"tagline":"Flat face, solid and balanced","wood":"kashmir","profile":"flat","ball":["soft"],"level":"serious","style":["classic"],"weight":[730,900],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":false,"edge":"Standard","popularity":70,"rating":0,"reviews":0,"badges":[],"usage":"Soft tennis ball cricket","features":["Flat-profile Kashmir Willow bat","Solid and balanced feel through the shot","Full flat face gives a large hitting area","Even balance with a mid sweet spot"]}'::jsonb),
  ('alpha-bat-lite', 'Alpha Bat Lite', 'bats', 900, null, 'entry', 70, array[]::text[], '{"tagline":"The affordable flat bat","wood":"poplar","profile":"flat","ball":["soft"],"level":"beginner","style":["classic"],"weight":[730,900],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":false,"edge":"Standard","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Soft tennis ball cricket — street and practice","features":["Affordable flat bat with an easy-to-handle profile","Poplar wood keeps the price down","Built for beginners still finding their shots","Even balance with a mid sweet spot"]}'::jsonb),
  ('customised-scoop-lite', 'Customised Scoop Lite', 'bats', 2150, null, 'mid', 80, array[]::text[], '{"tagline":"Scooped back, serious feel","wood":"srilankan","profile":"scoop","ball":["soft"],"level":"serious","style":["quick-hands","classic"],"weight":[650,750],"height":[35,36],"handle":"Single wood handle","sweetSpot":"Mid to high","finish":"Standard","spine":true,"edge":"Good edge","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Soft tennis ball cricket, street cricket, local matches","features":["Scoop design for more balance with a serious playing feel","Wood removed from the back holds the pickup at 650–750g","Big hitting area for the weight","Sri Lankan wood, single piece"]}'::jsonb),
  ('mongoose-feather', 'Mongoose Feather', 'bats', 1900, null, 'mid', 90, array[]::text[], '{"tagline":"Short blade, long handle, no mercy","wood":"srilankan","profile":"mongoose","ball":["soft"],"level":"serious","style":["attacker"],"weight":[650,800],"height":[35,36],"handle":"Extended mongoose handle","sweetSpot":"Low to mid","finish":"Standard","spine":true,"edge":"Standard","popularity":82,"rating":0,"reviews":0,"badges":["Exclusive"],"usage":"Soft tennis ball cricket, aggressive hitting","features":["Mongoose profile for aggressive play","Short blade and long handle for maximum bat speed","Bottom weight with a low-mid sweet spot","Sri Lankan wood, single piece"]}'::jsonb),
  ('power-x-feather', 'Power X Feather', 'bats', 3000, null, 'premium', 100, array['https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031833763-power-x.jpeg', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031834022-side.png', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031834469-v2.png', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031851542-front.png'], '{"tagline":"The lightest bat we make","wood":"srilankan","profile":"standard","ball":["soft"],"level":"tournament","style":["quick-hands"],"weight":[650,700],"height":[35,36],"handle":"Science-induced handle guard","sweetSpot":"Mid to high","finish":"Hand crafted","spine":true,"edge":"Standard","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Must Try"],"usage":"Tournament soft tennis ball cricket","features":["Ultra-light tournament bat built for speed and quick shots","The narrowest weight band in the range — 650–700g","Top-light balance with a mid-high sweet spot","Part of the Toss Power X tournament family"]}'::jsonb),
  ('power-x-mercury', 'Power X Mercury', 'bats', 3000, null, 'premium', 110, array['https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031833763-power-x.jpeg', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031834022-side.png', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031834469-v2.png', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031851542-front.png'], '{"tagline":"Fast hands, controlled power","wood":"srilankan","profile":"standard","ball":["soft"],"level":"tournament","style":["attacker"],"weight":[700,770],"height":[35,36],"handle":"Science-induced handle guard","sweetSpot":"Low to mid","finish":"Hand crafted","spine":true,"edge":"Standard","popularity":84,"rating":0,"reviews":0,"badges":["Must Try"],"usage":"Tournament soft tennis ball cricket","features":["Lightweight tournament bat designed for fast and controlled stroke play","Bottom weight with a low-mid sweet spot","Sits between the Feather and the Sixit in the Power X family","Hand crafted Sri Lankan wood"]}'::jsonb),
  ('ys-big-edge', 'YS Big Edge', 'bats', 2300, null, 'premium', 120, array[]::text[], '{"tagline":"Thick edges, balanced weight","wood":"srilankan","profile":"bigedge","ball":["medium"],"level":"serious","style":["classic"],"weight":[700,830],"height":[34.5,34.5],"handle":"Single wood handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Big edge","popularity":82,"rating":0,"reviews":0,"badges":["Exclusive"],"usage":"Medium tennis ball cricket","features":["Big-edge profile offering a powerful hitting area with balanced weight","Thick edges without the weight penalty","Even balance with a mid sweet spot","Sri Lankan wood, single piece"]}'::jsonb),
  ('cws', 'CWS', 'bats', 2200, null, 'mid', 130, array[]::text[], '{"tagline":"Hybrid build, tournament punch","wood":"srilankan","profile":"standard","ball":["medium"],"level":"tournament","style":["attacker"],"weight":[800,900],"height":[35,36],"handle":"Hybrid Indian handle","sweetSpot":"Low to mid","finish":"Standard","spine":true,"edge":"Standard","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Must Try"],"usage":"Medium tennis ball cricket, tournaments","features":["Hybrid Indian handle with Sri Lankan albizia blade","Combines strength with a powerful hitting profile","Built to last a full tournament season","Bottom weight with a low-mid sweet spot"]}'::jsonb),
  ('power-x-sixit', 'Power X Sixit', 'bats', 3000, null, 'premium', 140, array['https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031833763-power-x.jpeg', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031834022-side.png', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031834469-v2.png', 'https://rbrokxstbzewdjdfhiwk.supabase.co/storage/v1/object/public/products/power-x/1787031851542-front.png'], '{"tagline":"Built for one thing — six","wood":"srilankan","profile":"bigedge","ball":["medium"],"level":"tournament","style":["attacker"],"weight":[800,850],"height":[35,36],"handle":"Science-induced handle guard","sweetSpot":"Low to mid","finish":"Hand crafted","spine":true,"edge":"Big edge","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Must Try"],"usage":"Tournament medium tennis ball cricket","features":["Tournament-ready build designed for powerful six-hitting","The heaviest bat in the Power X family","Bottom weight with a low-mid sweet spot","Hand crafted Sri Lankan wood"]}'::jsonb),
  ('customized-scoop', 'Customized Scoop', 'bats', 2400, null, 'premium', 150, array[]::text[], '{"tagline":"Power, balance and looks","wood":"srilankan","profile":"scoop","ball":["medium"],"level":"tournament","style":["classic","attacker"],"weight":[800,900],"height":[35,36],"handle":"Hybrid Indian handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Good edge","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Medium tennis ball cricket, tournaments","features":["Customized scoop profile offering power with improved balance and looks","Hybrid handle construction for strength","Suits classic and attacking players alike","Sri Lankan wood"]}'::jsonb),
  ('kerala-scoop', 'Kerala Scoop', 'bats', 2250, null, 'premium', 160, array[]::text[], '{"tagline":"Tournament-level scoop","wood":"kashmir","profile":"scoop","ball":["medium"],"level":"tournament","style":["classic"],"weight":[770,900],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Standard","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Tournament medium tennis ball cricket","features":["Powerful Kerala scoop design built for tournament-level play","Kashmir Willow blade","Scooped back keeps the weight down for the size","Even balance with a mid sweet spot"]}'::jsonb),
  ('kerala-scoop-lite', 'Kerala Scoop Lite', 'bats', 1800, null, 'mid', 170, array[]::text[], '{"tagline":"The affordable Kerala scoop","wood":"poplar","profile":"scoop","ball":["medium"],"level":"serious","style":["classic"],"weight":[770,900],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Standard","popularity":70,"rating":0,"reviews":0,"badges":[],"usage":"Medium tennis ball cricket","features":["Affordable Kerala scoop profile offering easy handling","Lighter build than the full Kerala Scoop","Poplar wood keeps the price down","Even balance with a mid sweet spot"]}'::jsonb),
  ('glossy-premium', 'Glossy Premium', 'bats', 2500, null, 'premium', 180, array[]::text[], '{"tagline":"Premium finish, medium-weight power","wood":"kashmir","profile":"standard","ball":["medium"],"level":"tournament","style":["classic","attacker"],"weight":[800,900],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Premium glossy","spine":true,"edge":"Standard","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Must Try"],"usage":"Tournament medium tennis ball cricket","features":["Premium glossy finish with a powerful medium-weight profile","Kashmir Willow blade","Suits classic and attacking players alike","Gloss coat protects against moisture"]}'::jsonb),
  ('four-scoop', 'Four Scoop', 'bats', 1850, null, 'mid', 190, array[]::text[], '{"tagline":"Less weight, same hitting profile","wood":"kashmir","profile":"scoop","ball":["medium"],"level":"serious","style":["classic"],"weight":[770,900],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Standard","popularity":78,"rating":0,"reviews":0,"badges":["Value"],"usage":"Medium tennis ball cricket","features":["Scoop design reduces weight while maintaining a strong hitting profile","Four-scoop back for a lighter pickup","Kashmir Willow blade","Even balance with a mid sweet spot"]}'::jsonb),
  ('four-scoop-lite', 'Four Scoop Lite', 'bats', 1500, null, 'mid', 200, array[]::text[], '{"tagline":"Entry-level scoop","wood":"poplar","profile":"scoop","ball":["medium"],"level":"beginner","style":["classic"],"weight":[770,900],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Standard","popularity":70,"rating":0,"reviews":0,"badges":[],"usage":"Medium tennis ball cricket","features":["Lightweight scoop profile offering easy handling","Entry-level price for a medium-ball bat","Poplar wood build","Even balance with a mid sweet spot"]}'::jsonb),
  ('mongoose-pro', 'Mongoose PRO', 'bats', 2200, null, 'mid', 210, array[]::text[], '{"tagline":"Strong handle, aggressive intent","wood":"srilankan","profile":"mongoose","ball":["medium"],"level":"serious","style":["attacker"],"weight":[800,900],"height":[35,36],"handle":"Extended mongoose handle","sweetSpot":"Low to mid","finish":"Standard","spine":true,"edge":"Standard","popularity":82,"rating":0,"reviews":0,"badges":["Exclusive"],"usage":"Medium tennis ball cricket, aggressive hitting","features":["Mongoose-style profile with a strong handle for aggressive play","Short blade and long handle for bat speed","Bottom weight with a low-mid sweet spot","Sri Lankan wood, single piece"]}'::jsonb),
  ('hard-scoop', 'Hard Scoop', 'bats', 1350, null, 'entry', 220, array[]::text[], '{"tagline":"Hard-ball power at an accessible price","wood":"poplar","profile":"scoop","ball":["hard"],"level":"beginner","style":["quick-hands"],"weight":[950,1050],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid to high","finish":"Standard","spine":true,"edge":"Standard","popularity":70,"rating":0,"reviews":0,"badges":[],"usage":"Hard tennis and stumper ball cricket","features":["Solid hard-scoop profile offering power at an accessible price","The cheapest way into hard-ball cricket","Scooped back keeps the pickup manageable","Poplar wood build"]}'::jsonb),
  ('hard-scoop-plus', 'Hard Scoop PLUS', 'bats', 1550, null, 'mid', 230, array[]::text[], '{"tagline":"Heavier, stronger, more aggressive","wood":"poplar","profile":"scoop","ball":["hard"],"level":"beginner","style":["classic"],"weight":[950,1050],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Standard","popularity":70,"rating":0,"reviews":0,"badges":[],"usage":"Hard tennis and stumper ball cricket","features":["Heavy hard-scoop bat designed for strong and aggressive play","More blade behind the ball than the standard Hard Scoop","Even balance with a mid sweet spot","Poplar wood build"]}'::jsonb),
  ('hard-scoop-pro', 'Hard Scoop PRO', 'bats', 1800, null, 'mid', 240, array[]::text[], '{"tagline":"Kashmir Willow, serious level","wood":"kashmir","profile":"scoop","ball":["hard"],"level":"serious","style":["classic"],"weight":[950,1050],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Standard","spine":true,"edge":"Standard","popularity":70,"rating":0,"reviews":0,"badges":[],"usage":"Hard tennis and stumper ball cricket","features":["Strong Kashmir Willow scoop profile for serious players","A step up in timber from the Poplar hard scoops","Even balance with a mid sweet spot","Built to take repeated hard-ball impact"]}'::jsonb),
  ('hard-scoop-elite', 'Hard Scoop ELITE', 'bats', 2250, null, 'premium', 250, array[]::text[], '{"tagline":"Tournament-level hard-ball power","wood":"kashmir","profile":"scoop","ball":["hard"],"level":"tournament","style":["attacker","classic"],"weight":[950,1050],"height":[35,36],"handle":"Standard handle","sweetSpot":"Low to mid","finish":"Standard","spine":true,"edge":"Standard","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Tournament hard tennis and stumper ball cricket","features":["Kashmir Willow hard-scoop bat built for tournament-level power","The top of the Hard Scoop line","Suits attacking and classic players alike","Scooped back keeps the swing quick for the weight"]}'::jsonb),
  ('mri-srilankan', 'MRI Srilankan', 'bats', 1800, null, 'mid', 260, array[]::text[], '{"tagline":"Raw Sri Lankan, serious hitting","wood":"srilankan","profile":"standard","ball":["hard"],"level":"serious","style":["classic"],"weight":[950,1050],"height":[35,36],"handle":"Single wood handle","sweetSpot":"Mid","finish":"Raw bat","spine":true,"edge":"Standard","popularity":88,"rating":0,"reviews":0,"badges":["Best Seller"],"usage":"Hard tennis and stumper ball cricket","features":["Raw Sri Lankan hard bat designed for serious-level hitting","No finish — all timber, nothing hidden","Even balance with a mid sweet spot","Dense Sri Lankan grain for hard-ball impact"]}'::jsonb),
  ('glossy-premium-hard', 'Glossy Premium Hard', 'bats', 2850, null, 'premium', 270, array[]::text[], '{"tagline":"Heavy, glossy, tournament-ready","wood":"kashmir","profile":"standard","ball":["hard"],"level":"tournament","style":["classic","attacker"],"weight":[950,1050],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Premium glossy","spine":true,"edge":"Standard","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Must Try"],"usage":"Tournament hard tennis and stumper ball cricket","features":["Premium glossy aesthetic finish with a heavy, powerful tournament profile","Kashmir Willow blade","Suits classic and attacking players alike","Gloss coat protects against moisture"]}'::jsonb),
  ('black-mamba', 'Black Mamba', 'bats', 2300, null, 'premium', 280, array[]::text[], '{"tagline":"Unmistakable, and it hits","wood":"kashmir","profile":"standard","ball":["hard"],"level":"tournament","style":["attacker"],"weight":[950,1100],"height":[35,36],"handle":"Standard handle","sweetSpot":"Low to mid","finish":"Standard","spine":true,"edge":"Standard","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Exclusive"],"usage":"Tournament hard tennis and stumper ball cricket","features":["Unique Kashmir Willow bat built for powerful hard-hitting","Bottom weight with a low-mid sweet spot","Goes up to 1100g for maximum power transfer","A Toss exclusive you will not find elsewhere"]}'::jsonb),
  ('graphix-premium-hard', 'Graphix Premium Hard', 'bats', 4000, null, 'premium', 290, array[]::text[], '{"tagline":"The loudest bat in the unit","wood":"kashmir","profile":"standard","ball":["hard"],"level":"tournament","style":["classic","attacker"],"weight":[950,1100],"height":[35,36],"handle":"Standard handle","sweetSpot":"Mid","finish":"Graphic print, striking finish","spine":true,"edge":"Standard","popularity":82,"rating":0,"reviews":0,"badges":["Exclusive"],"usage":"Tournament hard tennis and stumper ball cricket","features":["Premium high-end build with a crazy graphic aesthetic","Striking finish — the most distinctive bat we make","Kashmir Willow blade up to 1100g","Suits classic and attacking players alike"]}'::jsonb),
  ('srilankan-hard-monster', 'Srilankan Hard Monster (SHT)', 'bats', 2350, null, 'premium', 300, array[]::text[], '{"tagline":"Toss exclusive. Heavy duty.","wood":"srilankan","profile":"standard","ball":["hard"],"level":"tournament","style":["attacker"],"weight":[950,1100],"height":[35,36],"handle":"Single wood handle","sweetSpot":"Low to mid","finish":"Standard","spine":true,"edge":"Standard","popularity":94,"rating":0,"reviews":0,"badges":["Best Seller","Must Try","Toss Exclusive"],"usage":"Tournament hard tennis and stumper ball cricket","features":["Toss exclusive heavy-duty hard tennis bat","Built for aggressive tournament play","Bottom weight with a low-mid sweet spot","Goes up to 1100g of dense Sri Lankan wood"]}'::jsonb),
  ('mongoose-core', 'Mongoose CORE', 'bats', 2200, null, 'mid', 310, array[]::text[], '{"tagline":"The lightest hard-ball bat we make","wood":"kashmir","profile":"mongoose","ball":["hard"],"level":"serious","style":["attacker"],"weight":[850,950],"height":[35,36],"handle":"Extended mongoose handle","sweetSpot":"Low to mid","finish":"Standard","spine":true,"edge":"Standard","popularity":82,"rating":0,"reviews":0,"badges":["Exclusive"],"usage":"Hard tennis and stumper ball cricket, aggressive hitting","features":["Mongoose-style profile with a strong handle for aggressive play","At 850–950g the lightest bat in the hard-ball range","Short blade and long handle for bat speed","Kashmir Willow blade"]}'::jsonb)
on conflict (id) do update
  set name     = excluded.name,
      category = excluded.category,
      price    = excluded.price,
      mrp      = excluded.mrp,
      tier     = excluded.tier,
      sort     = excluded.sort,
      -- Photos the owner has uploaded since are not thrown away by a re-run;
      -- the generated list only fills an empty gallery.
      images   = case when coalesce(array_length(public.products.images, 1), 0) > 0
                      then public.products.images else excluded.images end,
      data     = excluded.data,
      active   = true;

-- ---------- 3. retire everything outside the new range ----------
update public.products
   set active = false
 where category = 'bats'
   and id not in ('regular-srilankan', 'regular-upgraded', 'srilankan-prime', 'double-wood-pressed', 'srilankan-pro', 'alpha-bat', 'alpha-bat-lite', 'customised-scoop-lite', 'mongoose-feather', 'power-x-feather', 'power-x-mercury', 'ys-big-edge', 'cws', 'power-x-sixit', 'customized-scoop', 'kerala-scoop', 'kerala-scoop-lite', 'glossy-premium', 'four-scoop', 'four-scoop-lite', 'mongoose-pro', 'hard-scoop', 'hard-scoop-plus', 'hard-scoop-pro', 'hard-scoop-elite', 'mri-srilankan', 'glossy-premium-hard', 'black-mamba', 'graphix-premium-hard', 'srilankan-hard-monster', 'mongoose-core');

-- ---------- 4. tag every bat ----------
-- auto = false: these are not suggestions from a rules engine, they are what
-- the printed catalogue says. suggest_playstyles() only clears auto rows, so
-- running it later cannot overwrite the catalogue.
delete from public.product_playstyles
 where product_id in ('regular-srilankan', 'regular-upgraded', 'srilankan-prime', 'double-wood-pressed', 'srilankan-pro', 'alpha-bat', 'alpha-bat-lite', 'customised-scoop-lite', 'mongoose-feather', 'power-x-feather', 'power-x-mercury', 'ys-big-edge', 'cws', 'power-x-sixit', 'customized-scoop', 'kerala-scoop', 'kerala-scoop-lite', 'glossy-premium', 'four-scoop', 'four-scoop-lite', 'mongoose-pro', 'hard-scoop', 'hard-scoop-plus', 'hard-scoop-pro', 'hard-scoop-elite', 'mri-srilankan', 'glossy-premium-hard', 'black-mamba', 'graphix-premium-hard', 'srilankan-hard-monster', 'mongoose-core');

insert into public.product_playstyles (product_id, playstyle_id, auto) values
  ('regular-srilankan', 'beginner', false),
  ('regular-srilankan', 'quick-hands', false),
  ('regular-srilankan', 'light', false),
  ('regular-upgraded', 'beginner', false),
  ('regular-upgraded', 'quick-hands', false),
  ('regular-upgraded', 'light', false),
  ('srilankan-prime', 'beginner', false),
  ('srilankan-prime', 'classic', false),
  ('srilankan-prime', 'medium', false),
  ('double-wood-pressed', 'beginner', false),
  ('double-wood-pressed', 'classic', false),
  ('double-wood-pressed', 'medium', false),
  ('srilankan-pro', 'serious', false),
  ('srilankan-pro', 'quick-hands', false),
  ('srilankan-pro', 'attacker', false),
  ('srilankan-pro', 'medium', false),
  ('alpha-bat', 'serious', false),
  ('alpha-bat', 'classic', false),
  ('alpha-bat', 'heavy', false),
  ('alpha-bat-lite', 'beginner', false),
  ('alpha-bat-lite', 'classic', false),
  ('alpha-bat-lite', 'heavy', false),
  ('customised-scoop-lite', 'serious', false),
  ('customised-scoop-lite', 'quick-hands', false),
  ('customised-scoop-lite', 'classic', false),
  ('customised-scoop-lite', 'light', false),
  ('mongoose-feather', 'serious', false),
  ('mongoose-feather', 'attacker', false),
  ('mongoose-feather', 'light', false),
  ('power-x-feather', 'tournament', false),
  ('power-x-feather', 'quick-hands', false),
  ('power-x-feather', 'light', false),
  ('power-x-mercury', 'tournament', false),
  ('power-x-mercury', 'attacker', false),
  ('power-x-mercury', 'medium', false),
  ('ys-big-edge', 'serious', false),
  ('ys-big-edge', 'classic', false),
  ('ys-big-edge', 'light', false),
  ('cws', 'tournament', false),
  ('cws', 'attacker', false),
  ('cws', 'heavy', false),
  ('power-x-sixit', 'tournament', false),
  ('power-x-sixit', 'attacker', false),
  ('power-x-sixit', 'medium', false),
  ('customized-scoop', 'tournament', false),
  ('customized-scoop', 'classic', false),
  ('customized-scoop', 'attacker', false),
  ('customized-scoop', 'heavy', false),
  ('kerala-scoop', 'tournament', false),
  ('kerala-scoop', 'classic', false),
  ('kerala-scoop', 'medium', false),
  ('kerala-scoop-lite', 'serious', false),
  ('kerala-scoop-lite', 'classic', false),
  ('kerala-scoop-lite', 'medium', false),
  ('glossy-premium', 'tournament', false),
  ('glossy-premium', 'classic', false),
  ('glossy-premium', 'attacker', false),
  ('glossy-premium', 'heavy', false),
  ('four-scoop', 'serious', false),
  ('four-scoop', 'classic', false),
  ('four-scoop', 'medium', false),
  ('four-scoop-lite', 'beginner', false),
  ('four-scoop-lite', 'classic', false),
  ('four-scoop-lite', 'medium', false),
  ('mongoose-pro', 'serious', false),
  ('mongoose-pro', 'attacker', false),
  ('mongoose-pro', 'heavy', false),
  ('hard-scoop', 'beginner', false),
  ('hard-scoop', 'quick-hands', false),
  ('hard-scoop', 'medium', false),
  ('hard-scoop-plus', 'beginner', false),
  ('hard-scoop-plus', 'classic', false),
  ('hard-scoop-plus', 'medium', false),
  ('hard-scoop-pro', 'serious', false),
  ('hard-scoop-pro', 'classic', false),
  ('hard-scoop-pro', 'medium', false),
  ('hard-scoop-elite', 'tournament', false),
  ('hard-scoop-elite', 'attacker', false),
  ('hard-scoop-elite', 'classic', false),
  ('hard-scoop-elite', 'medium', false),
  ('mri-srilankan', 'serious', false),
  ('mri-srilankan', 'classic', false),
  ('mri-srilankan', 'medium', false),
  ('glossy-premium-hard', 'tournament', false),
  ('glossy-premium-hard', 'classic', false),
  ('glossy-premium-hard', 'attacker', false),
  ('glossy-premium-hard', 'medium', false),
  ('black-mamba', 'tournament', false),
  ('black-mamba', 'attacker', false),
  ('black-mamba', 'heavy', false),
  ('graphix-premium-hard', 'tournament', false),
  ('graphix-premium-hard', 'classic', false),
  ('graphix-premium-hard', 'attacker', false),
  ('graphix-premium-hard', 'heavy', false),
  ('srilankan-hard-monster', 'tournament', false),
  ('srilankan-hard-monster', 'attacker', false),
  ('srilankan-hard-monster', 'heavy', false),
  ('mongoose-core', 'serious', false),
  ('mongoose-core', 'attacker', false),
  ('mongoose-core', 'light', false)
on conflict (product_id, playstyle_id) do update set auto = false;

commit;

-- ============================================================
--  VERIFY
-- ============================================================
--
--  31 live bats, in three ball ranges:
--
--    select data->'ball'->>0 as ball, count(*)
--      from public.products where category='bats' and active
--     group by 1 order by 1;          -- hard 10, medium 10, soft 11
--
--  Nothing from the old range still showing:
--
--    select count(*) from public.products
--     where category='bats' and active
--       and id not in (…the 31 ids above…);   -- 0
--
--  Every live bat carries a level, a style and a weight feel:
--
--    select p.id from public.products p
--     where p.category='bats' and p.active
--       and (select count(*) from public.product_playstyles pp
--             where pp.product_id = p.id) < 3;                   -- no rows
--
--  Stock is untouched and still zero — that is the remaining blocker
--  on actually selling anything:
--
--    select coalesce(sum(stock),0) from public.product_stock;
-- ============================================================
