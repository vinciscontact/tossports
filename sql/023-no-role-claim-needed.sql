-- ============================================================
--  TOSS SPORTS — CUSTOMER ACCOUNTS WITHOUT THE ROLE CLAIM
--
--  Supabase's Firebase integration tells you to stamp
--  role='authenticated' onto every token with a blocking Cloud
--  Function. That needs Identity Platform and the Blaze plan —
--  a billing account, for two lines of JavaScript.
--
--  It is avoidable, because of one detail in how PostgREST works:
--
--      The ROLE comes from the `role` claim.
--      The CLAIMS come from the verified token, either way.
--
--  PostgREST verifies the Firebase signature (that is what the
--  Third Party Auth integration does), then sets
--  request.jwt.claims from it — and only afterwards decides which
--  Postgres role to run as. With no `role` claim it falls back to
--  `anon`, but auth.jwt() still returns the real, verified claims.
--
--  So `auth.jwt() ->> 'sub'` is the customer's Firebase UID
--  whether they arrive as `authenticated` or as `anon`. Every
--  policy written in 022 already works. Two things were in the
--  way, and only one of them was real:
--
--    · the POLICIES name no role, so they default to PUBLIC and
--      already covered anon. Nothing to do.
--
--    · the FUNCTIONS were granted to `authenticated` only. That
--      is the actual blocker, and this file fixes it.
--
--  ─────────────────────────────────────────────────────────────
--  IS THIS SAFE? Yes, and not by accident.
--
--  Nothing is being opened up. Access was never decided by the
--  role — it is decided by comparing a row's user_id against the
--  `sub` of a cryptographically verified token:
--
--    · a real anonymous visitor has no token, so auth.jwt() is
--      null, so `sub` is null, so user_id = null is false and no
--      row matches. They see nothing.
--
--    · both functions below already refuse a null `sub` on their
--      first line — claim_orders raises, link_my_history returns
--      zero — so granting them to anon hands an anonymous caller
--      an error, not data.
--
--    · a forged token fails signature verification long before
--      any of this, in PostgREST.
--
--  What you give up is defence in depth: if some future migration
--  writes a policy that relies on the role rather than on the
--  claim, it will not protect customers. Worth deploying the
--  blocking functions later; not worth a billing account today.
--
--  Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
--  The one change: let a token-bearing caller run these even
--  when Postgres has resolved them to `anon`.
--
--  `to anon, authenticated` rather than `to public`: public would
--  include every future role, including any service role added
--  later, which is broader than the need.
-- ------------------------------------------------------------
grant execute on function public.link_my_history()          to anon, authenticated;
grant execute on function public.claim_orders(text, text)   to anon, authenticated;

-- track_order() has always been callable by anon — it is the
-- no-account order lookup — and is listed here only so the whole
-- customer-facing surface is visible in one place.
grant execute on function public.track_order(text, text)    to anon, authenticated;


-- ------------------------------------------------------------
--  Customers must be able to write their own profile.
--
--  The policies from 022 permit it; a table-level grant is what
--  makes the permission reachable. Supabase grants these to both
--  roles by default on tables created through the dashboard, but
--  customer_profiles was created by a migration, so it is stated
--  explicitly rather than assumed.
--
--  RLS still decides WHICH rows. A grant without a matching
--  policy gets you nothing — cp_own_read, cp_own_insert and
--  cp_own_update all compare user_id to the token's `sub`.
-- ------------------------------------------------------------
grant select, insert, update on public.customer_profiles to anon, authenticated;

-- Read-only for orders and requests. There is deliberately no
-- insert or update here: an order is written by the storefront
-- through its own anonymous-insert policy and priced by the
-- server, and nothing about signing in should let somebody edit
-- one afterwards.
grant select on public.orders   to anon, authenticated;
grant select on public.requests to anon, authenticated;


-- ============================================================
--  VERIFY
--
--  Signed in on the site, with the browser console open:
--
--    await supaRpc('link_my_history', {})
--
--  A number back — even 0 — means this worked. "permission
--  denied for function link_my_history" means it did not.
--
--  And from the SQL editor, to see what a customer's token
--  actually carries:
--
--    select auth.jwt() ->> 'sub'          as firebase_uid,
--           auth.jwt() ->> 'role'         as role_claim,
--           auth.jwt() ->> 'phone_number' as verified_phone;
--
--  role_claim being null is now FINE. sub being null is not —
--  that means the token is not reaching the database at all.
-- ============================================================
