import { normalizeName } from "@/lib/names"

export type TasteSource = "followed" | "top-short" | "top-medium" | "track-short" | "track-medium" | "related"

export type TasteArtist = {
  id: string
  name: string
  genres: string[]
}

export type TasteTrack = {
  name: string
  artists: TasteArtist[]
}

export type TasteInput = {
  followed: TasteArtist[]
  topArtistsShort: TasteArtist[]
  topArtistsMedium: TasteArtist[]
  topTracksShort: TasteTrack[]
  topTracksMedium: TasteTrack[]
  related: { seedName: string; artists: TasteArtist[] }[]
}

type DirectHit = {
  name: string
  score: number
  reason: string
  genres: string[]
}

export type TasteProfile = {
  byName: Record<string, DirectHit>
  genreSeeds: { genre: string; name: string; rank: number }[]
  genresAvailable: boolean
  relatedAvailable: boolean
}

export type TasteMatch = {
  score: number
  reason: string
}

const SCORE: Record<TasteSource, number> = {
  followed: 100,
  "top-short": 90,
  "top-medium": 80,
  "track-short": 70,
  "track-medium": 60,
  related: 50,
}

const GENRE_SCORE = 40

export function buildTasteProfile(input: TasteInput): TasteProfile {
  const byName: Record<string, DirectHit> = {}
  const putArtist = (artist: TasteArtist, source: TasteSource, reason: string) => {
    const key = normalizeName(artist.name)
    if (!key) return
    const score = SCORE[source]
    const current = byName[key]
    if (current && current.score >= score) {
      if (artist.genres.length > 0) current.genres = uniqueGenres([...current.genres, ...artist.genres])
      return
    }
    byName[key] = {
      name: artist.name,
      score,
      reason,
      genres: uniqueGenres([...(current?.genres ?? []), ...artist.genres]),
    }
  }

  for (const artist of input.followed) putArtist(artist, "followed", "Followed on Spotify")
  for (const artist of input.topArtistsShort) putArtist(artist, "top-short", `You listen to ${artist.name}`)
  for (const artist of input.topArtistsMedium) putArtist(artist, "top-medium", `You listen to ${artist.name}`)
  for (const track of input.topTracksShort) {
    for (const artist of track.artists) putArtist(artist, "track-short", `You listen to ${artist.name}`)
  }
  for (const track of input.topTracksMedium) {
    for (const artist of track.artists) putArtist(artist, "track-medium", `You listen to ${artist.name}`)
  }
  for (const group of input.related) {
    for (const artist of group.artists) putArtist(artist, "related", `Similar to ${group.seedName}`)
  }

  const genreSeeds: TasteProfile["genreSeeds"] = []
  const seeds = [
    ...input.topArtistsShort.map((artist) => ({ artist, rank: SCORE["top-short"] })),
    ...input.topArtistsMedium.map((artist) => ({ artist, rank: SCORE["top-medium"] })),
    ...input.followed.map((artist) => ({ artist, rank: SCORE.followed })),
  ]
  for (const seed of seeds) {
    for (const genre of seed.artist.genres) {
      const normalized = normalizeName(genre)
      if (normalized.length < 3) continue
      genreSeeds.push({ genre: normalized, name: seed.artist.name, rank: seed.rank })
    }
  }

  const genresAvailable = genreSeeds.length > 0
  const relatedAvailable = input.related.some((group) => group.artists.length > 0)
  return { byName, genreSeeds, genresAvailable, relatedAvailable }
}

export function matchCandidate(profile: TasteProfile, candidate: { name: string; tags?: string[] }): TasteMatch | null {
  const key = normalizeName(candidate.name)
  const direct = key ? profile.byName[key] : undefined
  if (direct) return { score: direct.score, reason: direct.reason }

  let best: { score: number; reason: string; rank: number } | null = null
  for (const tag of candidate.tags ?? []) {
    const normalized = normalizeName(tag)
    if (normalized.length < 3) continue
    for (const seed of profile.genreSeeds) {
      if (!genresOverlap(normalized, seed.genre)) continue
      const score = GENRE_SCORE + seed.rank / 1000
      if (!best || score > best.score || (score === best.score && seed.rank > best.rank)) {
        best = { score, reason: `Similar to ${seed.name}`, rank: seed.rank }
      }
    }
  }
  return best ? { score: best.score, reason: best.reason } : null
}

export function indexTags(artists: { name: string; tags?: string[] }[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const artist of artists) {
    const key = normalizeName(artist.name)
    const tags = artist.tags ?? []
    if (!key || tags.length === 0) continue
    map.set(key, [...(map.get(key) ?? []), ...tags])
  }
  return map
}

export function matchGig(
  profile: TasteProfile,
  gig: { artistNames: string[] },
  tags?: ReadonlyMap<string, string[]>,
): TasteMatch | null {
  let best: TasteMatch | null = null
  for (const name of gig.artistNames) {
    const hit = matchCandidate(profile, { name, tags: tags?.get(normalizeName(name)) })
    if (hit && (!best || hit.score > best.score)) best = hit
  }
  return best
}

export function matchVenue(
  profile: TasteProfile,
  gigs: { artistNames: string[] }[],
  tags?: ReadonlyMap<string, string[]>,
): TasteMatch | null {
  let best: TasteMatch | null = null
  for (const gig of gigs) {
    const hit = matchGig(profile, gig, tags)
    if (hit && (!best || hit.score > best.score)) best = hit
  }
  return best
}

export function orderByTaste<T>(items: T[], match: (item: T) => TasteMatch | null): { item: T; taste: TasteMatch | null }[] {
  return items
    .map((item, index) => ({ item, taste: match(item), index }))
    .sort((left, right) => {
      const leftScore = left.taste?.score ?? -1
      const rightScore = right.taste?.score ?? -1
      if (leftScore !== rightScore) return rightScore - leftScore
      return left.index - right.index
    })
    .map(({ item, taste }) => ({ item, taste }))
}

function genresOverlap(tag: string, genre: string): boolean {
  if (tag === genre) return true
  const tagWords = tag.split(" ").filter((word) => word.length >= 3)
  const genreWords = genre.split(" ").filter((word) => word.length >= 3)
  if (tagWords.length === 0 || genreWords.length === 0) return false
  if (tagWords.length === 1) return genreWords.includes(tagWords[0])
  return tagWords.every((word) => genreWords.includes(word))
}

function uniqueGenres(genres: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const genre of genres) {
    const key = normalizeName(genre)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(genre)
  }
  return result
}
