-- 032 — contact desks (2026-09-22)
--
-- Customer service & orders : +91 91769 95707, +91 86106 62462 (phone & WhatsApp)
--                             tossturf@gmail.com
-- Collaboration / careers / investors / franchise / marketing :
--                             +91 89399 81055 (phone & WhatsApp), tossportst055@gmail.com
-- Legal & privacy           : tossports.legal@gmail.com
--
-- The public pages carry these from seo/seo-data.js; these rows are the same
-- values in Settings so the Maze Room and any future screen read one truth.

insert into public.settings (key, value) values
  ('support_phone',   '"+919176995707"'::jsonb),
  ('support_phone_2', '"+918610662462"'::jsonb),
  ('alt_phone',       '"+918610662462"'::jsonb),
  ('support_email',   '"tossturf@gmail.com"'::jsonb),
  ('business_phone',  '"+918939981055"'::jsonb),
  ('business_email',  '"tossportst055@gmail.com"'::jsonb),
  ('legal_email',     '"tossports.legal@gmail.com"'::jsonb)
on conflict (key) do update set value = excluded.value;
