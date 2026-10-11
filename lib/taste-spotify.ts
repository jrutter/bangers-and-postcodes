import { API_ROOT } from "@/lib/oauth"
import { buildTasteProfile, type TasteArtist, type TasteProfile, type TasteTrack } from "@/lib/taste"

export class TasteScopeError extends Error {
  constructor() {
    super("Spotify did not grant user-top-read.")
    this.name = "TasteScopeError"
  }
}

type FetchLike = typeof fetch

const TOP_LIMIT = "20"
const FOLLOW_LIMIT = "50"
const RELATED_SEEDS = 4

/**
 * Reads the listener's recent taste with their access token.
 * Related-artists and artist genres are optional: newer Spotify apps often
 * omit both, and a 403 on related-artists does not fail the profile.
 */
export async function readUserTaste(token: string, fetchImpl: FetchLike = fetch): Promise<TasteProfile> {
  const [shortArtists, mediumArtists, shortTracks, mediumTracks, followed] = await Promise.all([
    readTopArtists(fetchImpl, token, "short_term"),
    readTopArtists(fetchImpl, token, "medium_term"),
    readTopTracks(fetchImpl, token, "short_term"),
    readTopTracks(fetchImpl, token, "medium_term"),
    readFollowed(fetchImpl, token),
  ])

  const seeds = uniqueArtists([...shortArtists, ...mediumArtists]).slice(0, RELATED_SEEDS)
  const related: { seedName: string; artists: TasteArtist[] }[] = []
  for (const seed of seeds) {
    if (!seed.id) continue
    const result = await readRelated(fetchImpl, token, seed)
    if (result === "blocked") break
    if (result) related.push(result)
  }

  return buildTasteProfile({
    followed,
    topArtistsShort: shortArtists,
    topArtistsMedium: mediumArtists,
    topTracksShort: shortTracks,
    topTracksMedium: mediumTracks,
    related,
  })
}

async function readTopArtists(fetchImpl: FetchLike, token: string, timeRange: string): Promise<TasteArtist[]> {
  const payload = await spotifyGet(fetchImpl, token, `/me/top/artists?time_range=${timeRange}&limit=${TOP_LIMIT}`, {
    scopeFailure: true,
  })
  return itemsOf(payload).map(parseArtist).filter((artist): artist is TasteArtist => artist !== null)
}

async function readTopTracks(fetchImpl: FetchLike, token: string, timeRange: string): Promise<TasteTrack[]> {
  const payload = await spotifyGet(fetchImpl, token, `/me/top/tracks?time_range=${timeRange}&limit=${TOP_LIMIT}`, {
    scopeFailure: true,
  })
  return itemsOf(payload).map(parseTrack).filter((track): track is TasteTrack => track !== null)
}

async function readFollowed(fetchImpl: FetchLike, token: string): Promise<TasteArtist[]> {
  const collected: TasteArtist[] = []
  let path: string | null = `/me/following?type=artist&limit=${FOLLOW_LIMIT}`
  for (let page = 0; page < 2 && path; page += 1) {
    let payload: Record<string, unknown>
    try {
      payload = await spotifyGet(fetchImpl, token, path, { scopeFailure: false })
    } catch {
      return collected
    }
    const block = payload.artists
    if (!block || typeof block !== "object") return collected
    const record = block as { items?: unknown; next?: unknown }
    for (const artist of asArray(record.items).map(parseArtist)) {
      if (artist) collected.push(artist)
    }
    path = nextPath(record.next)
    if (collected.length >= 100) break
  }
  return collected.slice(0, 100)
}

async function readRelated(
  fetchImpl: FetchLike,
  token: string,
  seed: TasteArtist,
): Promise<{ seedName: string; artists: TasteArtist[] } | "blocked" | null> {
  const response = await request(fetchImpl, token, `/artists/${encodeURIComponent(seed.id)}/related-artists`)
  if (response.status === 403 || response.status === 404) return "blocked"
  if (response.status >= 400) return null
  const artists = asArray(response.body.artists).map(parseArtist).filter((artist): artist is TasteArtist => artist !== null)
  return { seedName: seed.name, artists }
}

async function spotifyGet(
  fetchImpl: FetchLike,
  token: string,
  path: string,
  options: { scopeFailure: boolean },
): Promise<Record<string, unknown>> {
  const response = await request(fetchImpl, token, path)
  if (options.scopeFailure && isInsufficientScope(response.status, response.body)) throw new TasteScopeError()
  if (response.status >= 400) {
    throw new Error("Spotify taste could not be loaded.")
  }
  return response.body
}

async function request(
  fetchImpl: FetchLike,
  token: string,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = path.startsWith("https://") ? path : `${API_ROOT}${path}`
  if (!url.startsWith(`${API_ROOT}/`) && url !== API_ROOT) {
    return { status: 400, body: {} }
  }
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  return { status: response.status, body }
}

function itemsOf(payload: Record<string, unknown>): unknown[] {
  return asArray(payload.items)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseArtist(value: unknown): TasteArtist | null {
  if (!value || typeof value !== "object") return null
  const record = value as { id?: unknown; name?: unknown; genres?: unknown }
  if (typeof record.name !== "string" || !record.name.trim()) return null
  const genres = asArray(record.genres).filter((genre): genre is string => typeof genre === "string" && genre.trim().length > 0)
  return {
    id: typeof record.id === "string" ? record.id : "",
    name: record.name.trim(),
    genres,
  }
}

function parseTrack(value: unknown): TasteTrack | null {
  if (!value || typeof value !== "object") return null
  const record = value as { name?: unknown; artists?: unknown }
  const artists = asArray(record.artists).map(parseArtist).filter((artist): artist is TasteArtist => artist !== null)
  if (artists.length === 0) return null
  const name = typeof record.name === "string" ? record.name.trim() : ""
  return { name, artists }
}

function nextPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(`${API_ROOT}/`)) return null
  return value.slice(API_ROOT.length)
}

function isInsufficientScope(status: number, body: Record<string, unknown>): boolean {
  if (status !== 403) return false
  const error = body.error
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : ""
  return message.toLowerCase().includes("insufficient")
}

function uniqueArtists(artists: TasteArtist[]): TasteArtist[] {
  const seen = new Set<string>()
  const result: TasteArtist[] = []
  for (const artist of artists) {
    const key = artist.id || artist.name
    if (seen.has(key)) continue
    seen.add(key)
    result.push(artist)
  }
  return result
}
