import { describe, expect, it, vi } from "vitest"

import { gigScopePhrase, parseScope, scopeValue } from "@/lib/catalogue"
import { addDays, londonDate, outwardCode } from "@/lib/geo"
import { LONDON_DISTRICTS } from "@/lib/districts"
import { collectRegionalGigs } from "@/lib/gigs/collect"
import { TILE_RADIUS_MILES } from "@/lib/gigs/constants"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { artistRecordsForGigs, listingVenues, placeGigPostcodes, selectGigs, venueForGig, weekCountsByRegion } from "@/lib/gigs/select"
import { parseSkiddle, skiddleProvider } from "@/lib/gigs/skiddle"
import { londonSearchTiles } from "@/lib/gigs/tiles"
import { milesBetween } from "@/lib/geo"
import { parseTicketmaster } from "@/lib/gigs/ticketmaster"
import { gigPlaylistDescription } from "@/lib/playlist"
import type { Gig } from "@/lib/gigs/types"

const NOW = new Date("2026-10-11T12:00:00.000Z")

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv
}

describe("gig providers", () => {
  it("stays empty and does not call the network when no keys are set", async () => {
    const fetchImpl = vi.fn()
    const feed = await collectRegionalGigs({ env: env(), fetchImpl: fetchImpl as typeof fetch, now: NOW })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(feed.gigs).toEqual([])
    expect(feed.providers.map((provider) => provider.configured)).toEqual([false, false])
    expect(gigProviderFingerprint(env())).toBe("none")
    expect(gigProviderFingerprint(env({ SKIDDLE_API_KEY: "a", TICKETMASTER_API_KEY: "b" }))).toBe(
      "skiddle+ticketmaster",
    )
  })

  it("parses a Skiddle bill and keeps London events from every tile", async () => {
    const centres = new Set<string>()
    const fetchImpl = mockFetch((url) => {
      if (url.hostname === "www.skiddle.com") {
        centres.add(`${url.searchParams.get("latitude")},${url.searchParams.get("longitude")}`)
        expect(url.searchParams.get("api_key")).toBe("skiddle-key")
        expect(url.searchParams.get("radius")).toBe("8")
        expect(url.searchParams.get("minDate")).toBe("2026-10-11")
        if (url.searchParams.get("eventcode") === "CLUB") return { body: { error: 0, totalcount: 0, results: [] } }
        return { body: skiddlePayload() }
      }
      expect(url.hostname).toBe("app.ticketmaster.com")
      expect(url.searchParams.get("apikey")).toBe("tm-key")
      expect(url.searchParams.get("classificationName")).toBe("music")
      expect(url.searchParams.get("countryCode")).toBe("GB")
      expect(url.searchParams.get("unit")).toBe("miles")
      return { body: ticketmasterPayload() }
    })
    const feed = await collectRegionalGigs({
      env: env({ SKIDDLE_API_KEY: "skiddle-key", TICKETMASTER_API_KEY: "tm-key" }),
      fetchImpl,
      now: NOW,
    })
    const names = feed.gigs.flatMap((gig) => gig.artistNames)
    expect(names).toContain("Wet Leg")
    expect(names).toContain("Touring Guest")
    expect(names).not.toContain("Golf Classic")
    expect(names).toContain("Brixton Headliner")
    expect(feed.gigs.filter((gig) => gig.artistNames.includes("Wet Leg"))).toHaveLength(1)
    expect(feed.gigs.some((gig) => gig.postcode === "M1 1AE")).toBe(false)
    expect(centres.size).toBeGreaterThan(1)

    const nearPutney = selectGigs(feed.gigs, { kind: "postcode", postcode: "SW15" }, "upcoming", NOW)
    expect(nearPutney.some((gig) => gig.artistNames.includes("Touring Guest"))).toBe(true)
    expect(nearPutney.some((gig) => gig.venueId === "half-moon")).toBe(true)

    const week = selectGigs(feed.gigs, { kind: "southwest" }, "week", NOW)
    expect(artistRecordsForGigs(week).map((artist) => artist.name)).toEqual(["Wet Leg", "Touring Guest"])
    expect(artistRecordsForGigs(week).map((artist) => artist.name)).not.toContain("Open Mic")

    const later = selectGigs(feed.gigs, { kind: "southwest" }, "later", NOW)
    expect(later.map((gig) => gig.artistNames[0])).toEqual(["Too Late", "Wimbledon Opener"])

    const city = selectGigs(feed.gigs, { kind: "london" }, "week", NOW)
    expect(city.some((gig) => gig.artistNames.includes("Brixton Headliner"))).toBe(true)
    const southwest = selectGigs(feed.gigs, { kind: "region", regionId: "southwest" }, "week", NOW)
    expect(southwest.some((gig) => gig.artistNames.includes("Brixton Headliner"))).toBe(true)
    expect(southwest.some((gig) => gig.artistNames.includes("Wet Leg"))).toBe(true)
    const east = selectGigs(feed.gigs, { kind: "region", regionId: "east" }, "week", NOW)
    expect(east).toEqual([])
    const counts = weekCountsByRegion(feed.gigs, NOW)
    expect(counts.find((row) => row.id === "southwest")?.count).toBeGreaterThan(0)
    expect(counts.reduce((sum, row) => sum + row.count, 0)).toBe(city.length)
  })

  it("keeps the other provider when one request fails, and does not echo the key", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.hostname === "www.skiddle.com") {
        return { body: { error: 1, errormessage: "rejected api_key=super-secret" } }
      }
      return { status: 500, body: { fault: { faultstring: "no" } } }
    })
    const feed = await collectRegionalGigs({
      env: env({ SKIDDLE_API_KEY: "super-secret", TICKETMASTER_API_KEY: "tm-secret" }),
      fetchImpl,
      now: NOW,
    })
    const skiddle = feed.providers.find((provider) => provider.id === "skiddle")
    const ticketmaster = feed.providers.find((provider) => provider.id === "ticketmaster")
    expect(skiddle?.error).toContain("redacted")
    expect(skiddle?.error).not.toContain("super-secret")
    expect(ticketmaster?.error).toBe("Ticketmaster returned 500.")
    expect(ticketmaster?.error).not.toContain("tm-secret")
    expect(feed.gigs).toEqual([])
  })

  it("pages one Skiddle tile when the first page is full", async () => {
    const offsets: string[] = []
    const fetchImpl = mockFetch((url) => {
      offsets.push(`${url.searchParams.get("eventcode")}:${url.searchParams.get("offset")}`)
      if (url.searchParams.get("eventcode") === "CLUB") return { body: { error: 0, totalcount: 0, results: [] } }
      const offset = Number(url.searchParams.get("offset"))
      const count = offset === 0 ? 100 : 1
      return {
        body: {
          error: 0,
          totalcount: 101,
          results: Array.from({ length: count }, (_, index) => ({
            id: String(offset + index + 1),
            eventname: "Away Band",
            date: "2026-12-01",
            venue: { name: "Somewhere Else", postcode: "M1 1AA", town: "Manchester" },
          })),
        },
      }
    })
    await skiddleProvider.search(
      { latitude: 51.5, longitude: -0.12, radiusMiles: 8, from: "2026-10-11", to: "2027-01-09" },
      { env: env({ SKIDDLE_API_KEY: "skiddle-key" }), fetchImpl, paceMs: 0 },
    )
    expect(offsets.sort()).toEqual(["CLUB:0", "LIVE:0", "LIVE:100"])
  })

  it("covers every Greater London district with an overlapping tile", () => {
    const tiles = londonSearchTiles()
    expect(tiles.length).toBeGreaterThan(4)
    expect(tiles.length).toBeLessThanOrEqual(24)
    expect(tiles.every((tile) => tile.radiusMiles === TILE_RADIUS_MILES)).toBe(true)
    const missed = LONDON_DISTRICTS.filter(
      (district) => !tiles.some((tile) => milesBetween(tile, district) <= TILE_RADIUS_MILES),
    )
    expect(missed).toEqual([])
  })
})

