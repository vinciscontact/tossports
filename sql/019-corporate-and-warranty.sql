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
