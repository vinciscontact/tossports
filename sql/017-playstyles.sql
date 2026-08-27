-- ============================================================
--  TOSS SPORTS — PLAY STYLES
--
--  Marketing bats by the player rather than by the timber.
--  "I'm an attacker who likes a light bat" is how a customer
--  actually thinks; "Kashmir willow, scoop profile, 750–900g"
--  is how a workshop thinks. This adds the first vocabulary
--  without removing the second.
--
--  Two groups, because they answer different questions and a
--  bat belongs in both:
--
--    Best for     — Attacker, Defender, All-rounder, Beginner
--    Weight feel  — Light, Medium, Heavy
--
--  WHY THIS IS NOT `categories`
--  ----------------------------
--  `categories` is what a product IS — a bat, a ball — and a
--  product has exactly one. A play style is who a product is
--  FOR, and a bat has several: the Toss Power X is an attacker's
--  bat AND can be made light AND can be made heavy. Bolting a
--  second meaning onto products.category would have forced a
--  choice between them and broken the shop's category chips.
--  Hence a join table.
--
--  WEIGHT IS A RANGE, NOT A NUMBER
--  -------------------------------
--  Every bat is cut to the weight the customer asks for, so
--  "Light" cannot mean "this bat weighs 700g". It means "this
--  model sits light in the hand" — the Regular Bat centres on
--  700g, the Flat Kashmir on 875g, and that gap is real.
--
--  The first version of these rules tagged on the ends of the
--  range and produced a Medium chip matching all 29 bats, because
--  every range overlaps 720–870g. Useless as a filter. They tag
--  on the MIDPOINT now, in three bands that do not overlap, so
--  each chip returns a different third of the catalogue:
--  7 light, 12 medium, 10 heavy.
--
--  Run after 016-security-fixes.sql. Safe to re-run.
-- ============================================================


-- ---------- the two groups ----------
create table if not exists public.playstyle_groups (
  id    text primary key,          -- 'style' | 'weight'
  name  text not null,             -- what the shop prints above the chips
  hint  text,                      -- one line of help in the Maze Room
  sort  integer not null default 0
);

insert into public.playstyle_groups (id, name, hint, sort) values
  ('style',  'Best for',    'How the player bats. A bat can suit more than one.', 0),
  ('weight', 'Weight feel', 'Which weights this model can be cut to.',            1)
on conflict (id) do update
  set name = excluded.name, hint = excluded.hint, sort = excluded.sort;


