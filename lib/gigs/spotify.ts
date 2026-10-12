import { GIG_SPOTIFY_CAP } from "@/lib/gigs/constants"
import { displayBill, foldName } from "@/lib/gigs/bill"
import { lineupNames } from "@/lib/gigs/select"
import type { Gig } from "@/lib/gigs/types"
import { safePreviewUrl, spotifyTrackUrl } from "@/lib/format"
import { spotifyClient } from "@/lib/spotify"
import type { ArtistRecord, MatchedArtist } from "@/lib/types"

export type SpotifyLinks = {
  artistUrl: string | null
  artistLabel: string
  trackUrl: string | null
  trackName: string | null
  previewUrl: string | null
}

export type SpotifyLinkMap = Record<string, SpotifyLinks | null>

export function spotifyLinksFor(artists: MatchedArtist[]): SpotifyLinkMap {
  const links: SpotifyLinkMap = {}
  for (const artist of artists) {
    const key = foldName(artist.name)
    if (!key) continue
    if (!artist.spotify) {
      if (!(key in links)) links[key] = null
      continue
    }
    const track = artist.spotify.representative_track
    links[key] = {
      artistUrl: spotifyArtistUrl(artist.spotify.url),
      artistLabel: artist.spotify.name || artist.name,
      trackUrl: spotifyTrackUrl(track?.uri),
      trackName: track?.name ?? null,
      previewUrl: safePreviewUrl(track?.preview_url),
    }
  }
  return links
}

export function lookupLinks(links: SpotifyLinkMap, name: string): SpotifyLinks | null | undefined {
  return links[foldName(name)]
}

export function gigActRows(name: string, links: SpotifyLinkMap): { name: string; match: SpotifyLinks | null | undefined }[] {
  const labels = displayBill(name, (query) => {
    const match = lookupLinks(links, query)
    if (match === undefined) return "absent"
    return match ? "match" : "miss"
  })
  return labels.map((label) => ({ name: label, match: lookupLinks(links, label) }))
}

export async function linksForGigArtists(
  gigs: Gig[],
  known: MatchedArtist[] = [],
): Promise<{ links: SpotifyLinkMap; status: "ready" | "unconfigured" | "error"; message?: string }> {
  const links = spotifyLinksFor(known)
  const client = spotifyClient()
  if (!client.configured()) return { links, status: "unconfigured" }
  const knownNames = new Set(known.map((artist) => foldName(artist.name)))
  const names = lineupNames(gigs, GIG_SPOTIFY_CAP).filter((name) => !knownNames.has(foldName(name)))
  if (names.length === 0) return { links, status: "ready" }
  try {
    const matched = await client.matchGigLineup(names.map(recordFromName), spotifyIdHints(gigs))
    return { links: { ...links, ...spotifyLinksFor(matched) }, status: "ready" }
  } catch (error) {
    return {
      links,
      status: "error",
      message: error instanceof Error ? error.message : "Spotify could not be reached.",
    }
  }
}

export function spotifyIdHints(gigs: Gig[]): Map<string, string> {
  const hints = new Map<string, string>()
  for (const gig of gigs) {
    for (const [name, id] of Object.entries(gig.artistSpotifyIds ?? {})) {
      const key = foldName(name)
      if (!key || !id || hints.has(key)) continue
      hints.set(key, id)
    }
  }
  return hints
}

function recordFromName(name: string): ArtistRecord {
  return {
    mbid: null,
    wikidata_qid: null,
    name,
    sort_name: name,
    type: null,
    disambiguation: null,
    country: null,
    life_span: null,
    tags: [],
    locality: [],
  }
}

function spotifyArtistUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol === "https:" && url.hostname === "open.spotify.com" && url.pathname.startsWith("/artist/")) {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}
