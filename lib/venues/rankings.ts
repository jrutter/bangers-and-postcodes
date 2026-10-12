import { readVenueIndex, type VenueIndexEntry } from "@/lib/page-data"
import { rankByBayesian } from "@/lib/venues/score"
import { loadStoredRatings } from "@/lib/venues/snapshot"
import type { RatingRow } from "@/lib/venues/store"

export type PublicRanking = {
  venueId: string
  name: string
  regionId: string | null
  rating: number
  userRatingCount: number
  weighted: number
  rank: number
}

export function googlePlacesConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.GOOGLE_PLACES_API_KEY ?? "").trim())
}

export function rankingsFromRows(rows: RatingRow[], venues: VenueIndexEntry[]): { prior: number | null; rows: PublicRanking[] } {
  const byId = new Map(venues.map((venue) => [venue.id, venue]))
  const rated = rows.flatMap((row) => {
    if (row.rating == null || row.userRatingCount == null || row.userRatingCount <= 0) return []
    const venue = byId.get(row.venueId)
    if (!venue) return []
    return [{ venueId: row.venueId, rating: row.rating, userRatingCount: row.userRatingCount, name: venue.name, regionId: venue.regionId }]
  })
  const ranked = rankByBayesian(rated)
  return {
    prior: ranked.prior,
    rows: ranked.rows.map((row) => ({
      venueId: row.venueId,
      name: row.name,
      regionId: row.regionId,
      rating: row.rating,
      userRatingCount: row.userRatingCount,
      weighted: row.weighted,
      rank: row.rank,
    })),
  }
}

export async function loadVenueRankings(): Promise<{ configured: boolean; prior: number | null; rows: PublicRanking[] }> {
  if (!googlePlacesConfigured()) return { configured: false, prior: null, rows: [] }
  const ranked = rankingsFromRows(await loadStoredRatings(), readVenueIndex())
  return { configured: true, prior: ranked.prior, rows: ranked.rows }
}

export async function rankForVenue(venueId: string): Promise<PublicRanking | null> {
  const loaded = await loadVenueRankings()
  if (!loaded.configured) return null
  return loaded.rows.find((row) => row.venueId === venueId) ?? null
}

export function venueTargetsFromIndex(): { id: string; name: string; address: string; postcode: string }[] {
  return readVenueIndex().map((venue) => ({
    id: venue.id,
    name: venue.name,
    address: venue.address,
    postcode: venue.postcode,
  }))
}
