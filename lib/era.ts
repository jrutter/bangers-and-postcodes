import type { ArtistRecord } from "@/lib/types"

export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const

export type Decade = (typeof DECADES)[number]
export type EraFilter = "now" | "earlier" | Decade

const ARTIST_PAGE_SIZE = 24
export const PLAYLIST_MATCH_CAP = 60
export const PLAYLIST_TRACK_CAP = 50

export function parseEra(value: string | null | undefined): EraFilter | null {
  if (!value || value === "all") return null
  if (value === "now" || value === "earlier") return value
  const year = Number(value)
  return (DECADES as readonly number[]).includes(year) ? (year as Decade) : null
}

export function withEra(href: string, era: EraFilter | null): string {
  if (!era) return href
  const join = href.includes("?") ? "&" : "?"
  return `${href}${join}era=${encodeURIComponent(String(era))}`
}

export function eraLabel(era: EraFilter): string {
  if (era === "now") return "Active now"
  if (era === "earlier") return "Before the 1950s"
  return `${String(era).slice(2)}s`
}

/** Sentence fragment after an artist count: "in the 60s", "active now". */
export function eraScope(era: EraFilter): string {
  if (era === "now") return "active now"
  if (era === "earlier") return "from before the 1950s"
  return `in the ${eraLabel(era)}`
}

export function beginYear(artist: ArtistRecord): number | null {
  return yearOf(artist.life_span?.begin)
}

export function filterArtists(artists: ArtistRecord[], era: EraFilter | null, now = new Date()): ArtistRecord[] {
  if (!era) return artists
  return artists.filter((artist) => matchesEra(artist, era, now))
}

export function matchesEra(artist: ArtistRecord, era: EraFilter, now = new Date()): boolean {
  if (era === "now") return activeNow(artist, now)
  const span = spanYears(artist, now)
  if (span.begin === null) return false
  if (era === "earlier") return span.begin < 1950
  const finish = span.end ?? span.begin
  return span.begin <= era + 9 && finish >= era
}

export function activeNow(artist: ArtistRecord, now = new Date()): boolean {
  const span = artist.life_span
  if (!span) return false
  const begin = yearOf(span.begin)
  const end = yearOf(span.end)
  const current = now.getUTCFullYear()
  if (begin === null && end === null) return false
  if (begin !== null && begin > current) return false
  if (end !== null && end < current) return false
  if (span.ended === true && (end === null || end < current)) return false
  return true
}

/** A few of the earliest spans and a few artists who are still active. */
export function showcaseArtists(artists: ArtistRecord[], limit = 6, now = new Date()): ArtistRecord[] {
  const legends = artists
    .filter((artist) => beginYear(artist) !== null)
    .sort((left, right) => (beginYear(left) ?? 0) - (beginYear(right) ?? 0))
  const current = artists
    .filter((artist) => activeNow(artist, now))
    .sort((left, right) => (beginYear(right) ?? 0) - (beginYear(left) ?? 0))
  const picked: ArtistRecord[] = []
  const seen = new Set<string>()
  const add = (artist: ArtistRecord | undefined) => {
    if (!artist || picked.length >= limit) return
    const key = artist.mbid || artist.wikidata_qid || artist.name
    if (seen.has(key)) return
    seen.add(key)
    picked.push(artist)
  }
  const rounds = Math.max(legends.length, current.length)
  for (let index = 0; index < rounds && picked.length < limit; index += 1) {
    add(legends[index])
    add(current[index])
  }
  for (const artist of artists) {
    if (picked.length >= limit) break
    add(artist)
  }
  return picked
}

export function pageArtists(artists: ArtistRecord[], page: number, size = ARTIST_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(artists.length / size))
  const current = Math.min(Math.max(1, page || 1), pages)
  const start = (current - 1) * size
  return { page: current, pages, items: artists.slice(start, start + size), size }
}

/** Round-robin across start decades so a capped playlist is not one era. */
export function playlistCandidates(artists: ArtistRecord[], limit = PLAYLIST_MATCH_CAP): ArtistRecord[] {
  if (artists.length <= limit) return artists
  const buckets = new Map<string, ArtistRecord[]>()
  for (const artist of artists) {
    const year = beginYear(artist)
    const key = year === null ? "unknown" : String(Math.floor(year / 10) * 10)
    const bucket = buckets.get(key) ?? []
    bucket.push(artist)
    buckets.set(key, bucket)
  }
  const keys = [...buckets.keys()].sort()
  const picked: ArtistRecord[] = []
  let index = 0
  while (picked.length < limit) {
    let added = false
    for (const key of keys) {
      const bucket = buckets.get(key) ?? []
      const artist = bucket[index]
      if (!artist) continue
      picked.push(artist)
      added = true
      if (picked.length >= limit) break
    }
    if (!added) break
    index += 1
  }
  return picked
}

export function eraText(artist: ArtistRecord): string | null {
  const begin = yearOf(artist.life_span?.begin)
  const end = yearOf(artist.life_span?.end)
  if (begin && end) return `${begin}–${end}`
  if (begin && artist.life_span?.ended) return String(begin)
  if (begin) return `${begin}–`
  if (end) return `until ${end}`
  return null
}

function spanYears(artist: ArtistRecord, now: Date): { begin: number | null; end: number | null } {
  const begin = yearOf(artist.life_span?.begin)
  const statedEnd = yearOf(artist.life_span?.end)
  if (begin === null) return { begin: statedEnd, end: statedEnd }
  if (statedEnd !== null) return { begin, end: statedEnd }
  if (artist.life_span?.ended === true) return { begin, end: begin }
  return { begin, end: now.getUTCFullYear() }
}

function yearOf(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{4})/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1000 && year <= 2100 ? year : null
}
