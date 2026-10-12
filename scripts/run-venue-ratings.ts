import { refreshVenueRatings } from "@/lib/venues/refresh"
import { venueTargetsFromIndex } from "@/lib/venues/rankings"
import { publishRatingSnapshot } from "@/lib/venues/snapshot"
import { postgresUrl, ratingStoreFor } from "@/lib/venues/store"

const venues = venueTargetsFromIndex()
const store = ratingStoreFor(process.env)
const report = await refreshVenueRatings({
  env: process.env,
  store,
  fetchImpl: fetch,
  now: new Date(),
  venues,
  resolveBudget: venues.length,
  detailsBudget: venues.length,
  concurrency: 4,
  paceMs: 80,
})
const rows = await store.read()
if (!postgresUrl() && process.env.VERCEL) await publishRatingSnapshot(rows)
console.log(JSON.stringify({ ...report, store: store.kind, venues: venues.length }, null, 2))
