import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

// Load .env.local
if (existsSync(".env.local")) {
  const envFile = readFileSync(".env.local", "utf8");
  envFile.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].trim();
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log("Testing Supabase connection...");
  
  const dummyListing = {
    id: "test_123",
    title: "Test Listing",
    locality: "Koramangala",
    rent: 20000,
    deposit: 100000,
    brokerage: 0,
    bhk: 1,
    lat: 12.9352,
    lng: 77.6245,
    geoSource: "nominatim",
    furnished: "semi",
    listingType: "room",
    genderPreference: "any",
    amenities: ["gym"],
    nearby: [],
    source: "reddit",
    sourceUrl: "https://reddit.com",
    sourceAuthor: "test",
    sourceSubreddit: "bangalorerentals",
    description: "test description",
    postedDaysAgo: 1,
    postedAt: new Date().toISOString(),
    photos: ["http://example.com/photo.jpg"],
    hasRealPhotos: true
  };

  const { error } = await supabase.from("listings").upsert([dummyListing]);
  if (error) {
    console.error("Failed to insert:", error);
    process.exit(1);
  }
  console.log("✅ Successfully inserted test listing");

  const { error: delError } = await supabase.from("listings").delete().eq("id", "test_123");
  if (delError) {
    console.error("Failed to delete:", delError);
    process.exit(1);
  }
  console.log("✅ Successfully cleaned up test listing");
}

test();
