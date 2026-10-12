import { connection } from "next/server"

import { GOOGLE_RATINGS_ATTRIBUTION } from "@/lib/venues/places"
import { googlePlacesConfigured, rankForVenue } from "@/lib/venues/rankings"

export async function VenueRank({ venueId }: { venueId: string }) {
  if (!googlePlacesConfigured()) return null
  await connection()
  const row = await rankForVenue(venueId)
  if (!row) return null
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-primary">#{row.rank} in London</span>
      <span>
        {" "}
        · {row.rating.toFixed(1)} · {row.userRatingCount.toLocaleString("en-GB")} Google reviews
      </span>
      <span className="mt-1 block text-xs">{GOOGLE_RATINGS_ATTRIBUTION}</span>
    </p>
  )
}
