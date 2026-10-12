import { dedupeFavourites, type FavouriteArtist, type FavouriteReason } from "@/lib/england"
import { API_ROOT } from "@/lib/oauth"
import { TasteScopeError } from "@/lib/taste-spotify"

type FetchLike = typeof fetch

const TOP_LIMIT = "50"
const FOLLOW_LIMIT = "50"

/**
 * Top artists across the three Spotify ranges, plus followed artists.
 * Follows stop at 100 so a large library does not turn into hundreds of origin lookups.
 */
export async function readFavouriteArtists(token: string, fetchImpl: FetchLike = fetch): Promise<FavouriteArtist[]> {
  const [shortTerm, mediumTerm, longTerm, followed] = await Promise.all([
    readTop(fetchImpl, token, "short_term", "top-short"),
    readTop(fetchImpl, token, "medium_term", "top-medium"),
    readTop(fetchImpl, token, "long_term", "top-long"),
    readFollowed(fetchImpl, token),
  ])
  return dedupeFavourites([...shortTerm, ...mediumTerm, ...longTerm, ...followed])
}

async function readTop(
  fetchImpl: FetchLike,
  token: string,
  timeRange: string,
  reason: FavouriteReason,
): Promise<FavouriteArtist[]> {
  const payload = await spotifyGet(fetchImpl, token, `/me/top/artists?time_range=${timeRange}&limit=${TOP_LIMIT}`)
  return itemsOf(payload).flatMap((item) => {
    const artist = parseArtist(item, reason)
    return artist ? [artist] : []
  })
}

async function readFollowed(fetchImpl: FetchLike, token: string): Promise<FavouriteArtist[]> {
  const collected: FavouriteArtist[] = []
  let path: string | null = `/me/following?type=artist&limit=${FOLLOW_LIMIT}`
  for (let page = 0; page < 2 && path; page += 1) {
    let payload: Record<string, unknown>
    try {
      payload = await spotifyGet(fetchImpl, token, path, false)
    } catch {
      return collected
    }
    const block = payload.artists
    if (!block || typeof block !== "object") return collected
    const record = block as { items?: unknown; next?: unknown }
    for (const artist of asArray(record.items)) {
      const parsed = parseArtist(artist, "followed")
      if (parsed) collected.push(parsed)
    }
    path = nextPath(record.next)
    if (collected.length >= 100) break
  }
  return collected.slice(0, 100)
}

function parseArtist(value: unknown, reason: FavouriteReason): FavouriteArtist | null {
  if (!value || typeof value !== "object") return null
  const record = value as { id?: unknown; name?: unknown; images?: unknown }
  if (typeof record.id !== "string" || !record.id.trim()) return null
  if (typeof record.name !== "string" || !record.name.trim()) return null
  return {
    id: record.id.trim(),
    name: record.name.trim(),
    image: pickImage(record.images),
    reasons: [reason],
  }
}

function pickImage(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const images = value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const url = (item as { url?: unknown }).url
    const width = (item as { width?: unknown }).width
    if (typeof url !== "string" || !url) return []
    return [{ url, width: typeof width === "number" ? width : 0 }]
  })
  if (images.length === 0) return null
  const sized = [...images].reverse().find((image) => image.width >= 64)
  return (sized ?? images[images.length - 1]).url
}

async function spotifyGet(
  fetchImpl: FetchLike,
  token: string,
  path: string,
  scopeFailure = true,
): Promise<Record<string, unknown>> {
  const url = path.startsWith("https://") ? path : `${API_ROOT}${path}`
  if (!url.startsWith(`${API_ROOT}/`)) return {}
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  if (scopeFailure && response.status === 403 && insufficient(body)) throw new TasteScopeError()
  if (response.status >= 400) {
    if (!scopeFailure) throw new Error("Spotify follows could not be loaded.")
    throw new Error("Spotify favourites could not be loaded.")
  }
  return body
}

function insufficient(body: Record<string, unknown>): boolean {
  const error = body.error
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : ""
  return message.toLowerCase().includes("insufficient")
}

function itemsOf(payload: Record<string, unknown>): unknown[] {
  return asArray(payload.items)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function nextPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(`${API_ROOT}/`)) return null
  return value.slice(API_ROOT.length)
}
