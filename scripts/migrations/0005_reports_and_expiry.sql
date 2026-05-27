-- Phase 3.2: user reports + listing expiry.
--
-- Reports table lets renters flag bad metadata on scraped listings
-- ("wrong listing type", "wrong brokerage", "rented out", etc.). Admin
-- reviews them from /admin/reports and can override the listing.
--
-- Expiry: an explicit `expiresAt` column makes it cheap to filter out stale
-- Reddit listings without recomputing "lastSeenAt > 60d" on every read.
-- The ingest pipeline sets this on upsert.
--
-- Idempotent. Apply via: SUPABASE_DB_PASSWORD=... node scripts/apply-migration.mjs scripts/migrations/0005_reports_and_expiry.sql

CREATE TABLE IF NOT EXISTS public.listing_reports (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'wrong_brokerage',
    'wrong_listing_type',
    'wrong_locality',
    'rented_out',
    'scam_or_spam',
    'other'
  )),
  details TEXT,
  reporter_ip TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_reports_listing
  ON public.listing_reports (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_reports_unresolved
  ON public.listing_reports (created_at DESC)
  WHERE resolved = false;

-- RLS: only the service role reads/writes. The API and admin pages both go
-- through service role, so the policies are simple.
ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on listing_reports"
  ON public.listing_reports;
CREATE POLICY "Service role full access on listing_reports"
  ON public.listing_reports TO service_role
  USING (true) WITH CHECK (true);

-- Listings: explicit expiry timestamp. NULL means no expiry. The scraper
-- sets this to now()+90d for Reddit-sourced rows; owner submissions stay NULL
-- so they don't auto-expire.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_listings_expires
  ON public.listings ("expiresAt")
  WHERE "expiresAt" IS NOT NULL;
