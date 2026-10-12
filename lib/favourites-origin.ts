import { cacheLife, cacheTag, unstable_cache } from "next/cache"

const ARTIST_REVALIDATE_SECONDS = 60 * 60 * 24
const artistCacheLife = {
  stale: ARTIST_REVALIDATE_SECONDS,
  revalidate: ARTIST_REVALIDATE_SECONDS,
  expire: ARTIST_REVALIDATE_SECONDS * 7,
} as const

import { UNCHECKED, type FavouriteArtist, type OriginHit } from "@/lib/england"
import {
  createRateLimiter,
  decideNameRows,
  decideWikidata,
  fetchWikidataByNames,
  fetchWikidataBySpotifyIds,
  lookupArtistOrigin,
  type WikidataPlaceRow,
} from "@/lib/england-lookup"

const musicBrainzLimit = createRateLimiter(1100)

export type OriginBatch = { id: string; rows: WikidataPlaceRow[] }
export type NameBatch = { name: string; rows: WikidataPlaceRow[] }

/**
 * Wikidata first, in batches, then MusicBrainz at one request a second.
 * A visit stops after about 12 seconds of MusicBrainz so the page can render.
 * Checked artists stay cached; the next visit continues with the rest.
 */
export async function loadOrigins(artists: FavouriteArtist[], budgetMs = 12_000): Promise<Map<string, OriginHit>> {
  const result = new Map<string, OriginHit>()
  const ids = [...new Set(artists.map((artist) => artist.id))].sort()
  let byId: OriginBatch[] = []
  try {
    byId = ids.length > 0 ? await cachedSpotifyPlaces(ids) : []
  } catch {
    byId = []
  }
  const idRows = new Map(byId.map((entry) => [entry.id, entry.rows]))
  const pending: FavouriteArtist[] = []
  for (const artist of artists) {
    if (!idRows.has(artist.id)) {
      pending.push(artist)
      continue
    }
    const decided = decideWikidata(idRows.get(artist.id) ?? [])
    if (decided) result.set(artist.id, decided)
    else pending.push(artist)
  }

  const names = [...new Set(pending.map((artist) => artist.name.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "en"),
  )
  let byName: NameBatch[] = []
  try {
    byName = names.length > 0 ? await cachedNamePlaces(names) : []
  } catch {
    byName = []
  }
  const nameRows = new Map(byName.map((entry) => [entry.name, entry.rows]))
  const remaining: FavouriteArtist[] = []
  for (const artist of pending) {
    const rows = nameRows.get(artist.name.trim().toLowerCase()) ?? []
    if (rows.length === 0) {
      remaining.push(artist)
      continue
    }
    const decided = decideNameRows(rows)
    if (decided === "continue") remaining.push(artist)
    else result.set(artist.id, decided)
  }

  const started = Date.now()
  for (const artist of remaining) {
    if (Date.now() - started > budgetMs) {
      result.set(artist.id, UNCHECKED)
      continue
    }
    try {
      result.set(artist.id, await cachedMusicBrainz(artist.id, artist.name))
    } catch {
      result.set(artist.id, UNCHECKED)
    }
  }
  return result
}

const readSpotifyPlaces = unstable_cache(
  async (ids: string[]): Promise<OriginBatch[]> => {
    const grouped = await fetchWikidataBySpotifyIds(fetch, ids)
    return [...grouped.entries()].map(([id, rows]) => ({ id, rows }))
  },
  ["wikidata-spotify-places"],
  { revalidate: ARTIST_REVALIDATE_SECONDS, tags: ["musicbrainz", "artists"] },
)

const readNamePlaces = unstable_cache(
  async (names: string[]): Promise<NameBatch[]> => {
    const grouped = await fetchWikidataByNames(fetch, names)
    return [...grouped.entries()].map(([name, rows]) => ({ name, rows }))
  },
  ["wikidata-name-places"],
  { revalidate: ARTIST_REVALIDATE_SECONDS, tags: ["musicbrainz", "artists"] },
)

const readMusicBrainz = unstable_cache(
  async (spotifyId: string, name: string): Promise<OriginHit> =>
    lookupArtistOrigin({ id: spotifyId, name }, { fetch, limit: musicBrainzLimit }),
  ["musicbrainz-origin"],
  { revalidate: ARTIST_REVALIDATE_SECONDS, tags: ["musicbrainz", "artists"] },
)

async function cachedSpotifyPlaces(ids: string[]): Promise<OriginBatch[]> {
  "use cache"
  cacheLife(artistCacheLife)
  cacheTag("musicbrainz", "artists")
  return readSpotifyPlaces(ids)
}

async function cachedNamePlaces(names: string[]): Promise<NameBatch[]> {
  "use cache"
  cacheLife(artistCacheLife)
  cacheTag("musicbrainz", "artists")
  return readNamePlaces(names)
}

async function cachedMusicBrainz(spotifyId: string, name: string): Promise<OriginHit> {
  "use cache"
  cacheLife(artistCacheLife)
  cacheTag("musicbrainz", "artists")
  return readMusicBrainz(spotifyId, name)
}