describe("gig selection", () => {
  it("reads outward codes and London dates", () => {
    expect(outwardCode("SW15 1EU")).toBe("SW15")
    expect(outwardCode("sw6 6qe")).toBe("SW6")
    expect(outwardCode("KT2 6QA")).toBe("KT2")
    expect(outwardCode("EC1A 1BB")).toBe("EC1A")
    expect(outwardCode("not a postcode")).toBeNull()
    expect(londonDate(NOW)).toBe("2026-10-11")
    expect(addDays("2026-10-11", 6)).toBe("2026-10-17")
  })

  it("keeps an unmatched London room beside the gig and files it by region", () => {
    const unmatched = gig({
      id: "e8-room",
      artistNames: ["Hackney Bill"],
      venueName: "The Unlisted Room",
      postcode: "E8 3RL",
      latitude: 51.54,
      longitude: -0.06,
      date: "2026-10-12",
    })
    const week = selectGigs([unmatched], { kind: "region", regionId: "east" }, "week", NOW)
    expect(week).toHaveLength(1)
    expect(week[0]?.venueId).toBeNull()
    expect(listingVenues(week)).toEqual([
      { id: "listing-unlisted-room-e8", name: "The Unlisted Room", postcode: "E8 3RL", district: "E8" },
    ])
    expect(weekCountsByRegion([unmatched], NOW).find((row) => row.id === "east")?.count).toBe(1)
  })

  it("matches a Putney room and leaves a Manchester one alone", () => {
    const putney = venueForGig(gig({ venueName: "Half Moon Putney", postcode: "SW15 1EU" }))
    const manchester = venueForGig(gig({ venueName: "The Half Moon", postcode: "M1 1AE", latitude: 53.48, longitude: -2.24 }))
    expect(putney?.id).toBe("half-moon")
    expect(manchester).toBeNull()
  })

  it("keeps Balham on the Wandsworth borough list and Twickenham on the Richmond borough list", () => {
    expect(placeGigPostcodes("wandsworth-borough")).toContain("SW12")
    expect(placeGigPostcodes("richmond-borough")).toEqual(expect.arrayContaining(["TW9", "TW10", "TW1"]))
    const bedford = selectGigs(
      [gig({ artistNames: ["Balham Bill"], venueName: "The Bedford", postcode: "SW12 9HD", date: "2026-10-12" })],
      { kind: "postcode", postcode: "SW18" },
      "upcoming",
      NOW,
    )
    const borough = selectGigs(
      [gig({ artistNames: ["Balham Bill"], venueName: "The Bedford", postcode: "SW12 9HD", date: "2026-10-12" })],
      { kind: "place", placeId: "wandsworth-borough" },
      "upcoming",
      NOW,
    )
    expect(bedford).toEqual([])
    expect(borough).toHaveLength(1)
  })

  it("parses gig playlist scopes", () => {
    expect(scopeValue(parseScope("week:SW15")!)).toBe("week:SW15")
    expect(scopeValue(parseScope("week:putney")!)).toBe("week:putney")
    expect(parseScope("week:all")).toEqual({ kind: "week", focus: "all" })
    expect(parseScope("venue:half-moon")).toEqual({ kind: "venue", venueId: "half-moon" })
    expect(parseScope("venue:not-a-room")).toBeNull()
    expect(parseScope("week:NOPE")).toBeNull()
    const week = parseScope("week:SW15")
    expect(week && week.kind === "week" ? gigScopePhrase(week) : "").toBe("near SW15 in the next 7 days")
    expect(gigPlaylistDescription("near SW15 in the next 7 days").length).toBeLessThanOrEqual(300)
  })
})

