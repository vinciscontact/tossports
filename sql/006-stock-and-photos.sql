-- ============================================================
--  TOSS SPORTS — stock movement + product photo storage
--
--  Stock is adjusted by a database trigger rather than by the browser.
--  A web checkout, a counter sale and a hand-logged WhatsApp order all
--  insert into `orders`, so putting the rule here means every route is
--  covered and none can be bypassed or forgotten.
--
--  Run after 005-billing.sql. Safe to re-run.
-- ============================================================

-- ---------- stock movement ----------
create or replace function public.apply_stock_on_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.status = 'cancelled' then return new; end if;
  for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    update public.products
       set stock = greatest(0, stock - greatest(1, coalesce((it->>'qty')::int, 1)))
     where id = it->>'id';
  end loop;
  return new;
end;
$$;

drop trigger if exists orders_take_stock on public.orders;
create trigger orders_take_stock after insert on public.orders
  for each row execute function public.apply_stock_on_order();

-- Cancelling an order puts the bats back. Without this the count drifts
-- down every time an order is voided and never recovers.
create or replace function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.status = 'cancelled' and coalesce(old.status,'') <> 'cancelled' then
    for it in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
      update public.products
         set stock = stock + greatest(1, coalesce((it->>'qty')::int, 1))
       where id = it->>'id';
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_restore_stock on public.orders;
create trigger orders_restore_stock after update of status on public.orders
  for each row execute function public.restore_stock_on_cancel();

-- ---------- product photos ----------
-- Public bucket: product images are meant to be seen by everyone. Writing
-- is restricted to admins by the policies below.
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set public = true;

drop policy if exists product_photos_read on storage.objects;
create policy product_photos_read on storage.objects for select
  using (bucket_id = 'products');

drop policy if exists product_photos_write on storage.objects;
create policy product_photos_write on storage.objects for insert
  with check (bucket_id = 'products' and public.is_admin());

drop policy if exists product_photos_update on storage.objects;
create policy product_photos_update on storage.objects for update
  using (bucket_id = 'products' and public.is_admin());

drop policy if exists product_photos_delete on storage.objects;
create policy product_photos_delete on storage.objects for delete
  using (bucket_id = 'products' and public.is_admin());
