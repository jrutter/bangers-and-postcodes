import { cacheLife } from "next/cache"

import { collectRegionalGigs } from "@/lib/gigs/collect"
import { GIG_REVALIDATE_SECONDS } from "@/lib/gigs/constants"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import type { GigFeed } from "@/lib/gigs/types"

/**
 * One regional pull for every page. The fingerprint is part of the cache key,
 * so adding a provider key starts a fresh entry instead of reusing an empty one.
 * Callers must run this at request time (after connection()) so `next build`
 * does not call the providers.
 */
export async function loadRegionalGigs(providerFingerprint: string): Promise<GigFeed> {
  "use cache"
  cacheLife({
    stale: 60 * 60,
    revalidate: GIG_REVALIDATE_SECONDS,
    expire: 60 * 60 * 24,
  })
  const feed = await collectRegionalGigs({ env: process.env, fetchImpl: fetch, now: new Date() })
  return { ...feed, cacheKey: providerFingerprint || gigProviderFingerprint() }
}
