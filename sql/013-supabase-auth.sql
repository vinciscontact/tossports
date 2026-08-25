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
