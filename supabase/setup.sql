-- Run this entire script in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  artist_name text,
  role text not null default 'artist' check (role in ('artist','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text not null,
  genre text not null,
  producer text,
  description text,
  audio_path text not null,
  cover_path text not null,
  rights_confirmed boolean not null default false,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','awaiting_verification','paid')),
  status text not null default 'pending_payment' check (status in ('pending_payment','pending_review','published','rejected','changes_requested')),
  downloads bigint not null default 0,
  streams bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  currency text not null default 'ZMW',
  method text,
  status text not null check (status in ('awaiting_verification','confirmed','rejected')),
  provider_reference text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.payments enable row level security;

-- The Vercel API uses the service-role key for database operations. Never expose it in browser code.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, artist_name) values (new.id, coalesce(new.raw_user_meta_data->>'artist_name','New Artist'));
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile_for_new_user();

-- Private bucket. Files are served to listeners using short-lived signed URLs from the Vercel API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music','music',false,52428800,array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=52428800;

create policy "Artists upload to their own folder" on storage.objects
for insert to authenticated with check (bucket_id='music' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Artists read their own uploads" on storage.objects
for select to authenticated using (bucket_id='music' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Artists delete their own uploads" on storage.objects
for delete to authenticated using (bucket_id='music' and (storage.foldername(name))[1]=auth.uid()::text);

-- After creating your own account, promote it to admin by running this once with your account email:
-- update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR-ADMIN-EMAIL');
