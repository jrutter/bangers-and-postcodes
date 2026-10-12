import { envValue } from "@/lib/oauth"
import { fetchPlaceDetails, searchPlaceId, textQueryFor } from "@/lib/venues/places"
import type { RatingRow, RatingStore } from "@/lib/venues/store"

export type VenueTarget = {
  id: string
  name: string
  address: string
  postcode: string
}

export type RefreshReport = {
  ok: boolean
  skippedReason?: "not-configured"
  resolved: number
  rated: number
  failed: number
  stored: number
}

const WEEK_MS = 6 * 24 * 60 * 60 * 1000
const ROTATE_MS = 7 * 24 * 60 * 60 * 1000

export async function refreshVenueRatings(input: {
  env: NodeJS.ProcessEnv
  store: RatingStore
  fetchImpl: typeof fetch
  now: Date
  venues: VenueTarget[]
  resolveBudget: number
  detailsBudget: number
  concurrency: number
  paceMs: number
}): Promise<RefreshReport> {
  const apiKey = envValue("GOOGLE_PLACES_API_KEY", input.env)
  if (!apiKey) {
    return { ok: true, skippedReason: "not-configured", resolved: 0, rated: 0, failed: 0, stored: 0 }
  }
  const existing = new Map((await input.store.read()).map((row) => [row.venueId, row]))
  const missing = input.venues.filter((venue) => !existing.get(venue.id)?.placeId)
  const toResolve = takeSlice(missing, input.now, input.resolveBudget, ROTATE_MS)
  let resolved = 0
  let failed = 0
  let stopped = false
  await mapPool(toResolve, input.concurrency, async (venue) => {
    if (stopped) return
    try {
      const placeId = await searchPlaceId(input.fetchImpl, apiKey, textQueryFor(venue), input.paceMs)
      if (!placeId) return
      existing.set(venue.id, {
        venueId: venue.id,
        placeId,
        rating: existing.get(venue.id)?.rating ?? null,
        userRatingCount: existing.get(venue.id)?.userRatingCount ?? null,
        fetchedAt: input.now.toISOString(),
      })
      resolved += 1
    } catch {
      failed += 1
      if (failed >= 5) stopped = true
    }
  })
  if (resolved > 0) await input.store.write([...existing.values()].filter((row) => toResolve.some((venue) => venue.id === row.venueId)))

  const stale = [...existing.values()]
    .filter((row) => needsDetails(row, input.now))
    .sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt))
    .slice(0, Math.max(0, input.detailsBudget))
  let rated = 0
  const removed: string[] = []
  const chunk = 40
  for (let index = 0; index < stale.length; index += chunk) {
    const batch = stale.slice(index, index + chunk)
    const written: RatingRow[] = []
    await mapPool(batch, input.concurrency, async (row) => {
      if (stopped) return
      try {
        const details = await fetchPlaceDetails(input.fetchImpl, apiKey, row.placeId, input.paceMs)
        if (!details) {
          removed.push(row.venueId)
          existing.delete(row.venueId)
          return
        }
        const next: RatingRow = {
          venueId: row.venueId,
          placeId: row.placeId,
          rating: details.rating,
          userRatingCount: details.userRatingCount,
          fetchedAt: input.now.toISOString(),
        }
        existing.set(row.venueId, next)
        written.push(next)
        if (details.rating != null && details.userRatingCount != null) rated += 1
      } catch {
        failed += 1
        if (failed >= 5) stopped = true
      }
    })
    if (written.length > 0) await input.store.write(written)
  }
  if (removed.length > 0) await input.store.remove(removed)
  return { ok: true, resolved, rated, failed, stored: existing.size }
}

function needsDetails(row: RatingRow, now: Date): boolean {
  if (!row.placeId) return false
  if (row.rating == null || row.userRatingCount == null) return true
  const fetched = Date.parse(row.fetchedAt)
  if (Number.isNaN(fetched)) return true
  return now.getTime() - fetched >= WEEK_MS
}

export function takeSlice<T>(items: T[], now: Date, budget: number, periodMs: number): T[] {
  if (budget <= 0 || items.length === 0) return []
  if (items.length <= budget) return items
  const slots = Math.ceil(items.length / budget)
  const slot = Math.floor(now.getTime() / periodMs) % slots
  return items.slice(slot * budget, slot * budget + budget)
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return
  let index = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (index < items.length) {
      const current = index
      index += 1
      const item = items[current]
      if (item !== undefined) await fn(item)
    }
  })
  await Promise.all(workers)
}
