# Classic House.com — Vercel + Supabase

The frontend is preconfigured with your Supabase project URL and publishable key.
The service-role key is deliberately NOT included.

## Important: your existing database

You already ran the initial SQL script that created `profiles`, `songs`, and `payments`.
Do NOT run `supabase/setup.sql` again. Instead, open Supabase SQL Editor and run
the complete `supabase/compatibility-migration.sql` file. It adds the extra columns
expected by the Vercel API and creates the private `music` storage bucket.

## Deploy to Vercel

1. Upload this project folder to a GitHub repository.
2. Import the repository in Vercel. Framework preset: Other; build command empty; output directory `.`.
3. In Vercel Project Settings → Environment Variables, add:
   - `SUPABASE_URL` = `https://pmsvhzbpxktnsexwubab.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase secret/service-role key (server-side only)
   - `DEMO_PAYMENTS` = `false`
4. Redeploy after adding variables.

Do not share the service-role/secret key in chat, source code, HTML, or GitHub.

## Create the first administrator

1. Create your artist account through the website.
2. Confirm its email if Supabase email confirmation is enabled.
3. In Supabase SQL Editor, replace the email and run:
   `update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR-ADMIN-EMAIL');`

## Manual Airtel Money process

Artist pays K50 to Airtel Money 0779 885 869, sends screenshot to WhatsApp at the same number,
then reports payment in the website. The report only sets `awaiting_verification`.
Admin must independently check the Airtel Money account, confirm receipt in the admin panel,
then separately approve/reject the song. No money is automatically collected.

## Current limitations

This is a development starter, not yet production-ready. Test registration, uploads, payment
reporting, admin confirmation and publishing on a staging deployment before public launch.
The project has not been deployed or tested against your live Supabase account from here.
