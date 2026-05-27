-- Create the listings table
CREATE TABLE IF NOT EXISTS public.listings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    locality TEXT NOT NULL,
    rent INTEGER NOT NULL,
    deposit INTEGER,
    brokerage INTEGER,
    bhk INTEGER NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    "geoSource" TEXT NOT NULL,
    furnished TEXT NOT NULL,
    "listingType" TEXT NOT NULL DEFAULT 'room',
    "genderPreference" TEXT NOT NULL DEFAULT 'any',
    amenities TEXT[] DEFAULT '{}',
    nearby TEXT[] DEFAULT '{}',
    source TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceAuthor" TEXT NOT NULL,
    "sourceSubreddit" TEXT NOT NULL,
    description TEXT,
    "postedDaysAgo" INTEGER,
    "postedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    photos TEXT[] DEFAULT '{}',
    "hasRealPhotos" BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the metadata table for scrape stats
CREATE TABLE IF NOT EXISTS public.scrape_meta (
    id SERIAL PRIMARY KEY,
    "scrapedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "listingCount" INTEGER NOT NULL,
    "geocodedCount" INTEGER NOT NULL,
    "realPhotoCount" INTEGER NOT NULL,
    "zeroBrokerageCount" INTEGER NOT NULL,
    "bhkDistribution" JSONB NOT NULL,
    "typeDistribution" JSONB NOT NULL,
    "genderDistribution" JSONB NOT NULL,
    "sourceSubreddits" JSONB NOT NULL,
    "maxAgeDays" INTEGER NOT NULL
);

-- Enable RLS but allow read-only access for everyone
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on listings" 
ON public.listings FOR SELECT TO public USING (true);

CREATE POLICY "Allow public read access on scrape_meta" 
ON public.scrape_meta FOR SELECT TO public USING (true);

-- Allow service role to do everything
CREATE POLICY "Allow service role full access on listings" 
ON public.listings TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access on scrape_meta" 
ON public.scrape_meta TO service_role USING (true) WITH CHECK (true);
