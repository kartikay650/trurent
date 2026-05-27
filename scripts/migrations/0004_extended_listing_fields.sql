-- Phase 3.1: production-grade listing form fields.
-- Adds optional square-footage and society-name columns. The bhk column was
-- always INTEGER with no check constraint, so it already accepts any value;
-- we just document the supported range here. Locality + lat/lng are unchanged;
-- the form now lets posters drop a precise pin instead of using the locality
-- centroid (the row schema is the same, the value source is different).
--
-- Idempotent. Apply with: SUPABASE_DB_PASSWORD=... node scripts/apply-migration.mjs scripts/migrations/0004_extended_listing_fields.sql

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sqft INTEGER,
  ADD COLUMN IF NOT EXISTS "societyName" TEXT;

-- Sanity-bound sqft so weird values don't propagate. Forms will validate at
-- 100-10000, this just guards against direct writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listings_sqft_range'
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_sqft_range
      CHECK (sqft IS NULL OR (sqft >= 50 AND sqft <= 20000));
  END IF;
END $$;
