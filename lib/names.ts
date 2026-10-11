import type { SpotifyProfile, SpotifyTrack } from "@/lib/types"

/** Case, punctuation, and a leading "The" are ignored. An exact match is required. */
export function normalizeName(name: string): string {
  let text = (name || "").toLowerCase().replace(/&/g, " and ")
  text = text.replace(/[^\p{L}\p{N}_\s]/gu, " ")
  text = text.replace(/\s+/g, " ").trim()
  if (text.startsWith("the ")) text = text.slice(4).trim()
  return text
}

export function namesMatch(left: string, right: string): boolean {
  const normalized = normalizeName(left)
  return Boolean(normalized) && normalized === normalizeName(right)
}

type ArtistCandidate = {
  id?: string
  name?: string
  popularity?: number
  followers?: { total?: number }
  images?: { url?: string }[]
  external_urls?: { spotify?: string }
}

export function metricsFromArtist(artist: ArtistCandidate): Omit<SpotifyProfile, "match" | "representative_track"> {
  const followerBlock = artist.followers
  const followers =
    followerBlock && typeof followerBlock.total === "number" ? followerBlock.total : null
  const popularity = typeof artist.popularity === "number" ? artist.popularity : null
  const images = artist.images ?? []
  const image = images[0] && typeof images[0].url === "string" ? images[0].url : null
  return {
    id: artist.id ?? "",
    name: artist.name ?? null,
    url: artist.external_urls?.spotify ?? null,
    followers,
    popularity,
    image,
  }
}

function artistRank(artist: ArtistCandidate): [number, number, string] {
  const popularity = typeof artist.popularity === "number" ? artist.popularity : -1
  const followers =
    artist.followers && typeof artist.followers.total === "number" ? artist.followers.total : -1
  return [popularity, followers, artist.name ?? ""]
}

export function chooseArtist(candidates: ArtistCandidate[], localName: string): ArtistCandidate | null {
  const exact = candidates.filter((artist) => namesMatch(artist.name ?? "", localName))
  if (exact.length === 0) return null
  return exact.reduce((best, artist) => (compareRank(artistRank(artist), artistRank(best)) > 0 ? artist : best))
}

function compareRank(left: [number, number, string], right: [number, number, string]): number {
  if (left[0] !== right[0]) return left[0] - right[0]
  if (left[1] !== right[1]) return left[1] - right[1]
  if (left[2] === right[2]) return 0
  return left[2] > right[2] ? 1 : -1
}

type TrackCandidate = {
  id?: string
  name?: string
  uri?: string
  preview_url?: string | null
  popularity?: number | null
  album?: { name?: string }
}

export function chooseTrack(tracks: TrackCandidate[]): SpotifyTrack | null {
  const usable = tracks.filter((track) => track.id)
  if (usable.length === 0) return null
  const anyPopularity = usable.some((track) => typeof track.popularity === "number")
  const picked = anyPopularity
    ? [...usable].sort((left, right) => {
        const lp = typeof left.popularity === "number" ? left.popularity : -1
        const rp = typeof right.popularity === "number" ? right.popularity : -1
        return rp - lp
      })[0]
    : usable[0]
  return {
    id: picked.id ?? null,
    name: picked.name ?? null,
    uri: picked.uri || (picked.id ? `spotify:track:${picked.id}` : ""),
    preview_url: picked.preview_url ?? null,
    album: picked.album && typeof picked.album.name === "string" ? picked.album.name : null,
    popularity: typeof picked.popularity === "number" ? picked.popularity : null,
  }
}