-- ---------- the styles themselves ----------
-- `id` doubles as the URL slug: /cricket-bats-for-attackers uses it, and so
-- does the shop filter in the address bar. Renaming a style therefore changes
-- its display name only — the link keeps working, which matters once the SEO
-- pages are indexed.
create table if not exists public.playstyles (
  id         text primary key,
  group_id   text not null references public.playstyle_groups(id) on update cascade,
  name       text not null,
  tagline    text,                          -- the marketing line
  emoji      text,
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists playstyles_group_idx on public.playstyles (group_id, sort);

insert into public.playstyles (id, group_id, name, tagline, emoji, sort) values
  ('attacker',   'style',  'Attacker',   'Built to clear the rope',            '💥', 0),
  ('all-rounder','style',  'All-rounder','Rotate strike, then take them on',   '⚖️', 1),
  ('defender',   'style',  'Defender',   'Holds an innings together',          '🛡️', 2),
  ('beginner',   'style',  'Beginner',   'Your first proper bat',              '🌱', 3),
  ('light',      'weight', 'Light',      'Fast hands, quicker swing',          '🪶', 0),
  ('medium',     'weight', 'Medium',     'The weight most players settle on',  '🎯', 1),
  ('heavy',      'weight', 'Heavy',      'Maximum power through the ball',     '🔨', 2)
on conflict (id) do nothing;      -- never overwrite a renamed style


-- ---------- which bat is for whom ----------
-- `auto` records where the row came from. A suggestion the owner has not
-- looked at yet is auto = true; the moment they tick or untick anything on a
-- bat, that bat's rows become auto = false and re-running the suggester
-- leaves them alone. Without this flag the suggester would either be
-- single-use or would quietly undo the owner's judgement.
create table if not exists public.product_playstyles (
  product_id   text not null references public.products(id)   on delete cascade on update cascade,
  playstyle_id text not null references public.playstyles(id) on delete cascade on update cascade,
  auto         boolean not null default false,
  primary key (product_id, playstyle_id)
);

create index if not exists pps_style_idx on public.product_playstyles (playstyle_id);


-- ---------- who may read and write ----------
alter table public.playstyle_groups   enable row level security;
alter table public.playstyles         enable row level security;
alter table public.product_playstyles enable row level security;

-- The shop needs all three to render its filter chips, so read is public.
-- None of it is sensitive: it is the marketing copy itself.
drop policy if exists psg_public_read on public.playstyle_groups;
create policy psg_public_read on public.playstyle_groups for select using (true);
drop policy if exists psg_admin_write on public.playstyle_groups;
create policy psg_admin_write on public.playstyle_groups for all
  using (public.is_admin()) with check (public.is_admin());

-- Only live styles are public. A style being built out, or retired after a
-- season, should not appear on the shop while the owner decides.
drop policy if exists ps_public_read on public.playstyles;
create policy ps_public_read on public.playstyles for select using (active = true);
drop policy if exists ps_admin_read on public.playstyles;
create policy ps_admin_read on public.playstyles for select using (public.is_admin());
drop policy if exists ps_admin_write on public.playstyles;
create policy ps_admin_write on public.playstyles for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists pps_public_read on public.product_playstyles;
create policy pps_public_read on public.product_playstyles for select using (true);
drop policy if exists pps_admin_write on public.product_playstyles;
create policy pps_admin_write on public.product_playstyles for all
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================
--  THE SUGGESTER
--
--  29 bats across 7 styles is 203 yes/no decisions. Nobody is
--  going to make those by hand, and a feature that ships empty
--  looks broken. So the rules that already live in the finder
--  quiz — js/app.js scoreProduct() — are written down here once,
--  against the spec fields every bat already has.
--
--  It is a SUGGESTER, not a classifier. It writes auto = true
--  rows and never touches a row the owner has confirmed. The
--  Maze Room runs it from a button, so it can be re-run after
--  the catalogue changes.
--
--  Returns the number of suggestions written.
-- ============================================================

create or replace function public.suggest_playstyles()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only a manager or the owner can re-tag the catalogue';
  end if;

  -- Clear only what a previous run wrote. Anything the owner has touched
  -- carries auto = false and survives.
  delete from public.product_playstyles where auto;

  with bat as (
    select
      p.id,
      p.tier,
      lower(coalesce(p.data->>'profile', ''))  as profile,
      lower(coalesce(p.data->>'edge', ''))     as edge,
      lower(coalesce(p.data->>'features', '')) as features,
      -- The midpoint, not the ends. Every range overlaps 720–870g, so a rule
      -- written on the ends tags all 29 bats "Medium" and the chip becomes a
      -- synonym for "everything". The midpoint is where the model actually
      -- sits when you pick it up, which is also what the finder quiz scores
      -- against, so the two agree.
      ( nullif(p.data->'weight'->>0, '')::numeric
      + nullif(p.data->'weight'->>1, '')::numeric ) / 2 as wmid
    from public.products p
    where p.category = 'bats'
  ),
  tagged as (
    -- ----- Best for -----
    -- Thick edges, laminated blades and mongoose builds exist to hit through
    -- the line. The edge test matters as much as the profile: a scoop called
    -- "CS PRO — Scoop + Thick Edges" is an attacker's bat whatever its shape.
    select id, 'attacker'::text as playstyle_id from bat
     where profile in ('bigedge', 'multi', 'mongoose')
        or edge ~ '(thick|big|massive)'
    union
    -- The do-everything shapes. A massive edge disqualifies: that bat has
    -- committed to one job.
    select id, 'all-rounder' from bat
     where profile in ('standard', 'scoop', 'flat')
       and edge !~ 'massive'
    union
    -- A defender's bat is the controlled one: classic blade, ordinary edge,
    -- nothing exaggerated. Deliberately the narrowest rule here — in tennis
    -- ball cricket this is a small, real segment, not half the catalogue.
    select id, 'defender' from bat
     where profile = 'standard'
       and edge in ('standard', 'sleek edge', 'good edge')
    union
    -- Forgiving and affordable. Entry tier is the honest signal; the
    -- features text confirms it where the workshop has said so.
    select id, 'beginner' from bat
     where tier = 'entry'
        or features ~ 'beginner'

    -- ----- Weight feel -----
    -- Three bands that do not overlap, so each chip returns a different
    -- third of the catalogue instead of the same 29 bats.
    union
    select id, 'light'  from bat where wmid is not null and wmid <  760
    union
    select id, 'medium' from bat where wmid >= 760 and wmid < 840
    union
    select id, 'heavy'  from bat where wmid >= 840
  )
  insert into public.product_playstyles (product_id, playstyle_id, auto)
  select t.id, t.playstyle_id, true
    from tagged t
   where exists (select 1 from public.playstyles s
                  where s.id = t.playstyle_id and s.active)
  on conflict (product_id, playstyle_id) do nothing;   -- never clobber a manual row

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.suggest_playstyles() from public;
revoke all on function public.suggest_playstyles() from anon;
grant execute on function public.suggest_playstyles() to authenticated;


-- ---------- run it once so the feature is not born empty ----------
-- Wrapped because suggest_playstyles() refuses a non-admin caller, and the
-- SQL editor runs as postgres, which has no staff row. This does the same
-- work with the same rules and no permission check — appropriate for a
-- migration, not for a function the browser can reach.
do $$
declare n integer;
begin
  delete from public.product_playstyles where auto;

  with bat as (
    select p.id, p.tier,
           lower(coalesce(p.data->>'profile', ''))  as profile,
           lower(coalesce(p.data->>'edge', ''))     as edge,
           lower(coalesce(p.data->>'features', '')) as features,
           ( nullif(p.data->'weight'->>0, '')::numeric
           + nullif(p.data->'weight'->>1, '')::numeric ) / 2 as wmid
      from public.products p
     where p.category = 'bats'
  ),
  tagged as (
    select id, 'attacker'::text as playstyle_id from bat
     where profile in ('bigedge','multi','mongoose')
        or edge ~ '(thick|big|massive)'
    union select id, 'all-rounder' from bat where profile in ('standard','scoop','flat')
                                     and edge !~ 'massive'
    union select id, 'defender'    from bat where profile = 'standard'
                                     and edge in ('standard','sleek edge','good edge')
    union select id, 'beginner'    from bat where tier = 'entry' or features ~ 'beginner'
    union select id, 'light'       from bat where wmid is not null and wmid <  760
    union select id, 'medium'      from bat where wmid >= 760 and wmid < 840
    union select id, 'heavy'       from bat where wmid >= 840
  )
  insert into public.product_playstyles (product_id, playstyle_id, auto)
  select t.id, t.playstyle_id, true from tagged t
  on conflict (product_id, playstyle_id) do nothing;

  get diagnostics n = row_count;
  raise notice 'Suggested % play-style assignments across the bat catalogue.', n;
end $$;


-- ============================================================
--  VERIFY
-- ============================================================
--
--  How the catalogue landed, style by style:
--
--    select s.group_id, s.name, count(pp.product_id) as bats
--      from public.playstyles s
--      left join public.product_playstyles pp on pp.playstyle_id = s.id
--     group by s.group_id, s.name, s.sort
--     order by s.group_id, s.sort;
--
--  Any bat the rules missed entirely (should be none):
--
--    select p.id, p.name from public.products p
--     where p.category = 'bats'
--       and not exists (select 1 from public.product_playstyles pp
--                        where pp.product_id = p.id);
--
--  What a single bat was tagged as:
--
--    select s.group_id, s.name, pp.auto
--      from public.product_playstyles pp
--      join public.playstyles s on s.id = pp.playstyle_id
--     where pp.product_id = 'toss-power-x'
--     order by s.group_id, s.sort;
--
--  Anonymous callers can read the marketing data and write none of it:
--
--    select count(*) from public.playstyles;            -- 7
--    insert into public.playstyles (id, group_id, name)
--      values ('x','style','X');                        -- must be refused
-- ============================================================
