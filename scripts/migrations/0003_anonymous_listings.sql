-- Phase 3: drop the email auth requirement for owner submissions.
-- AI auto-moderation alone gates submissions now; renters reach owners via
-- the phone/WhatsApp number stored on the row.
--
-- Idempotent. Apply via: SUPABASE_DB_PASSWORD=... node scripts/apply-migration.mjs scripts/migrations/0003_anonymous_listings.sql

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS "ownerName" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerPhone" TEXT;

-- Make legacy auth-tied columns fully optional. Anonymous submissions leave
-- these NULL.
ALTER TABLE public.listings ALTER COLUMN "submittedBy" DROP NOT NULL;
ALTER TABLE public.listings ALTER COLUMN "ownerEmail" DROP NOT NULL;

-- RLS: the existing public-read policy is "status = 'active' OR status IS
-- NULL" which keeps working. We drop the now-pointless authenticated-only
-- INSERT policy because the API uses the service role to write anonymous
-- submissions; users no longer write to listings directly from the browser.
DROP POLICY IF EXISTS "Users submit owner listings" ON public.listings;
DROP POLICY IF EXISTS "Users update own pending" ON public.listings;
DROP POLICY IF EXISTS "Users read own submissions" ON public.listings;

-- The storage policy that pinned uploads to auth.uid()/folder is also
-- obsolete — server-side service-role uploads use a random listing_id
-- prefix instead. Drop it; keep the public read + service-role write.
DROP POLICY IF EXISTS "Authenticated upload listing photos" ON storage.objects;
DROP POLICY IF EXISTS "Users delete their photos" ON storage.objects;
