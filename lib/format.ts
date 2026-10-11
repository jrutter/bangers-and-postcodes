import type { Claim } from "@/lib/types"

export function metricText(value: number | null | undefined): string {
  if (typeof value !== "number") return "n/a"
  return value.toLocaleString("en-GB")
}

export function claimLabel(claim: Claim): string {
  if (claim.source === "musicbrainz") return `MusicBrainz ${claim.field}`
  if (claim.source === "wikidata") return `Wikidata ${claim.field}`
  return claim.source
}

export function spotifyTrackUrl(uri: string | null | undefined): string | null {
  if (!uri) return null
  const match = uri.match(/^spotify:track:([A-Za-z0-9]+)$/)
  return match ? `https://open.spotify.com/track/${match[1]}` : null
}

export function safeSpotifyImage(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "https:" && parsed.hostname === "i.scdn.co") return parsed.toString()
  } catch {
    return null
  }
  return null
}

export function safePreviewUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "https:") return parsed.toString()
  } catch {
    return null
  }
  return null
}

export function openSpotifyPlaylist(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol === "https:" && url.hostname === "open.spotify.com" && url.pathname.startsWith("/playlist/")) {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

export const TAGLINE =
  "The best new music from your ends. Pick a London postcode and get a Spotify playlist of artists from right round the corner, plus stats on who's local, who's growing, and which part of town is turning out the tunes. Starting in southwest London, from Barnes to Wimbledon."
