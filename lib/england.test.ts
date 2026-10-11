import { describe, expect, it } from "vitest"

import { parseScope, scopeValue } from "@/lib/catalogue"
import {
  ENGLAND_AREA_MBID,
  UNITED_KINGDOM_AREA_MBID,
  assembleFavourites,
  catalogueLinks,
  classifyChain,
  dedupeFavourites,
  type OriginHit,
} from "@/lib/england"
import {
  LOOKUP_USER_AGENT,
  createRateLimiter,
  decideNameRows,
  decideWikidata,
  fetchWikidataBySpotifyIds,
  lookupArtistOrigin,
  type WikidataPlaceRow,
} from "@/lib/england-lookup"
import { readFavouriteArtists } from "@/lib/favourites-spotify"
import { englishPlaylistDescription } from "@/lib/playlist"
import { createSpotify } from "@/lib/spotify"
import type { PlaceRecord } from "@/lib/types"

const PUTNEY: PlaceRecord = {
  id: "putney",
  name: "Putney",
  postcodes: ["SW15"],
  precision: "place",
  musicbrainz_area_mbid: "79e9cadb-c71e-40fc-bf78-950ef290517e",
  musicbrainz_area_name: "Putney",
  wikidata_qid: "Q2465220",
  note: "District in the London Borough of Wandsworth.",
}

describe("England classification", () => {
  it("treats country GB and the United Kingdom as unknown", () => {
    expect(classifyChain([{ iso31661: ["GB"], name: "United Kingdom", type: "Country" }])).toBe("unknown")
    expect(
      classifyChain([
        {
          id: UNITED_KINGDOM_AREA_MBID,
          name: "United Kingdom",
          type: "Country",
          iso31661: ["GB"],
        },
      ]),
    ).toBe("unknown")
  })

  it("accepts England from the subdivision, Q21, or GB-ENG", () => {
    expect(
      classifyChain([
        { id: ENGLAND_AREA_MBID, name: "England", type: "Subdivision", iso31662: ["GB-ENG"] },
      ]),
    ).toBe("england")
    expect(classifyChain([{ qid: "Q21", name: "England", type: "Subdivision" }])).toBe("england")
    expect(classifyChain([{ iso31662: ["gb-eng"], type: "Subdivision" }])).toBe("england")
    expect(classifyChain([{ name: "England", type: "Country" }])).toBe("england")
  })

  it("keeps Scotland, Wales, and Northern Ireland out of England", () => {
    expect(
      classifyChain([
        { name: "Glasgow", type: "City" },
        { iso31662: ["GB-SCT"], name: "Scotland", type: "Subdivision" },
      ]),
    ).toBe("elsewhere")
    expect(classifyChain([{ iso31662: ["GB-WLS"], name: "Wales", type: "Subdivision" }])).toBe("elsewhere")
    expect(classifyChain([{ qid: "Q26", name: "Northern Ireland", type: "Subdivision" }])).toBe("elsewhere")
  })

  it("does not treat a city named England as the nation", () => {
    expect(classifyChain([{ name: "England", type: "City" }])).toBe("unknown")
  })
})

describe("Wikidata decisions", () => {
  it("uses a birth place inside England and keeps looking when the place is only in the UK", () => {
    const putney = decideWikidata([
      row({
        placeQid: "Q2465220",
        placeLabel: "Putney",
        kind: "birth",
        nationQid: "Q21",
        countryQid: "Q145",
      }),
    ])
    expect(putney).toMatchObject({
      status: "england",
      place: "Putney",
      source: "Wikidata place of birth",
      qid: "Q2465220",
    })
    expect(
      decideWikidata([
        row({
          placeQid: "Q84",
          placeLabel: "London",
          kind: "birth",
          nationQid: null,
          countryQid: "Q145",
        }),
      ]),
    ).toBeNull()
  })

  it("marks two Wikidata people with the same name as unknown", () => {
    const decided = decideNameRows([
      row({ itemQid: "Q1", placeLabel: "Putney", placeQid: "Q2465220", nationQid: "Q21", kind: "birth" }),
      row({ itemQid: "Q2", placeLabel: "Glasgow", placeQid: "Q4093", nationQid: "Q22", kind: "birth" }),
    ])
    expect(decided).toMatchObject({ status: "unknown", source: "Wikidata name match" })
  })

  it("sends the app user agent when looking up Spotify artist ids", async () => {
    const seen: { url: string; agent: string | null }[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      seen.push({ url, agent: header(init, "User-Agent") })
      return json({
        results: {
          bindings: [
            {
              spotify: { value: "4AH6A0w5k5k5k5k5k5k5" },
              place: { value: "http://www.wikidata.org/entity/Q2465220" },
              placeLabel: { value: "Putney" },
              kind: { value: "birth" },
              nation: { value: "http://www.wikidata.org/entity/Q21" },
              country: { value: "http://www.wikidata.org/entity/Q145" },
            },
          ],
        },
      })
    }) as typeof fetch
    const grouped = await fetchWikidataBySpotifyIds(fetchImpl, ["4AH6A0w5k5k5k5k5k5k5"])
    expect(seen[0]?.url).toBe("https://query.wikidata.org/sparql")
    expect(seen[0]?.agent).toBe(LOOKUP_USER_AGENT)
    expect(decideWikidata(grouped.get("4AH6A0w5k5k5k5k5k5k5") ?? [])?.place).toBe("Putney")
  })
})

