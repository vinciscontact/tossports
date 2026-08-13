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
