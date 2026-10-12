import { cacheLife, cacheTag, unstable_cache } from "next/cache"

import { spotifyClient } from "@/lib/spotify"
import type { ArtistRecord, MatchedArtist } from "@/lib/types"

const ARTIST_REVALIDATE_SECONDS = 60 * 60 * 24

/**
 * Spotify name matches are cached for 24 hours. Callers pass a small page or a
 * capped playlist sample, not the whole London catalogue.
 */
export async function matchArtistsCached(artists: ArtistRecord[]): Promise<MatchedArtist[]> {
  const client = spotifyClient()
  if (!client.configured() || artists.length === 0) {
    return artists
  }
  return mapPool(artists, 4, (artist) => cachedMatch(artist))
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

const matchArtistCached = unstable_cache(
  async (artist: ArtistRecord): Promise<MatchedArtist> => spotifyClient().matchArtist(artist),
  ["spotify-artist-match"],
  { revalidate: ARTIST_REVALIDATE_SECONDS, tags: ["spotify", "artists"] },
)

async function cachedMatch(artist: ArtistRecord): Promise<MatchedArtist> {
  "use cache"
  cacheLife({
    stale: ARTIST_REVALIDATE_SECONDS,
    revalidate: ARTIST_REVALIDATE_SECONDS,
    expire: ARTIST_REVALIDATE_SECONDS * 7,
  })
  cacheTag("spotify", "artists")
  return matchArtistCached(artist)
}
