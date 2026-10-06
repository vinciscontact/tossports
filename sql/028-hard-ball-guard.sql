-- ============================================================
--  TOSS SPORTS — TEACH THE GUARD ABOUT THE HARD BALL
--
--  025-complete-before-live.sql refuses to put a bat live without
--  a ball type, and its error message named the only two that
--  existed at the time: "ball must list at least one of soft or
--  medium". The 2026 catalogue adds a third — hard tennis and
--  stumper, 95g-130g — so the message was telling staff in the
--  Maze Room that a correct value was wrong.
--
--  While here, the check gets teeth it never had. The old one
--  only asked whether `ball` was a non-empty array; it would
--  happily accept ["hrad"]. Nothing else in the system validates
--  it either, so the bat would go live, appear under no ball
--  filter at all, sit out of every finder result, and look
--  perfectly fine in the Maze Room — the kind of fault nobody
--  notices until someone asks why that bat never sells.
--
--  Run after 027-catalogue-2026.sql. Safe to re-run.
-- ============================================================

create or replace function public.products_complete_before_live()
returns trigger
language plpgsql
as $$
declare
  d  jsonb := coalesce(new.data, '{}'::jsonb);
  wt jsonb := d -> 'weight';
  bl jsonb := d -> 'ball';
begin
  -- A switched-off product is a draft. Drafts may be anything.
  if not coalesce(new.active, false) then
    return new;
  end if;

  if coalesce(new.category, 'bats') = 'bats' then

    if coalesce(d ->> 'wood', '') not in ('srilankan', 'kashmir', 'poplar') then
      raise exception
        'Cannot put "%" live: wood must be srilankan, kashmir or poplar (found %).',
        new.name, coalesce(d ->> 'wood', 'nothing')
        using errcode = 'check_violation';
    end if;

    if coalesce(d ->> 'profile', '') not in
       ('standard', 'scoop', 'flat', 'bigedge', 'mongoose', 'multi') then
      raise exception
        'Cannot put "%" live: profile must be standard, scoop, flat, bigedge, mongoose or multi (found %).',
        new.name, coalesce(d ->> 'profile', 'nothing')
        using errcode = 'check_violation';
    end if;

    -- Two numbers, low and high. The shop averages them to decide whether a
    -- bat reads as light, balanced or heavy, and divides by two to do it.
    if jsonb_typeof(wt) is distinct from 'array'
       or jsonb_array_length(wt) <> 2
       or jsonb_typeof(wt -> 0) is distinct from 'number'
       or jsonb_typeof(wt -> 1) is distinct from 'number' then
      raise exception
        'Cannot put "%" live: weight must be two numbers, like [700, 780] (found %).',
        new.name, coalesce(wt::text, 'nothing')
        using errcode = 'check_violation';
    end if;

    -- Which ball it is for. Drives the shop filter and the Find My Bat quiz.
    if jsonb_typeof(bl) is distinct from 'array' or jsonb_array_length(bl) = 0 then
      raise exception
        'Cannot put "%" live: ball must list at least one of soft, medium or hard, like ["soft"] (found %).',
        new.name, coalesce(bl::text, 'nothing')
        using errcode = 'check_violation';
    end if;

    -- And it has to be one we actually recognise. A typo here fails silently
    -- everywhere else: the bat appears under no ball filter, never surfaces
    -- in the finder, and looks correct in the Maze Room.
    if exists (select 1 from jsonb_array_elements_text(bl) b
                where b not in ('soft', 'medium', 'hard')) then
      raise exception
        'Cannot put "%" live: ball may only contain soft, medium or hard (found %).',
        new.name, bl::text
        using errcode = 'check_violation';
    end if;

  else
    -- Only bats have generated artwork. Everything else needs a real photo
    -- or it reaches the shop as an empty frame.
    if coalesce(array_length(new.images, 1), 0) = 0 then
      raise exception
        'Cannot put "%" live: products outside Bats need at least one photo.',
        new.name
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================
--  VERIFY
-- ============================================================
--
--  A bad ball type is refused (expect check_violation):
--
--    update public.products
--       set data = jsonb_set(data, '{ball}', '["hrad"]')
--     where id = 'black-mamba';
--
--  A good one still passes:
--
--    update public.products
--       set data = jsonb_set(data, '{ball}', '["hard"]')
--     where id = 'black-mamba';
-- ============================================================
