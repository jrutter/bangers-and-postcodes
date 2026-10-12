/** Minimum nameConfidence for a gig bill to be treated as that Spotify artist. */
export const GIG_MATCH_CONFIDENCE = 0.86

const TRAILING_NOISE = new Set(["live"])

export type BillRole = "primary" | "support" | "subtitle"

export type BillPiece = {
  name: string
  role: BillRole
}

/**
 * Case, accents, apostrophes, and a leading "The" are ignored.
 * Apostrophes are removed rather than turned into spaces, so Redtenbacher's and Redtenbachers agree.
 */
export function foldName(name: string): string {
  let text = (name || "").normalize("NFD").replace(/\p{M}/gu, "")
  text = text.toLowerCase()
  text = text.replace(/['’ʼ`´]/g, "")
  text = text.replace(/&/g, " and ")
  text = text.replace(/[^\p{L}\p{N}\s]/gu, " ")
  text = text.replace(/\s+/g, " ").trim()
  if (text.startsWith("the ")) text = text.slice(4).trim()
  return text
}

export function nameConfidence(billed: string, spotifyName: string): number {
  const left = foldName(billed)
  const right = foldName(spotifyName)
  if (!left || !right) return 0
  if (left === right) return 1
  const query = left.split(" ")
  const found = right.split(" ")
  if (query.length === 0 || found.length === 0) return 0
  if (isTokenPrefix(found, query)) {
    const extras = query.slice(found.length)
    if (extras.length > 0 && extras.every((token) => TRAILING_NOISE.has(token)) && found.length >= 1 && found[0].length >= 3) {
      return 0.9
    }
  }
  if (found.length >= 2 && query.length === found.length + 1 && query.slice(1).join(" ") === found.join(" ")) return 0.92
  if (
    found.length >= 2 &&
    query.length === found.length + 2 &&
    TRAILING_NOISE.has(query[query.length - 1] ?? "") &&
    query.slice(1, -1).join(" ") === found.join(" ")
  ) {
    return 0.88
  }
  return typoConfidence(left, right)
}

export function pickGigArtist<T extends { name?: string | null; popularity?: number | null }>(
  query: string,
  candidates: T[],
): { artist: T; score: number } | null {
  let best: { artist: T; score: number; popularity: number } | null = null
  for (const artist of candidates) {
    const score = nameConfidence(query, artist.name ?? "")
    if (score < GIG_MATCH_CONFIDENCE) continue
    const popularity = typeof artist.popularity === "number" ? artist.popularity : -1
    if (!best || score > best.score || (score === best.score && popularity > best.popularity)) {
      best = { artist, score, popularity }
    }
  }
  return best ? { artist: best.artist, score: best.score } : null
}

/** Headliner, featured artists, and a dashed subtitle. The full billing string is not rewritten here. */
export function billPieces(raw: string): BillPiece[] {
  const text = stripLiveAt(collapse(raw))
  if (text.length < 2) return []
  const pieces: BillPiece[] = []
  for (const [presentedIndex, presented] of splitKeep(text, /\s+presents:\s*|\s+presents\s+/i).entries()) {
    const featured = splitKeep(presented, /\s+featuring\s+|\s+feat\.?\s+|\s+ft\.?\s+/i)
    featured.forEach((feature, featureIndex) => {
      const people = splitKeep(feature, /\s+with\s+|\s*&\s*|\s*,\s*/i)
      people.forEach((person, personIndex) => {
        const base: BillRole = presentedIndex === 0 && featureIndex === 0 && personIndex === 0 ? "primary" : "support"
        const dashed = splitKeep(person, /\s+-\s+/)
        dashed.forEach((bit, dashIndex) => {
          const name = bit.trim()
          if (!keepPiece(name)) return
          const role: BillRole = base === "primary" && dashIndex > 0 ? "subtitle" : base === "primary" && dashIndex === 0 ? "primary" : "support"
          pieces.push({ name, role })
        })
      })
    })
  }
  return dedupePieces(pieces)
}

export function spotifyArtistIdFrom(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^[A-Za-z0-9]{10,40}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null
    const match = url.pathname.match(/^\/artist\/([A-Za-z0-9]{10,40})\/?$/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * One row per act to show. A confident hit on the whole billing stays as one row.
 * Otherwise featured names are shown, and a dashed subtitle is shown only when it matched.
 * A bill that matches nothing stays as one "no match" row.
 */
export function displayBill(billed: string, lookup: (name: string) => "match" | "miss" | "absent"): string[] {
  const label = collapse(billed)
  if (!label) return []
  if (lookup(label) === "match") return [label]
  const pieces = billPieces(label).filter((piece) => foldName(piece.name) !== foldName(label))
  const rows: string[] = []
  for (const piece of pieces) {
    const state = lookup(piece.name)
    if (state === "match") rows.push(piece.name)
    else if (piece.role !== "subtitle" && state === "miss") rows.push(piece.name)
  }
  if (rows.length === 0) return [label]
  return rows
}

function stripLiveAt(text: string): string {
  return text.replace(/\s+live\s+at\b[\s\S]*$/i, "").trim()
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function splitKeep(text: string, pattern: RegExp): string[] {
  return text
    .split(pattern)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function keepPiece(name: string): boolean {
  const folded = foldName(name)
  return folded.length >= 2 && !TRAILING_NOISE.has(folded)
}

function dedupePieces(pieces: BillPiece[]): BillPiece[] {
  const seen = new Set<string>()
  const result: BillPiece[] = []
  for (const piece of pieces) {
    const key = foldName(piece.name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(piece)
  }
  return result
}

function isTokenPrefix(found: string[], query: string[]): boolean {
  if (found.length === 0 || found.length > query.length) return false
  return found.every((token, index) => query[index] === token)
}

function typoConfidence(left: string, right: string): number {
  const difference = Math.abs(left.length - right.length)
  if (difference > 1) return 0
  const max = Math.max(left.length, right.length)
  if (max < 10) return 0
  if (levenshtein(left, right) !== 1) return 0
  return 0.9
}

function levenshtein(left: string, right: string): number {
  const a = [...left]
  const b = [...right]
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }
  return previous[b.length]
}
