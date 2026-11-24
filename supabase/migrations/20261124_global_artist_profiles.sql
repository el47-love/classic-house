ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS artist_slug text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS genres text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS profile_image_path text,
ADD COLUMN IF NOT EXISTS cover_image_path text,
ADD COLUMN IF NOT EXISTS website_url text,
ADD COLUMN IF NOT EXISTS instagram_url text,
ADD COLUMN IF NOT EXISTS facebook_url text,
ADD COLUMN IF NOT EXISTS tiktok_url text,
ADD COLUMN IF NOT EXISTS youtube_url text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_artist_slug_unique
ON public.profiles (lower(artist_slug))
WHERE artist_slug IS NOT NULL AND artist_slug <> '';

CREATE INDEX IF NOT EXISTS profiles_country_idx
ON public.profiles (country);
