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
