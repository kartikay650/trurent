-- Phase 2 migration: owner submissions, auth, photo storage.
--
-- Apply ONCE via Supabase Dashboard -> SQL Editor (or psql / supabase CLI).
-- Idempotent: safe to re-run.

-- 1. New columns on listings ------------------------------------------------

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'pending_review', 'rejected', 'expired')),
  ADD COLUMN IF NOT EXISTS "submittedBy" UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerWhatsapp" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "flaggedReasons" TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- Make source default-able. Existing scraped rows already have a value.
ALTER TABLE public.listings ALTER COLUMN source DROP NOT NULL;
ALTER TABLE public.listings ALTER COLUMN "sourceUrl" DROP NOT NULL;
ALTER TABLE public.listings ALTER COLUMN "sourceAuthor" DROP NOT NULL;
ALTER TABLE public.listings ALTER COLUMN "sourceSubreddit" DROP NOT NULL;

-- Helpful indexes for the queries the app makes
CREATE INDEX IF NOT EXISTS idx_listings_status_posted
  ON public.listings (status, "postedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_listings_locality
  ON public.listings (locality);
CREATE INDEX IF NOT EXISTS idx_listings_submittedby
  ON public.listings ("submittedBy")
  WHERE "submittedBy" IS NOT NULL;

-- 2. Profiles table for admin role ---------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on profiles" ON public.profiles;
CREATE POLICY "Service role full access on profiles"
  ON public.profiles TO service_role
  USING (true) WITH CHECK (true);

-- Auto-create a profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. RLS policies on listings --------------------------------------------

-- Drop existing policies so we can recreate them cleanly
DROP POLICY IF EXISTS "Allow public read access on listings" ON public.listings;
DROP POLICY IF EXISTS "Allow service role full access on listings" ON public.listings;

-- Public: see only ACTIVE listings (hides pending, rejected, expired)
CREATE POLICY "Public can read active listings"
  ON public.listings FOR SELECT TO public
  USING (status = 'active' OR status IS NULL);

-- Authenticated users: see their own submissions regardless of status
CREATE POLICY "Users read own submissions"
  ON public.listings FOR SELECT TO authenticated
  USING ("submittedBy" = auth.uid());

-- Authenticated users: insert their own listing with source='owner'
CREATE POLICY "Users submit owner listings"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK ("submittedBy" = auth.uid() AND source = 'owner');

-- Authenticated users: update their own listing while pending
CREATE POLICY "Users update own pending"
  ON public.listings FOR UPDATE TO authenticated
  USING ("submittedBy" = auth.uid() AND status = 'pending_review')
  WITH CHECK ("submittedBy" = auth.uid());

-- Admins: full access (must be defined AFTER profiles table exists)
CREATE POLICY "Admins full access on listings"
  ON public.listings FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role: still has full access for the scraper
CREATE POLICY "Service role full access on listings"
  ON public.listings TO service_role
  USING (true) WITH CHECK (true);

-- 4. Storage bucket for owner-uploaded photos -----------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Public read listing photos" ON storage.objects;
CREATE POLICY "Public read listing photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-photos');

DROP POLICY IF EXISTS "Authenticated upload listing photos" ON storage.objects;
CREATE POLICY "Authenticated upload listing photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their photos" ON storage.objects;
CREATE POLICY "Users delete their photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Note: to grant your own admin role, after signing in once via the
--    app, run this from the SQL editor with your email substituted:
--
--      UPDATE public.profiles SET role = 'admin'
--      WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL');
