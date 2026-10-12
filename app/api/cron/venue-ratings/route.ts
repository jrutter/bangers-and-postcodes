import { envValue } from "@/lib/oauth"
import { secretMatches } from "@/lib/newsletter/tokens"
import { refreshVenueRatings } from "@/lib/venues/refresh"
import { venueTargetsFromIndex } from "@/lib/venues/rankings"
import { expireRatingCache, loadStoredRatings, publishRatingSnapshot } from "@/lib/venues/snapshot"
import { memoryRatingStore, postgresUrl, ratingStoreFor, type RatingStore } from "@/lib/venues/store"

export const maxDuration = 120

export async function GET(request: Request) {
  const secret = envValue("CRON_SECRET")
  const header = request.headers.get("authorization") ?? ""
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : ""
  if (!secret || !secretMatches(provided, secret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }
  if (!envValue("GOOGLE_PLACES_API_KEY")) {
    return Response.json({ ok: true, skippedReason: "not-configured" })
  }

  const url = new URL(request.url)
  const venues = venueTargetsFromIndex()
  const full = url.searchParams.get("full") === "1"
  const store = await storeForCron()
  const report = await refreshVenueRatings({
    env: process.env,
    store,
    fetchImpl: fetch,
    now: new Date(),
    venues,
    resolveBudget: full ? venues.length : 80,
    detailsBudget: venues.length,
    concurrency: 4,
    paceMs: 80,
  })
  const rows = await store.read()
  if (postgresUrl()) expireRatingCache()
  else if (process.env.VERCEL || store.kind === "memory") await publishRatingSnapshot(rows)
  return Response.json({ ...report, store: postgresUrl() ? "postgres" : store.kind })
}

async function storeForCron(): Promise<RatingStore> {
  if (!postgresUrl() && process.env.VERCEL) return memoryRatingStore(await loadStoredRatings())
  return ratingStoreFor(process.env)
}
