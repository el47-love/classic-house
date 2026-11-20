-- Apply this only if you already created the earlier Classic House starter schema.
-- If you are creating a brand-new Supabase project, run ../setup.sql instead.
alter table public.songs drop constraint if exists songs_payment_status_check;
alter table public.songs add constraint songs_payment_status_check
  check (payment_status in ('unpaid','awaiting_verification','paid'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('awaiting_verification','confirmed','rejected','demo'));