describe("MusicBrainz lookup", () => {
  it("stops after a Spotify URL hit and does not search by name", async () => {
    const urls: string[] = []
    const fetchImpl = recordingFetch((url, init) => {
      urls.push(`${url.pathname}?${url.searchParams.get("query") ?? ""}`)
      expect(header(init, "User-Agent")).toBe(LOOKUP_USER_AGENT)
      if (url.pathname.endsWith("/artist")) {
        return {
          artists: [
            {
              id: "mb-four-tet",
              name: "Four Tet",
              "begin-area": { id: "79e9cadb-c71e-40fc-bf78-950ef290517e", name: "Putney", type: "District" },
            },
          ],
        }
      }
      return { results: { bindings: [{ nation: { value: "http://www.wikidata.org/entity/Q21" } }] } }
    })
    const hit = await lookupArtistOrigin({ id: "4AH6A0w5k5k5k5k5k5k5", name: "Four Tet" }, { fetch: fetchImpl, limit: passthrough })
    expect(hit).toMatchObject({ status: "england", place: "Putney", source: "MusicBrainz begin area" })
    expect(urls.some((url) => url.includes("artist:"))).toBe(false)
  })

  it("keeps a URL-linked artist with only country GB as unknown", async () => {
    const queries: string[] = []
    const fetchImpl = recordingFetch((url) => {
      queries.push(url.searchParams.get("query") ?? url.pathname)
      return {
        artists: [
          {
            id: "mb-scot",
            name: "Someone",
            country: "GB",
            area: {
              id: UNITED_KINGDOM_AREA_MBID,
              name: "United Kingdom",
              type: "Country",
              "iso-3166-1-codes": ["GB"],
            },
          },
        ],
      }
    })
    const hit = await lookupArtistOrigin({ id: "4AH6A0w5k5k5k5k5k5k5", name: "Someone" }, { fetch: fetchImpl, limit: passthrough })
    expect(hit.status).toBe("unknown")
    expect(queries.some((query) => query.startsWith("artist:"))).toBe(false)
  })

  it("does not guess when two MusicBrainz artists share the name", async () => {
    const fetchImpl = recordingFetch((url) => {
      const query = url.searchParams.get("query") ?? ""
      if (query.startsWith("url:")) return { artists: [] }
      return {
        artists: [
          { id: "one", name: "The xx", area: { id: ENGLAND_AREA_MBID, name: "England", type: "Subdivision" } },
          { id: "two", name: "xx", area: { id: "glasgow", name: "Glasgow", type: "City" } },
        ],
      }
    })
    const hit = await lookupArtistOrigin({ id: "4AH6A0w5k5k5k5k5k5k5", name: "The xx" }, { fetch: fetchImpl, limit: passthrough })
    expect(hit).toMatchObject({ status: "unknown", source: "MusicBrainz name match" })
  })

  it("accepts one exact name whose area is England", async () => {
    const fetchImpl = recordingFetch((url) => {
      if (url.pathname.endsWith("/artist")) {
        const query = url.searchParams.get("query") ?? ""
        if (query.startsWith("url:")) return { artists: [] }
        return {
          artists: [
            {
              id: "mb-pj",
              name: "PJ Harvey",
              area: {
                id: ENGLAND_AREA_MBID,
                name: "England",
                type: "Subdivision",
                "iso-3166-2-codes": ["GB-ENG"],
              },
            },
          ],
        }
      }
      if (url.host === "query.wikidata.org") return { results: { bindings: [] } }
      return { id: ENGLAND_AREA_MBID, name: "England", type: "Subdivision", relations: [] }
    })
    const hit = await lookupArtistOrigin({ id: "4AH6A0w5k5k5k5k5k5k5", name: "PJ Harvey" }, { fetch: fetchImpl, limit: passthrough })
    expect(hit).toMatchObject({ status: "england", place: "England", source: "MusicBrainz name match" })
  })
})

describe("MusicBrainz rate limit", () => {
  it("does not delay the first call and then spaces calls by at least a second", async () => {
    let now = 1_000
    const sleeps: number[] = []
    const limit = createRateLimiter(1100, {
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      },
    })
    await limit(async () => "first")
    await limit(async () => "second")
    await limit(async () => "third")
    expect(sleeps.every((ms) => ms >= 1000)).toBe(true)
    expect(sleeps).toEqual([1100, 1100])
  })
})

