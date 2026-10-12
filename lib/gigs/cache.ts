import { cacheLife, cacheTag, unstable_cache } from "next/cache"

import { collectRegionalGigs } from "@/lib/gigs/collect"
import { GIG_REVALIDATE_SECONDS } from "@/lib/gigs/constants"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import type { GigFeed } from "@/lib/gigs/types"

const ARTIST_REVALIDATE_SECONDS = 60 * 60 * 24

/**
 * One city-wide pull, shared by every page.
 * `unstable_cache` keeps the feed for about six hours and across deploys.
 * The fingerprint is an argument, so a new provider key does not reuse an empty result.
 * Call this from the public shell. Do not call `connection()` first, or the build
 * cannot fill the cache and the first request after deploy walks every tile.
 */
const readRegionalGigs = unstable_cache(
  async (providerFingerprint: string): Promise<GigFeed> => {
    const feed = await collectRegionalGigs({ env: process.env, fetchImpl: fetch, now: new Date() })
    return { ...feed, cacheKey: providerFingerprint || gigProviderFingerprint() }
  },
  ["regional-gigs"],
  { revalidate: GIG_REVALIDATE_SECONDS, tags: ["gigs"] },
)

/** A clock inside the gig cache, so prerender does not see a fresh `new Date()`. */
export async function cachedClock(): Promise<string> {
  "use cache"
  cacheLife({
    stale: 60 * 60,
    revalidate: GIG_REVALIDATE_SECONDS,
    expire: ARTIST_REVALIDATE_SECONDS,
  })
  cacheTag("gigs")
  return new Date().toISOString()
}

export async function loadRegionalGigs(providerFingerprint: string): Promise<GigFeed> {
  "use cache"
  cacheLife({
    stale: 60 * 60,
    revalidate: GIG_REVALIDATE_SECONDS,
    expire: ARTIST_REVALIDATE_SECONDS,
  })
  cacheTag("gigs")
  return readRegionalGigs(providerFingerprint)
}
