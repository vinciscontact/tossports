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
--  Select these two lines and run them ALONE first.
--  Anyone you still need is about to go.
-- ------------------------------------------------------------
select id, name, email, role, active, branch_id,
       case when uid is null then 'never signed in' else 'bound' end as login
from public.staff order by role, name;


-- ------------------------------------------------------------
--  STEP 2 — create the client's login FIRST, outside SQL.
--
--  Supabase Dashboard → Authentication → Users → Add user
--    · the client's real email
--    · a strong password, handed over directly
--    · tick "Auto Confirm User", or they cannot sign in
--      (this project has mailer_autoconfirm off)
--
--  Do NOT delete auth users with SQL. auth.users carries
--  identities, sessions and refresh tokens; deleting rows
--  underneath that leaves fragments the API still believes in.
--  Remove your test accounts from that same Users screen.
--
--  There is no uid to copy anywhere. claim_staff() matches on
--  email and binds the account the first time they sign in.
-- ------------------------------------------------------------


-- ============================================================
--  STEP 3 — replace the team.
--
--  Fill in the three values below, then run this block.
--
--  All of it is one DO block deliberately. Arming this with
--  session variables set by separate statements was unreliable:
--  Supabase pools connections in transaction mode, so session
--  state need not survive from one statement to the next, and the
--  guard could refuse a run that was armed correctly.
-- ============================================================

do $$
declare
  -- ▼▼▼ FILL IN ALL THREE ▼▼▼
  client_email constant text := 'REPLACE-WITH@CLIENT-EMAIL.COM';
  client_name  constant text := 'REPLACE WITH THEIR NAME';
  confirm      constant text := 'NO';   -- becomes 'YES-REPLACE-THE-TEAM'
  -- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

  n_before integer;
begin
  if confirm <> 'YES-REPLACE-THE-TEAM' then
    raise exception E'Not armed.

  Set confirm to ''YES-REPLACE-THE-TEAM'', and fill in the
  client''s real email and name above.

  This removes YOUR access — make sure their login exists first (STEP 2).';
  end if;

  -- Refusing the placeholder is the whole point of checking. An unedited
  -- run would leave the shop with a founder nobody can log in as, and no
  -- way back in to fix it.
  if client_email ilike 'REPLACE-WITH@%' or position('@' in client_email) = 0 then
    raise exception 'Put the client''s real email in first — got "%".', client_email;
  end if;
  if client_name ilike 'REPLACE %' or length(trim(client_name)) < 2 then
    raise exception 'Put the client''s real name in first.';
  end if;

  select count(*) into n_before from public.staff;

  -- Out with the test team.
  delete from public.staff;

  -- In with one founder. uid stays null on purpose: claim_staff() writes it
  -- when they first sign in, which is also the proof that the auth account
  -- and this row belong to the same person.
  insert into public.staff (name, email, role, active)
  values (trim(client_name), lower(trim(client_email)), 'founder', true);

  raise notice
    'Removed % staff row(s). % is now the only founder — they must sign in once to bind it.',
    n_before, lower(trim(client_email));
end $$;


-- ------------------------------------------------------------
--  STEP 4 — verify, and hand over.
-- ------------------------------------------------------------
select name, email, role, active,
       case when uid is null then 'binds on first sign-in' else 'bound' end as login
from public.staff;

-- Then, in the Supabase dashboard:
--   1. Authentication → Users — confirm only the client's user remains
--   2. Settings → Database → Reset database password. The publishable
--      key in js/config.js is fine to keep (RLS protects it, not
--      secrecy), but the database password was used in development.
--   3. Settings → General — transfer the project to the client's
--      organisation if they are to own it outright.
--
-- Still outstanding, unrelated to this reset:
--   · sql/013-supabase-auth.sql must have been run, or nobody can log in
--   · sql/012-fulfilment.sql is NOT safe to run until anonymous inserts
--     into public.orders are closed off — see the audit
--   · a real GSTIN before any tax invoice is issued
-- ============================================================
