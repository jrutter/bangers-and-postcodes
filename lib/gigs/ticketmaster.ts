import { GIG_MAX_PAGES, GIG_PAGE_SIZE } from "@/lib/gigs/constants"
import { GigProviderError, asRecord, getJson, httpsUrl, numberField, stringField } from "@/lib/gigs/http"
import { pace, takeRequest } from "@/lib/gigs/pace"
import type { Gig, GigDeps, GigProvider, GigSearch } from "@/lib/gigs/types"
import { namesMatch } from "@/lib/names"
import { envValue } from "@/lib/oauth"
import { londonDate } from "@/lib/geo"

const SEARCH_URL = "https://app.ticketmaster.com/discovery/v2/events.json"

export const ticketmasterProvider: GigProvider = {
  id: "ticketmaster",
  label: "Ticketmaster",
  configured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(envValue("TICKETMASTER_API_KEY", env))
  },
  async search(query: GigSearch, deps?: GigDeps): Promise<Gig[]> {
    const env = deps?.env ?? process.env
    const apiKey = envValue("TICKETMASTER_API_KEY", env)
    if (!apiKey) return []
    const fetchImpl = deps?.fetchImpl ?? fetch
    const gigs: Gig[] = []
    for (let page = 0; page < GIG_MAX_PAGES; page += 1) {
      if (!takeRequest(deps?.requests)) break
      await pace("ticketmaster", deps?.paceMs ?? 0)
      const url = new URL(SEARCH_URL)
      url.searchParams.set("apikey", apiKey)
      url.searchParams.set("latlong", `${query.latitude},${query.longitude}`)
      url.searchParams.set("radius", String(query.radiusMiles))
      url.searchParams.set("unit", "miles")
      url.searchParams.set("classificationName", "music")
      url.searchParams.set("countryCode", "GB")
      url.searchParams.set("locale", "en-gb")
      url.searchParams.set("startDateTime", `${query.from}T00:00:00Z`)
      url.searchParams.set("endDateTime", `${query.to}T23:59:59Z`)
      url.searchParams.set("sort", "date,asc")
      url.searchParams.set("size", String(GIG_PAGE_SIZE))
      url.searchParams.set("page", String(page))
      const body = await getJson(fetchImpl, url.toString(), "Ticketmaster")
      const parsed = parseTicketmaster(body)
      gigs.push(...parsed.gigs)
      if (page + 1 >= parsed.totalPages) break
    }
    return gigs
  },
}

export function parseTicketmaster(body: unknown): { gigs: Gig[]; totalPages: number } {
  const record = asRecord(body)
  if (!record) return { gigs: [], totalPages: 1 }
  const fault = asRecord(record.fault)
  if (fault) {
    throw new GigProviderError(stringField(fault, "faultstring") || "Ticketmaster rejected the request.")
  }
  const embedded = asRecord(record._embedded)
  const events = embedded && Array.isArray(embedded.events) ? embedded.events : []
  const gigs = events.flatMap((item) => {
    const gig = parseEvent(item)
    return gig ? [gig] : []
  })
  const page = asRecord(record.page)
  const totalPages = Math.max(1, numberField(page, "totalPages") ?? 1)
  return { gigs, totalPages }
}

function parseEvent(value: unknown): Gig | null {
  const event = asRecord(value)
  if (!event || event.test === true) return null
  if (!isMusicEvent(event)) return null
  const dates = asRecord(event.dates)
  const status = dates ? asRecord(dates.status) : null
  const statusCode = stringField(status, "code")
  if (statusCode && /cancel/i.test(statusCode)) return null
  const start = dates ? asRecord(dates.start) : null
  if (start?.dateTBA === true || start?.dateTBD === true) return null
  const id = stringField(event, "id")
  const embedded = asRecord(event._embedded)
  const venue = firstRecord(embedded?.venues)
  const venueName = stringField(venue, "name")
  if (!id || !venueName) return null
  const country = asRecord(venue?.country)
  const countryCode = stringField(country, "countryCode")
  if (countryCode && countryCode.toUpperCase() !== "GB") return null
  const localDate = stringField(start, "localDate")
  const dateTime = stringField(start, "dateTime")
  const startsAt = dateTime ? zoned(dateTime) : null
  const date = localDate || (startsAt ? londonDate(new Date(startsAt)) : null)
  if (!date) return null
  const city = asRecord(venue?.city)
  const address = asRecord(venue?.address)
  const location = asRecord(venue?.location)
  const artists = attractionNames(embedded, venueName)
  const title = stringField(event, "name") || artists[0] || venueName
  return {
    id: `ticketmaster:${id}`,
    provider: "ticketmaster",
    title,
    artistNames: artists.length > 0 ? artists : title && !namesMatch(title, venueName) ? [title] : [],
    venueName,
    address: stringField(address, "line1"),
    town: stringField(city, "name"),
    postcode: stringField(venue, "postalCode"),
    latitude: numberField(location, "latitude"),
    longitude: numberField(location, "longitude"),
    startsAt,
    date,
    doorTime: clock(stringField(start, "localTime")),
    ticketUrl: httpsUrl(stringField(event, "url")),
  }
}

function isMusicEvent(event: Record<string, unknown>): boolean {
  const classifications = Array.isArray(event.classifications) ? event.classifications : []
  if (classifications.length === 0) return true
  return classifications.some((item) => {
    const record = asRecord(item)
    const segment = stringField(asRecord(record?.segment), "name")
    const genre = stringField(asRecord(record?.genre), "name")
    return Boolean((segment && /music/i.test(segment)) || (genre && /music/i.test(genre)))
  })
}

function attractionNames(embedded: Record<string, unknown> | null, venueName: string): string[] {
  const attractions = embedded && Array.isArray(embedded.attractions) ? embedded.attractions : []
  const names: string[] = []
  for (const item of attractions) {
    const record = asRecord(item)
    const name = stringField(record, "name")
    if (!name || namesMatch(name, venueName)) continue
    const classifications = record && Array.isArray(record.classifications) ? record.classifications : []
    const segments = classifications.map((classification) => stringField(asRecord(asRecord(classification)?.segment), "name"))
    const known = segments.filter((segment): segment is string => Boolean(segment))
    if (known.length > 0 && !known.some((segment) => /music/i.test(segment))) continue
    names.push(name)
  }
  return names
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return asRecord(value[0])
}

function zoned(value: string): string | null {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function clock(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{2}:\d{2})/)
  return match ? match[1] : null
}
