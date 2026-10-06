-- ============================================================
--  TOSS SPORTS — CONTACT ENQUIRIES + BUSINESS IDENTITY
--
--  Meta's Business Verification requires a contact page whose
--  form actually works. A form that silently drops what people
--  type is worse than no form at all: the reviewer cannot tell,
--  but the customer who wrote in and never heard back can.
--
--  So submissions land in a table the Maze Room reads, exactly
--  like orders. They survive a missing mailbox, a bounced email
--  and a misconfigured mail service, because nothing has to
--  leave the database for them to be safe.
--
--  That is not hypothetical here. Neither tossports.com nor
--  tossports.in has an MX record, so every address the site has
--  ever printed bounces. A contact form built on email would
--  have delivered nothing, and looked fine doing it.
--
--  WHY ANYONE MAY INSERT BUT ONLY STAFF MAY READ
--  ---------------------------------------------
--  Anyone must be able to write one — that is what a public
--  contact form is. Nobody unauthenticated may read them,
--  because they hold other people's names, phone numbers and
--  email addresses. Insert-only is the shape this needs, and it
--  is the same shape `orders` already uses.
--
--  Run after 028-hard-ball-guard.sql. Safe to re-run.
-- ============================================================

create table if not exists public.enquiries (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text,
  email       text,
  subject     text,
  message     text not null,
  source      text not null default 'contact-page',
  status      text not null default 'new',   -- new | replied | closed
  staff_note  text,
  created_at  timestamptz not null default now()
);

-- Partial index: the only query that runs every day is "what is unanswered",
-- and that is a small slice of a table that only grows.
create index if not exists enquiries_new_idx
  on public.enquiries (created_at desc) where status = 'new';

-- Length caps live in the database, not only in the browser. A form reachable
-- by anyone is reachable by a script, and maxlength is a suggestion to
-- everyone except the person filling it in honestly.
alter table public.enquiries drop constraint if exists enquiries_sane;
alter table public.enquiries add constraint enquiries_sane check (
  length(name) between 1 and 120
  and length(message) between 1 and 4000
  and (phone   is null or length(phone)   <= 32)
  and (email   is null or length(email)   <= 160)
  and (subject is null or length(subject) <= 160)
  and status in ('new', 'replied', 'closed')
);

alter table public.enquiries enable row level security;

-- Write-only for the public: send one, read none.
drop policy if exists enq_public_insert on public.enquiries;
create policy enq_public_insert on public.enquiries
  for insert to anon, authenticated with check (true);

drop policy if exists enq_admin_read on public.enquiries;
create policy enq_admin_read on public.enquiries
  for select using (public.is_admin() or public.is_founder());

drop policy if exists enq_admin_write on public.enquiries;
create policy enq_admin_write on public.enquiries
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists enq_founder_delete on public.enquiries;
create policy enq_founder_delete on public.enquiries
  for delete using (public.is_founder());


-- ---------- the identity Meta checks ----------
--  Held as settings so the footer, the contact page and the invoice all read
--  one value. The support email is deliberately a setting rather than a
--  constant in the page: it has to change from a Gmail address to a domain
--  mailbox the day that mailbox exists, and that should be a field to edit,
--  not a deploy to schedule.
--
--  Meta's own brief asks for an address on the site's own domain rather than
--  generic webmail. tossports@gmail.com is the owner's stated choice and a
--  known exception to that requirement — see the note in seo/seo-data.js.
insert into public.settings (key, value) values
  ('support_email',  '"tossports@gmail.com"'::jsonb),
  ('support_phone',  '"+919176995707"'::jsonb),
  ('turf_phone',     '"+918939981055"'::jsonb),
  ('turf_address',   '"Avenue, Plot Number 4, Kanchi Nagar, Vinayakapuram, Kolathur, Chennai, Tamil Nadu 600099"'::jsonb)
on conflict (key) do nothing;

update public.settings
   set value = '"69, Kavignar Kannadasan Nagar 5th St, Kannadasan Nagar, Nesapakkam, Ramapuram, Chennai, Tamil Nadu 600078"'::jsonb
 where key = 'business_address'
   and coalesce(value::text, 'null') in ('""', 'null');


-- ============================================================
--  VERIFY
-- ============================================================
--
--  An anonymous visitor can send one and read none. With the
--  publishable key, the first succeeds and the second returns []:
--
--    POST /rest/v1/enquiries   {"name":"X","message":"Y"}   -> 201
--    GET  /rest/v1/enquiries?select=*                       -> []
--
--  An anonymous PATCH or DELETE returns 204, which is NOT a hole:
--  the USING clause matches no rows, so nothing is touched. Prove
--  it by checking the row is still there and still unread:
--
--    select count(*), count(*) filter (where status='new')
--      from public.enquiries;
--
--  What the Maze Room reads:
--
--    select id, name, subject, status, created_at
--      from public.enquiries order by created_at desc;
-- ============================================================
