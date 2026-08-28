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
