-- ============================================================
--  TOSS SPORTS — ORDER VERSIONING
--
--  Groundwork for the Google Sheet sync, which is allowed to
--  write changes back to `orders`.
--
--  The danger with a two-way sync is not that a write fails — it
--  is that one SUCCEEDS when it should not have. Somebody opens
--  the Sheet at nine, a salesperson marks an order dispatched at
--  ten, and the Sheet — still holding the nine o'clock value —
--  pushes "new" back over it at eleven. The order silently
--  un-ships. Nothing errors, nobody is told, and the bat does not
--  go out.
--
--  `version` is what makes that impossible. Every update bumps
--  it, the Sheet records the version it last read, and its
--  write-back is filtered on that version:
--
--    PATCH /orders?id=eq.TOSS-X&version=eq.7
--
--  If anything changed in between, the row is at version 8, the
--  filter matches nothing, and PostgREST updates ZERO rows. The
--  sync sees the empty result and flags the row as a conflict
--  instead of overwriting. That is optimistic concurrency, and it
--  is the whole reason a write-back is safe to offer at all.
--
--  An integer rather than a timestamp on purpose: comparing
--  timestamptz through a URL means agreeing on microsecond
--  formatting between Postgres, PostgREST and Apps Script, and a
--  guard that silently stops matching is worse than none.
--
--  `updated_at` comes along because it is genuinely useful in the
--  Maze Room, but nothing depends on it for correctness.
--
--  Safe to re-run.
-- ============================================================

alter table public.orders
  add column if not exists version    integer     not null default 1;

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();


-- ------------------------------------------------------------
--  Bump on every update, from the database.
--
--  Not from application code: the Maze Room, the Sheet sync and
--  any future caller all have to be covered, and the only place
--  that sees all three is here. A caller that forgot would leave
--  a stale version behind and quietly disarm the guard.
--
--  `is distinct from` rather than <> so a row whose columns are
--  rewritten with identical values does not burn a version — the
--  Sheet pushing an unchanged row should not invalidate somebody
--  else's in-flight edit.
-- ------------------------------------------------------------
create or replace function public.orders_bump_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if to_jsonb(new) - 'version' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'version' - 'updated_at' then
    new.version    := coalesce(old.version, 1) + 1;
    new.updated_at := now();
  else
    new.version    := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

-- 'orders_zz_bump_version' so it sorts LAST among BEFORE UPDATE
-- triggers: it has to see the row exactly as it will be written,
-- after anything else has finished changing it.
drop trigger if exists orders_zz_bump_version on public.orders;
create trigger orders_zz_bump_version
  before update on public.orders
  for each row execute function public.orders_bump_version();

create index if not exists orders_updated_idx on public.orders (updated_at desc);


-- ============================================================
--  VERIFY
--
--    -- version climbs only on a real change
--    update public.orders set status = status where id = '<an id>';
--    select id, version from public.orders where id = '<an id>';  -- unchanged
--
--    update public.orders set status = 'packed' where id = '<an id>';
--    select id, version from public.orders where id = '<an id>';  -- +1
--
--    -- and the guard refuses a stale write
--    -- (as service_role, with the OLD version number)
--    --   PATCH /orders?id=eq.<id>&version=eq.<old>   ->  []
-- ============================================================
