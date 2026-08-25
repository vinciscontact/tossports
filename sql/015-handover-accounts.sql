-- ============================================================
--  TOSS SPORTS — HANDOVER, PART 2: the people
--
--  ⚠  THIS REMOVES YOUR OWN ACCESS. Every policy in the database
--     answers to public.staff. Empty that table and the Maze Room
--     will let you sign in and then show you nothing, because
--     my_role() returns null and every read is refused.
--
--     Run it LAST, and only once the client's own login exists.
--
--  Run 014-handover-reset.sql BEFORE this one. Afterwards you may
--  no longer have the access to run it.
-- ============================================================


-- ------------------------------------------------------------
--  STEP 1 — who is on the list right now?
--  Run this alone first. Anyone you still need is about to go.
-- ------------------------------------------------------------
select id, name, email, role, active, branch_id,
       case when uid is null then 'never signed in' else 'bound' end as login
from public.staff
order by role, name;


-- ------------------------------------------------------------
--  STEP 2 — create the client's login FIRST, outside SQL.
--
--  Supabase Dashboard → Authentication → Users → Add user
--    · the client's real email
--    · a strong password, handed over directly
--    · tick "Auto Confirm User", or they cannot sign in
--      (this project has mailer_autoconfirm off)
--
--  Do NOT delete auth users with SQL. auth.users is Supabase's
--  own table with identities, sessions and refresh tokens hanging
--  off it; deleting rows underneath that leaves fragments its API
--  still believes in. Remove your test accounts from the same
--  Authentication → Users screen, using the row menu.
--
--  There is no uid to copy anywhere. claim_staff() matches on
--  email and binds the account the first time they sign in.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
--  STEP 3 — put the client's email in, then arm it.
-- ------------------------------------------------------------
set toss.client_email = 'REPLACE-WITH@CLIENT-EMAIL.COM';
set toss.client_name  = 'REPLACE WITH THEIR NAME';
set toss.confirm_accounts = 'NO';
-- Change to 'YES-REPLACE-THE-TEAM' when the login above exists.


begin;

do $$
declare
  v_email text := coalesce(current_setting('toss.client_email', true), '');
  v_name  text := coalesce(current_setting('toss.client_name',  true), '');
begin
  if coalesce(current_setting('toss.confirm_accounts', true), 'NO') <> 'YES-REPLACE-THE-TEAM' then
    raise exception 'Not armed. See STEP 3.';
  end if;

  -- Refusing the placeholder is the whole point of checking. An unedited
  -- run would otherwise leave the shop with a founder nobody can log in as,
  -- and no way back in to fix it.
  if v_email = '' or v_email ilike 'REPLACE-WITH@%' or position('@' in v_email) = 0 then
    raise exception 'Put the client''s real email in STEP 3 first — got "%".', v_email;
  end if;
  if v_name = '' or v_name ilike 'REPLACE %' then
    raise exception 'Put the client''s real name in STEP 3 first.';
  end if;

  -- Out with the test team.
  delete from public.staff;

  -- In with one founder. uid stays null on purpose: claim_staff() writes it
  -- when they first sign in, which is also the proof that the auth account
  -- and this row belong to the same person.
  insert into public.staff (name, email, role, active)
  values (v_name, lower(v_email), 'founder', true);

  raise notice 'Team replaced. % is now the only founder. They must sign in once to bind it.', v_email;
end $$;

commit;


-- ------------------------------------------------------------
--  STEP 4 — verify, and hand over.
-- ------------------------------------------------------------
select name, email, role, active,
       case when uid is null then 'binds on first sign-in' else 'bound' end as login
from public.staff;

-- Then, in the Supabase dashboard:
--   1. Authentication → Users — confirm only the client's user remains
--   2. Settings → API — the publishable key in js/config.js is fine to
--      keep; it is protected by RLS, not by secrecy. Rotate the DATABASE
--      PASSWORD though (Settings → Database → Reset database password),
--      because it has been used during development.
--   3. Settings → General — transfer the project to the client's
--      organisation if they are to own it outright.
--
-- Still outstanding for the client, unrelated to this reset:
--   · sql/013-supabase-auth.sql must have been run, or nobody can log in
--   · sql/012-fulfilment.sql is NOT safe to run until anonymous inserts
--     into public.orders are closed off — see the audit
--   · a real GSTIN before any tax invoice is issued
-- ============================================================
