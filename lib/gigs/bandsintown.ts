import { readArtistIndex } from "@/lib/page-data"
import {
  BANDSINTOWN_REVALIDATE_SECONDS,
  BANDSINTOWN_REQUEST_BUDGET,
  GIG_REVALIDATE_SECONDS,
} from "@/lib/gigs/constants"
import { GigProviderError, asRecord, httpsUrl, numberField, scrubSecrets, stringField } from "@/lib/gigs/http"
import { normalizeName } from "@/lib/names"
import { pace, takeRequest } from "@/lib/gigs/pace"
import type { Gig, GigCitySearch, GigDeps, GigProvider } from "@/lib/gigs/types"
import { envValue } from "@/lib/oauth"

const EVENTS_URL = "https://rest.bandsintown.com/artists"

export const bandsintownProvider: GigProvider = {
  id: "bandsintown",
  label: "Bandsintown",
  configured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(envValue("BANDSINTOWN_APP_ID", env))
  },
  async search(): Promise<Gig[]> {
    return []
  },
  searchCity(query: GigCitySearch, deps?: GigDeps): Promise<Gig[]> {
    return searchBandsintown(query, deps)
  },
}

/** Stable catalogue slice. Each cache fill asks for the next group of artists. */
export function bandsintownArtists(names: string[], now: Date, budget: number): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  const sorted = [...names].sort((left, right) => left.localeCompare(right, "en"))
  for (const name of sorted) {
    const trimmed = name.trim()
    const key = normalizeName(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(trimmed)
  }
  if (unique.length === 0 || budget <= 0) return []
  const slots = Math.ceil(unique.length / budget)
  const slot = Math.floor(now.getTime() / (GIG_REVALIDATE_SECONDS * 1000)) % slots
  const start = slot * budget
  return unique.slice(start, start + budget)
}

export function parseBandsintown(body: unknown, artistName: string, window?: { from: string; to: string }): Gig[] {
  if (!Array.isArray(body)) return []
  return body.flatMap((item) => {
    const gig = parseEvent(item, artistName)
    if (!gig) return []
    if (window && gig.date && (gig.date < window.from || gig.date > window.to)) return []
    return [gig]
  })
}

async function searchBandsintown(query: GigCitySearch, deps?: GigDeps): Promise<Gig[]> {
  const env = deps?.env ?? process.env
  const appId = envValue("BANDSINTOWN_APP_ID", env)
  if (!appId) return []
  const budget = deps?.requests?.current ?? BANDSINTOWN_REQUEST_BUDGET
  const source = deps?.artistNames ?? readArtistIndex().map((artist) => artist.name)
  const names = bandsintownArtists(source, query.now, budget)
  const fetchImpl = deps?.fetchImpl ?? fetch
  const gigs: Gig[] = []
  let failures = 0
  for (const name of names) {
    if (!takeRequest(deps?.requests)) break
    let body: unknown
    try {
      body = await fetchEvents(fetchImpl, appId, name, query, deps?.paceMs ?? 0)
    } catch (error) {
      failures += 1
      if (failures >= 3) {
        if (gigs.length > 0) break
        throw error
      }
      continue
    }
    if (body == null) continue
    gigs.push(...parseBandsintown(body, name, query))
  }
  return gigs
}

async function fetchEvents(
  fetchImpl: typeof fetch,
  appId: string,
  artistName: string,
  query: GigCitySearch,
  paceMs: number,
): Promise<unknown> {
  await pace("bandsintown", paceMs)
  const url = new URL(`${EVENTS_URL}/${encodeURIComponent(artistName)}/events`)
  url.searchParams.set("app_id", appId)
  url.searchParams.set("date", `${query.from},${query.to}`)
  let response: Response
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "bangers-and-postcodes" },
      next: { revalidate: BANDSINTOWN_REVALIDATE_SECONDS, tags: ["gigs"] },
    })
  } catch {
    throw new GigProviderError("Bandsintown could not be reached.")
  }
  if (response.status === 404) return []
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new GigProviderError(`Bandsintown returned ${response.status} and no JSON.`)
  }
  if (!response.ok) throw new GigProviderError(scrubSecrets(`Bandsintown returned ${response.status}.`))
  return body
}

function parseEvent(value: unknown, artistName: string): Gig | null {
  const record = asRecord(value)
  if (!record) return null
  const venue = asRecord(record.venue)
  const venueName = stringField(venue, "name")
  const id = stringField(record, "id")
  if (!id || !venueName) return null
  const country = stringField(venue, "country")
  if (country && !inUnitedKingdom(country)) return null
  const dated = parseWhen(stringField(record, "datetime"))
  if (!dated.date) return null
  const lineup = lineupNames(record.lineup, artistName)
  const title = stringField(record, "title", "description") || lineup[0] || artistName
  return {
    id: `bandsintown:${id}`,
    provider: "bandsintown",
    title,
    artistNames: lineup,
    venueName,
    address: stringField(venue, "location"),
    town: stringField(venue, "city"),
    postcode: stringField(venue, "postal_code", "postalcode", "postcode"),
    latitude: numberField(venue, "latitude"),
    longitude: numberField(venue, "longitude"),
    startsAt: dated.startsAt,
    date: dated.date,
    doorTime: dated.doorTime,
    ticketUrl: ticketUrl(record),
  }
}

function lineupNames(value: unknown, artistName: string): string[] {
  const names = Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])) : []
  if (names.length > 0) return names
  const fallback = artistName.trim()
  return fallback ? [fallback] : []
}

function ticketUrl(record: Record<string, unknown>): string | null {
  const offers = Array.isArray(record.offers) ? record.offers : []
  for (const offer of offers) {
    const url = httpsUrl(stringField(asRecord(offer), "url"))
    if (url) return url
  }
  return httpsUrl(stringField(record, "url"))
}

function parseWhen(value: string | null): { startsAt: string | null; date: string | null; doorTime: string | null } {
  if (!value) return { startsAt: null, date: null, doorTime: null }
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/)
  if (!match) return { startsAt: null, date: null, doorTime: null }
  const date = match[1]
  const doorTime = match[2] ?? null
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value.trim())) {
    const parsed = new Date(value.trim())
    if (!Number.isNaN(parsed.getTime())) {
      return { startsAt: parsed.toISOString(), date, doorTime }
    }
  }
  return { startsAt: null, date, doorTime }
}

function inUnitedKingdom(country: string): boolean {
  const value = country.toLowerCase()
  return (
    value === "united kingdom" ||
    value === "uk" ||
    value === "gb" ||
    value === "great britain" ||
    value === "england" ||
    value === "scotland" ||
    value === "wales" ||
    value === "northern ireland"
  )
}