describe("provider payloads", () => {
  it("drops an http ticket link and a non-music Ticketmaster event", () => {
    const skiddle = parseSkiddle({
      error: 0,
      totalcount: 1,
      results: [
        {
          id: "9",
          eventname: "Wet Leg",
          link: "http://insecure.example/tickets",
          date: "2026-10-20",
          startdate: "2026-10-20T19:30:00+01:00",
          artists: [{ name: "Wet Leg" }],
          venue: { name: "The Half Moon", postcode: "SW15 1EU", latitude: 51.46, longitude: -0.22 },
        },
      ],
    })
    expect(skiddle.gigs[0]?.ticketUrl).toBeNull()
    expect(skiddle.gigs[0]?.startsAt).toBe("2026-10-20T18:30:00.000Z")
    expect(skiddle.gigs[0]?.date).toBe("2026-10-20")

    const ticketmaster = parseTicketmaster({
      page: { totalPages: 1 },
      _embedded: {
        events: [
          {
            id: "sports",
            name: "Golf Classic",
            dates: { start: { localDate: "2026-10-20" }, status: { code: "onsale" } },
            classifications: [{ segment: { name: "Sports" } }],
            _embedded: { venues: [{ name: "Somewhere", postalCode: "SW15 1EU", country: { countryCode: "GB" } }] },
          },
        ],
      },
    })
    expect(ticketmaster.gigs).toEqual([])
  })
})

function skiddlePayload() {
  return {
    error: 0,
    totalcount: 3,
    results: [
      {
        id: "1",
        eventname: "Wet Leg",
        link: "https://www.skiddle.com/e/1",
        date: "2026-10-12",
        startdate: "2026-10-12T19:30:00+01:00",
        artists: [{ name: "Wet Leg" }],
        venue: {
          name: "The Half Moon",
          address: "93 Lower Richmond Road",
          town: "London",
          postcode: "SW15 1EU",
          latitude: 51.46726,
          longitude: -0.22007,
        },
      },
      {
        id: "2",
        eventname: "Open Mic",
        date: "2026-10-13",
        artists: [{ name: "Open Mic" }],
        venue: { name: "The Half Moon", postcode: "SW15 1EU" },
      },
      {
        id: "3",
        eventname: "Too late",
        date: "2026-10-18",
        artists: [{ name: "Too Late" }],
        venue: { name: "The Half Moon", postcode: "SW15 1EU" },
      },
    ],
  }
}

