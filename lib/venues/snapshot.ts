import { revalidateTag, unstable_cache } from "next/cache"

import { defaultRatingsFile, neonRatingStore, postgresUrl, readRatingFile, type RatingRow } from "@/lib/venues/store"

const WEEK_SECONDS = 60 * 60 * 24 * 7
const holder: { rows: RatingRow[] } = { rows: [] }

const readBlob = unstable_cache(
  async (): Promise<RatingRow[]> => holder.rows,
  ["venue-google-ratings-blob"],
  { revalidate: WEEK_SECONDS, tags: ["venue-ratings"] },
)

const readPostgresCached = unstable_cache(
  async (): Promise<RatingRow[]> => {
    const url = postgresUrl()
    if (!url) return []
    return neonRatingStore(url).read()
  },
  ["venue-google-ratings-postgres"],
  { revalidate: 60 * 60 * 24, tags: ["venue-ratings"] },
)

/** Page read. Postgres when configured, otherwise the local file, otherwise the data-cache snapshot. */
export async function loadStoredRatings(): Promise<RatingRow[]> {
  if (postgresUrl()) return readPostgresCached()
  if (!process.env.VERCEL) {
    const fileRows = readRatingFile(defaultRatingsFile())
    if (fileRows.length > 0) return fileRows
  }
  return readBlob()
}

/** Called from the weekly cron after a refresh when Neon is not configured. */
export async function publishRatingSnapshot(rows: RatingRow[]): Promise<void> {
  holder.rows = rows.map((row) => ({
    venueId: row.venueId,
    placeId: row.placeId,
    rating: row.rating,
    userRatingCount: row.userRatingCount,
    fetchedAt: row.fetchedAt,
  }))
  revalidateTag("venue-ratings", { expire: 0 })
  await readBlob()
}

export function expireRatingCache(): void {
  revalidateTag("venue-ratings", { expire: 0 })
}
