import type { MatchedArtist } from "@/lib/types"

export function chunk<T>(items: T[], size = 100): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1")
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

function spotifyRank(artist: MatchedArtist): [number, number] {
  const popularity = artist.spotify?.popularity
  const followers = artist.spotify?.followers
  return [typeof popularity === "number" ? popularity : -1, typeof followers === "number" ? followers : -1]
}

/** One track per Spotify artist, highest popularity first, track URIs deduped. */
export function trackUris(artists: MatchedArtist[]): string[] {
  const ranked = artists
    .filter((artist) => artist.spotify?.id)
    .sort((left, right) => {
      const [lp, lf] = spotifyRank(left)
      const [rp, rf] = spotifyRank(right)
      if (lp !== rp) return rp - lp
      return rf - lf
    })
  const uris: string[] = []
  const seenTracks = new Set<string>()
  const seenArtists = new Set<string>()
  for (const artist of ranked) {
    const profile = artist.spotify
    if (!profile) continue
    if (profile.id && seenArtists.has(profile.id)) continue
    const uri = profile.representative_track?.uri
    if (!uri || seenTracks.has(uri)) continue
    if (profile.id) seenArtists.add(profile.id)
    seenTracks.add(uri)
    uris.push(uri)
  }
  return uris
}

export function playlistName(label: string, custom?: string): string {
  const chosen = (custom ?? "").trim() || `Bangers & Postcodes — ${label}`
  return chosen.slice(0, 100)
}

export function playlistDescription(label: string): string {
  return `Artists linked to ${label}. Built by Bangers & Postcodes from public locality data, Barnes to Wimbledon.`.slice(
    0,
    300,
  )
}