describe("favourite assembly", () => {
  it("links a catalogue place, and splits unknown, unchecked, and elsewhere", () => {
    const artists = dedupeFavourites([
      { id: "putney-id", name: "Four Tet", image: "https://i.scdn.co/putney", reasons: ["followed"] },
      { id: "putney-id", name: "Four Tet", image: null, reasons: ["top-short"] },
      { id: "manc-id", name: "A Manchester Band", image: null, reasons: ["top-long"] },
      { id: "unknown-id", name: "Mystery", image: null, reasons: ["followed"] },
      { id: "later-id", name: "Not Yet", image: null, reasons: ["top-medium"] },
      { id: "glasgow-id", name: "A Glasgow Band", image: null, reasons: ["top-short"] },
    ])
    const origins = new Map<string, OriginHit>([
      ["putney-id", { status: "england", place: "Putney", source: "Wikidata place of birth", qid: "Q2465220", areaMbid: null }],
      ["manc-id", { status: "england", place: "Manchester", source: "MusicBrainz area", qid: null, areaMbid: null }],
      ["unknown-id", { status: "unknown", place: null, source: "MusicBrainz name match", qid: null, areaMbid: null }],
      ["glasgow-id", { status: "elsewhere", place: "Glasgow", source: "MusicBrainz area", qid: null, areaMbid: null }],
    ])
    const view = assembleFavourites(artists, origins, [PUTNEY])
    expect(view.english.map((artist) => artist.name)).toEqual(["Four Tet", "A Manchester Band"])
    expect(view.english[0]).toMatchObject({
      why: "Top artist, last 4 weeks · Followed",
      place: "Putney",
      source: "Wikidata place of birth",
      spotifyUrl: "https://open.spotify.com/artist/putney-id",
    })
    expect(view.english[0]?.links).toEqual([
      { label: "Putney", href: "/area/putney" },
      { label: "SW15", href: "/postcode/sw15" },
    ])
    expect(view.english[1]?.links).toEqual([])
    expect(view.unknown.map((artist) => artist.id)).toEqual(["unknown-id"])
    expect(view.unchecked.map((artist) => artist.id)).toEqual(["later-id"])
    expect(view.elsewhereCount).toBe(1)
    expect(catalogueLinks(origins.get("putney-id")!, [PUTNEY]).map((link) => link.label)).toEqual(["Putney", "SW15"])
  })
})

describe("Spotify favourites", () => {
  it("merges the same artist across a top range and follows and keeps the image", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === "/v1/me/top/artists" && url.searchParams.get("time_range") === "short_term") {
        return json({
          items: [
            {
              id: "artist1",
              name: "Four Tet",
              images: [
                { url: "https://i.scdn.co/large", width: 640 },
                { url: "https://i.scdn.co/small", width: 64 },
              ],
            },
          ],
        })
      }
      if (url.pathname === "/v1/me/top/artists") return json({ items: [] })
      if (url.pathname === "/v1/me/following") {
        return json({
          artists: {
            items: [{ id: "artist1", name: "Four Tet", images: [] }],
            next: null,
          },
        })
      }
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch
    const artists = await readFavouriteArtists("token", fetchImpl)
    expect(artists).toEqual([
      {
        id: "artist1",
        name: "Four Tet",
        image: "https://i.scdn.co/small",
        reasons: ["top-short", "followed"],
      },
    ])
  })

  it("parses the english playlist scope", () => {
    expect(parseScope("english")).toEqual({ kind: "english" })
    expect(scopeValue({ kind: "english" })).toBe("english")
    expect(englishPlaylistDescription().length).toBeLessThanOrEqual(300)
  })

  it("takes one top track per artist and skips a failed lookup", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)
      if (url.host === "accounts.spotify.com") return json({ access_token: "app-token", expires_in: 3600 })
      if (url.pathname === "/v1/artists/good/top-tracks") {
        return json({ tracks: [{ id: "track1", name: "Angel Echoes", uri: "spotify:track:track1", popularity: 40 }] })
      }
      if (url.pathname === "/v1/artists/bad/top-tracks") return new Response("nope", { status: 500 })
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch
    const client = createSpotify({
      fetch: fetchImpl,
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    })
    await expect(client.tracksForArtists(["good", "bad", "good"])).resolves.toEqual(["spotify:track:track1"])
  })
})

function row(partial: Partial<WikidataPlaceRow>): WikidataPlaceRow {
  return {
    spotifyId: null,
    name: null,
    itemQid: partial.itemQid ?? null,
    placeQid: partial.placeQid ?? null,
    placeLabel: partial.placeLabel ?? null,
    kind: partial.kind ?? null,
    nationQid: partial.nationQid ?? null,
    countryQid: partial.countryQid ?? null,
  }
}

function passthrough<T>(task: () => Promise<T>): Promise<T> {
  return task()
}

function header(init: RequestInit | undefined, name: string): string | null {
  const headers = new Headers(init?.headers)
  return headers.get(name)
}

function recordingFetch(handler: (url: URL, init?: RequestInit) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    return json(handler(new URL(raw), init))
  }) as typeof fetch
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
