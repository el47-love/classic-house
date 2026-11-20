-- CLASSIC HOUSE.COM: COMPATIBILITY MIGRATION
-- Run this in Supabase SQL Editor AFTER the first setup script succeeded.
-- Aligns the existing schema with the Vercel API. Safe to run once.

begin;

-- Extend existing songs table with the API's expected field names.
alter table public.songs
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists artist text,
  add column if not exists producer text,
  add column if not exists status text,
  add column if not exists downloads bigint not null default 0,
  add column if not exists streams bigint not null default 0;

update public.songs
set user_id = coalesce(user_id, artist_id),
    artist = coalesce(artist, artist_name),
    status = coalesce(status,
      case review_status
        when 'pending_payment' then 'pending_payment'
        when 'pending_review' then 'pending_review'
        when 'published' then 'published'
        when 'rejected' then 'rejected'
        when 'changes_requested' then 'changes_requested'
        else 'pending_payment'
      end),
    payment_status = case payment_status
      when 'confirmed' then 'paid'
      when 'awaiting_payment' then 'unpaid'
      else payment_status
    end;

alter table public.songs alter column user_id set not null;
alter table public.songs alter column artist set not null;
alter table public.songs alter column status set default 'pending_payment';

alter table public.songs drop constraint if exists songs_payment_status_check;
alter table public.songs add constraint songs_payment_status_check
  check (payment_status in ('unpaid','awaiting_verification','paid'));

alter table public.songs drop constraint if exists songs_status_check;
alter table public.songs add constraint songs_status_check
  check (status in ('pending_payment','pending_review','published','rejected','changes_requested'));

-- Extend existing payments table to the API's field names.
alter table public.payments
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists method text,
  add column if not exists provider_reference text;

update public.payments
set user_id = coalesce(user_id, artist_id),
    method = coalesce(method, payment_method),
    provider_reference = coalesce(provider_reference, transaction_reference),
    status = case status when 'confirmed' then 'confirmed' else status end;

alter table public.payments alter column user_id set not null;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('awaiting_verification','confirmed','rejected'));

-- Ensure artist profile metadata is populated on new registrations.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, artist_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'artist_name', ''),
    'artist'
  )
  on conflict (id) do update
    set artist_name = coalesce(nullif(public.profiles.artist_name,''), excluded.artist_name);
  return new;
end;
$$;

-- Existing trigger calls handle_new_user(); recreate to ensure correct function.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- The website uploads to a private bucket named "music".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music', 'music', false, 52428800,
  array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Classic House artists upload own music" on storage.objects;
create policy "Classic House artists upload own music"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'music'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Classic House artists read own music" on storage.objects;
create policy "Classic House artists read own music"
on storage.objects for select to authenticated
using (
  bucket_id = 'music'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
  )
);

drop policy if exists "Classic House artists update own music" on storage.objects;
create policy "Classic House artists update own music"
on storage.objects for update to authenticated
using (
  bucket_id = 'music'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'music'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Classic House admins delete music" on storage.objects;
create policy "Classic House admins delete music"
on storage.objects for delete to authenticated
using (bucket_id = 'music' and public.is_admin());

commit;
