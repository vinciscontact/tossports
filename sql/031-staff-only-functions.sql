-- 031 — staff-only guards found in the authentication review (2026-09-22)
--
-- 1. next_invoice_no was callable by anyone with the public key. Each call
--    bumps the GST invoice counter, so a stranger could burn numbers and leave
--    gaps in a series the law expects to be consecutive. Only the Maze Room
--    (maze-bill.js) calls it, so it now requires an active staff login.
-- 2. data_health exposed internal counts (orders, staff, unbilled orders) to
--    anyone. Only the Maze Room dashboard calls it. Staff only.
-- 3. claim_staff binds a login to a staff row by the token's email. Customer
--    tokens come from Firebase, where email/password sign-up does NOT verify
--    the address. Today those tokens resolve to `anon` and cannot call it, but
--    one custom claim later a stranger could register a staff email there and
--    take the seat. It now accepts only tokens issued by this project's own
--    Supabase Auth, which confirms the email before a login works.

create or replace function public.next_invoice_no(p_branch text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_fy text; v_n integer; v_prefix text; v_branch text; v_code text;
begin
  if public.my_staff_id() is null then
    raise exception 'Only signed-in staff can raise invoice numbers' using errcode = '42501';
  end if;

  v_fy := public.current_fy();
  v_branch := coalesce(p_branch, public.my_branch(), public.default_branch());

  insert into public.invoice_counters (fy, branch_id, n) values (v_fy, v_branch, 1)
    on conflict (fy, branch_id) do update set n = public.invoice_counters.n + 1
    returning n into v_n;

  select coalesce(value #>> '{}', 'TOSS') into v_prefix
    from public.settings where key = 'invoice_prefix';
  select code into v_code from public.branches where id = v_branch;

  return coalesce(v_prefix,'TOSS')
       || case when (select count(*) from public.branches where active) > 1
               then '/' || coalesce(v_code,'A') else '' end
       || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end;
$$;

-- the original query, unchanged, behind a staff check
alter function public.data_health() rename to data_health_rows;
revoke all on function public.data_health_rows() from public, anon, authenticated;

create function public.data_health()
returns table(severity text, area text, detail text, count bigint)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.my_staff_id() is null then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return query select * from public.data_health_rows();
end;
$$;

create or replace function public.claim_staff()
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_uid text := auth.jwt() ->> 'sub';
        v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
        v_id uuid;
begin
  if v_uid is null or v_uid = '' then return null; end if;

  -- already bound: nothing to do
  select id into v_id from public.staff where uid = v_uid;
  if found then return v_id; end if;

  -- Only a Maze Room login (this project's Supabase Auth, email confirmed)
  -- may claim a seat — never a customer token from Firebase.
  if coalesce(auth.jwt() ->> 'iss', '') not like 'https://%.supabase.co/auth/v1' then
    return null;
  end if;
  if v_email = '' then return null; end if;

  -- claim an UNCLAIMED row whose email matches. uid is null is the important
  -- guard: an existing person's record can never be taken over by a second login.
  update public.staff set uid = v_uid
   where lower(email) = v_email and uid is null and active
   returning id into v_id;
  return v_id;
end;
$$;

-- staff are always `authenticated`; nobody signed out needs these
revoke execute on function public.next_invoice_no(text) from public, anon;
revoke execute on function public.data_health()        from public, anon;
grant  execute on function public.next_invoice_no(text) to authenticated;
grant  execute on function public.data_health()        to authenticated;