function ticketmasterPayload() {
  return {
    page: { totalPages: 1 },
    _embedded: {
      events: [
        {
          id: "dup",
          name: "Wet Leg",
          url: "https://www.ticketmaster.co.uk/wet-leg",
          dates: { start: { localDate: "2026-10-12", localTime: "19:30:00", dateTime: "2026-10-12T18:30:00Z" }, status: { code: "onsale" } },
          classifications: [{ segment: { name: "Music" } }],
          _embedded: {
            attractions: [{ name: "Wet Leg", classifications: [{ segment: { name: "Music" } }] }],
            venues: [
              {
                name: "The Half Moon",
                postalCode: "SW15 1EU",
                city: { name: "London" },
                country: { countryCode: "GB" },
                address: { line1: "93 Lower Richmond Road" },
                location: { latitude: "51.46726", longitude: "-0.22007" },
              },
            ],
          },
        },
        {
          id: "guest",
          name: "Touring Guest",
          url: "https://www.ticketmaster.co.uk/guest",
          dates: { start: { localDate: "2026-10-14", dateTime: "2026-10-14T19:00:00Z" }, status: { code: "onsale" } },
          classifications: [{ segment: { name: "Music" } }],
          _embedded: {
            attractions: [{ name: "Touring Guest" }],
            venues: [
              {
                name: "The Half Moon",
                postalCode: "SW15 1EU",
                country: { countryCode: "GB" },
                location: { latitude: "51.46726", longitude: "-0.22007" },
              },
            ],
          },
        },
        {
          id: "later",
          name: "Wimbledon Opener",
          url: "https://www.ticketmaster.co.uk/opener",
          dates: { start: { localDate: "2026-11-02", dateTime: "2026-11-02T19:00:00Z" } },
          classifications: [{ segment: { name: "Music" } }],
          _embedded: {
            attractions: [{ name: "Wimbledon Opener" }],
            venues: [
              {
                name: "New Wimbledon Theatre",
                postalCode: "SW19 1QG",
                country: { countryCode: "GB" },
              },
            ],
          },
        },
        {
          id: "sports",
          name: "Golf Classic",
          dates: { start: { localDate: "2026-10-20" } },
          classifications: [{ segment: { name: "Sports" }, genre: { name: "Golf" } }],
          _embedded: {
            attractions: [{ name: "Golf Classic" }],
            venues: [{ name: "New Wimbledon Theatre", postalCode: "SW19 1QG", country: { countryCode: "GB" } }],
          },
        },
        {
          id: "brixton",
          name: "Brixton Headliner",
          dates: { start: { localDate: "2026-10-15" } },
          classifications: [{ segment: { name: "Music" } }],
          _embedded: {
            attractions: [{ name: "Brixton Headliner" }],
            venues: [{ name: "O2 Academy Brixton", postalCode: "SW9 9SL", country: { countryCode: "GB" } }],
          },
        },
        {
          id: "manchester",
          name: "Manchester Bill",
          dates: { start: { localDate: "2026-10-16" } },
          classifications: [{ segment: { name: "Music" } }],
          _embedded: {
            attractions: [{ name: "Manchester Bill" }],
            venues: [{ name: "The Half Moon", postalCode: "M1 1AE", country: { countryCode: "GB" }, location: { latitude: "53.48", longitude: "-2.24" } }],
          },
        },
        {
          id: "cancelled",
          name: "Cancelled Bill",
          dates: { start: { localDate: "2026-10-16" }, status: { code: "cancelled" } },
          classifications: [{ segment: { name: "Music" } }],
          _embedded: {
            venues: [{ name: "The Bull's Head", postalCode: "SW13 9PY", country: { countryCode: "GB" } }],
            attractions: [{ name: "Cancelled Bill" }],
          },
        },
      ],
    },
  }
}

function gig(overrides: Partial<Gig>): Gig {
  return {
    id: "fixture",
    provider: "skiddle",
    title: "Fixture",
    artistNames: ["Fixture"],
    venueName: "The Half Moon",
    address: null,
    town: "London",
    postcode: "SW15 1EU",
    latitude: 51.46726,
    longitude: -0.22007,
    startsAt: null,
    date: "2026-10-12",
    doorTime: null,
    ticketUrl: null,
    ...overrides,
  }
}

function mockFetch(handler: (url: URL) => { status?: number; body: unknown }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw)
    const result = handler(url)
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
}
