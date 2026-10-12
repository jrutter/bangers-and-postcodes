import { billPieces, spotifyArtistIdFrom } from "@/lib/gigs/bill"
import { GIG_MAX_PAGES, GIG_PAGE_SIZE } from "@/lib/gigs/constants"
import { GigProviderError, asRecord, getJson, httpsUrl, numberField, stringField } from "@/lib/gigs/http"
import { pace, takeRequest } from "@/lib/gigs/pace"
import type { Gig, GigDeps, GigProvider, GigSearch } from "@/lib/gigs/types"
import { envValue } from "@/lib/oauth"

const SEARCH_URL = "https://www.skiddle.com/api/v1/events/search/"
const EVENT_CODES = ["LIVE", "CLUB"] as const

export const skiddleProvider: GigProvider = {
  id: "skiddle",
  label: "Skiddle",
  configured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(envValue("SKIDDLE_API_KEY", env))
  },
  async search(query: GigSearch, deps?: GigDeps): Promise<Gig[]> {
    const env = deps?.env ?? process.env
    const apiKey = envValue("SKIDDLE_API_KEY", env)
    if (!apiKey) return []
    const fetchImpl = deps?.fetchImpl ?? fetch
    const gigs: Gig[] = []
    for (const code of EVENT_CODES) {
      gigs.push(...(await searchCode(fetchImpl, apiKey, query, code, deps)))
    }
    return gigs
  },
}

async function searchCode(
  fetchImpl: typeof fetch,
  apiKey: string,
  query: GigSearch,
  eventCode: (typeof EVENT_CODES)[number],
  deps?: GigDeps,
): Promise<Gig[]> {
  const gigs: Gig[] = []
  for (let page = 0; page < GIG_MAX_PAGES; page += 1) {
    if (!takeRequest(deps?.requests)) break
    await pace("skiddle", deps?.paceMs ?? 0)
    const offset = page * GIG_PAGE_SIZE
    const url = new URL(SEARCH_URL)
    url.searchParams.set("api_key", apiKey)
    url.searchParams.set("latitude", String(query.latitude))
    url.searchParams.set("longitude", String(query.longitude))
    url.searchParams.set("radius", String(query.radiusMiles))
    url.searchParams.set("eventcode", eventCode)
    url.searchParams.set("minDate", query.from)
    url.searchParams.set("maxDate", query.to)
    url.searchParams.set("order", "date")
    url.searchParams.set("description", "1")
    url.searchParams.set("limit", String(GIG_PAGE_SIZE))
    url.searchParams.set("offset", String(offset))
    const body = await getJson(fetchImpl, url.toString(), "Skiddle")
    const parsed = parseSkiddle(body)
    gigs.push(...parsed.gigs)
    const fetched = offset + parsed.resultCount
    if (parsed.resultCount < GIG_PAGE_SIZE) break
    if (parsed.total != null && fetched >= parsed.total) break
  }
  return gigs
}

export function parseSkiddle(body: unknown): { gigs: Gig[]; total: number | null; resultCount: number } {
  const record = asRecord(body)
  if (!record) return { gigs: [], total: null, resultCount: 0 }
  const errorCode = record.error
  if (errorCode === 1 || errorCode === "1" || errorCode === true) {
    throw new GigProviderError(stringField(record, "errormessage", "error_description") || "Skiddle rejected the request.")
  }
  const results = Array.isArray(record.results) ? record.results : []
  const gigs = results.flatMap((item) => {
    const gig = parseEvent(item)
    return gig ? [gig] : []
  })
  return { gigs, total: numberField(record, "totalcount", "totalCount"), resultCount: results.length }
}

function parseEvent(value: unknown): Gig | null {
  const record = asRecord(value)
  if (!record) return null
  const id = stringField(record, "id")
  const venue = asRecord(record.venue)
  const venueName = stringField(venue, "name") || stringField(record, "venuename", "venue_name")
  if (!id || !venueName) return null
  const dated = parseWhen(stringField(record, "startdate") || stringField(record, "date"))
  const date = dated.date || dateOnly(stringField(record, "date"))
  if (!date) return null
  const opening = asRecord(record.openingtimes)
  const doorTime = clock(stringField(opening, "doorsopen")) || dated.doorTime
  const listed = listedArtists(record)
  const title = stringField(record, "eventname", "name") || listed.names[0] || venueName
  const names = listed.names.length > 0 ? listed.names : fallbackArtist(title, venueName)
  return {
    id: `skiddle:${id}`,
    provider: "skiddle",
    title,
    artistNames: names,
    ...(Object.keys(listed.ids).length > 0 ? { artistSpotifyIds: listed.ids } : {}),
    venueName,
    address: stringField(venue, "address") || stringField(record, "address"),
    town: stringField(venue, "town") || stringField(record, "town"),
    postcode: stringField(venue, "postcode") || stringField(record, "postcode"),
    latitude: numberField(venue, "latitude") ?? numberField(record, "latitude"),
    longitude: numberField(venue, "longitude") ?? numberField(record, "longitude"),
    startsAt: dated.startsAt,
    date,
    doorTime,
    ticketUrl: httpsUrl(stringField(record, "link", "url")),
  }
}

function listedArtists(record: Record<string, unknown>): { names: string[]; ids: Record<string, string> } {
  const raw = record.artists ?? record.artist
  const items = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? [raw] : []
  const names: string[] = []
  const ids: Record<string, string> = {}
  for (const item of items) {
    if (typeof item === "string" && item.trim()) {
      names.push(item.trim())
      continue
    }
    const artist = asRecord(item)
    const name = stringField(artist, "name", "artistname")
    if (!name) continue
    names.push(name)
    const spotifyId = spotifyArtistIdFrom(
      stringField(artist, "spotifyartisturl", "spotifyurl", "spotify_url", "spotify", "spotifyartistid", "spotifyid"),
    )
    if (!spotifyId) continue
    const primary = billPieces(name).find((piece) => piece.role === "primary")?.name ?? name
    if (!ids[primary]) ids[primary] = spotifyId
  }
  return { names, ids }
}

function fallbackArtist(title: string, venueName: string): string[] {
  const head = title.split(/\s+at\s+/i)[0]?.trim() || title
  if (!head || head.toLowerCase() === venueName.toLowerCase()) return []
  return [head]
}

function parseWhen(value: string | null): { startsAt: string | null; date: string | null; doorTime: string | null } {
  if (!value) return { startsAt: null, date: null, doorTime: null }
  const date = dateOnly(value)
  let iso = value.trim().replace(" ", "T")
  iso = iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { startsAt: null, date, doorTime: null }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return { startsAt: null, date, doorTime: null }
  const doorTime = clock(iso.slice(11, 16))
  return { startsAt: parsed.toISOString(), date: date || parsed.toISOString().slice(0, 10), doorTime }
}

function dateOnly(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function clock(value: string | null): string | null {
  if (!value) return null
  const match = value.trim().match(/^(\d{1,2}:\d{2})/)
  return match ? match[1] : null
}
