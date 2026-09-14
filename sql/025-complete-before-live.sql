-- ============================================================
-- 025 — NOTHING HALF-FINISHED GOES LIVE
-- Run once in: Supabase → SQL editor.
--
-- A bat was created here with its spec blob left empty. It went
-- straight to the storefront, where the grid read p.weight[0] off
-- nothing and threw in the middle of building itself — so the shop
-- stopped rendering, the filters vanished with it, and a search
-- result pointing at that bat opened a blank page. One row, and the
-- catalogue was gone.
--
-- The storefront no longer trusts a product to be complete, and the
-- Maze Room asks for a wood before it lets a bat go live. Both are
-- worth having. Neither is the real guarantee, because both are
-- JavaScript: a script, a migration, psql, or a future screen that
-- nobody has written yet can still put a broken row in this table.
--
-- This is the guarantee. A product may be as unfinished as you like
-- while it is switched off — that is what a draft IS — but the
-- moment active is true it has to be something the shop can draw.
--
-- Deliberately NOT required: price. A bat with no price is a real
-- state here, meaning "ask us", and the storefront handles it by
-- sending the customer to WhatsApp. Absence of a price is a
-- decision; absence of a wood is an accident.
--
-- Checked against the live catalogue before writing: all 29 live
-- products satisfy this already, so nothing in the shop becomes
-- uneditable the moment it is installed.
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
        'Cannot put "%" live: ball must list at least one of soft or medium, like ["soft"] (found %).',
        new.name, coalesce(bl::text, 'nothing')
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

drop trigger if exists products_complete_before_live on public.products;
create trigger products_complete_before_live
  before insert or update on public.products
  for each row execute function public.products_complete_before_live();

-- Proof it changed nothing that is already selling: this must return no rows.
select id, name, data ->> 'wood' as wood, data ->> 'profile' as profile,
       data -> 'weight' as weight, data -> 'ball' as ball
  from public.products
 where active
   and category = 'bats'
   and (coalesce(data ->> 'wood', '') not in ('srilankan', 'kashmir', 'poplar')
     or jsonb_typeof(data -> 'weight') is distinct from 'array');
