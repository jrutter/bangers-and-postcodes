import { describe, expect, it } from "vitest"

import {
  GIG_MATCH_CONFIDENCE,
  billPieces,
  displayBill,
  foldName,
  nameConfidence,
  spotifyArtistIdFrom,
} from "@/lib/gigs/bill"
import { parseSkiddle } from "@/lib/gigs/skiddle"
import { gigActRows } from "@/lib/gigs/spotify"
import { createSpotify } from "@/lib/spotify"
import type { ArtistRecord } from "@/lib/types"

const GUINGA = "Guinga - The Guitar of Brazil Feat. Raquel Vega"
const STEFAN = "Stefan Redtenbacher's Funkestra"
const WIGWAM = "Wigwam Live"
const HOUSE = "Ex Cellar Jazz"

describe("gig bill names", () => {
  it("splits featured billing and keeps a dashed subtitle apart from the acts", () => {
    expect(billPieces(GUINGA)).toEqual([
      { name: "Guinga", role: "primary" },
      { name: "The Guitar of Brazil", role: "subtitle" },
      { name: "Raquel Vega", role: "support" },
    ])
    expect(billPieces("Foo Live at The Half Moon")).toEqual([{ name: "Foo", role: "primary" }])
    expect(billPieces("Alpha feat. Bravo & Charlie").map((piece) => piece.name)).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  it("leaves apostrophes, a live suffix, and a house-night name in one piece", () => {
    expect(billPieces(STEFAN)).toEqual([{ name: STEFAN, role: "primary" }])
    expect(billPieces(WIGWAM)).toEqual([{ name: WIGWAM, role: "primary" }])
    expect(billPieces(HOUSE)).toEqual([{ name: HOUSE, role: "primary" }])
  })

  it("folds case, accents, apostrophes, and a leading the", () => {
    expect(foldName("José González")).toBe(foldName("Jose Gonzalez"))
    expect(foldName("Redtenbacher’s Funkestra")).toBe(foldName("Redtenbacher's Funkestra"))
    expect(nameConfidence("The xx", "xx")).toBe(1)
    expect(nameConfidence("José González", "Jose Gonzalez")).toBe(1)
  })

  it("accepts the real near-misses and rejects a venue house night", () => {
    expect(nameConfidence(STEFAN, "Redtenbacher's Funkestra")).toBeGreaterThanOrEqual(GIG_MATCH_CONFIDENCE)
    expect(nameConfidence(STEFAN, "Funkestra")).toBeLessThan(GIG_MATCH_CONFIDENCE)
    expect(nameConfidence(STEFAN, "Stefan")).toBeLessThan(GIG_MATCH_CONFIDENCE)
    expect(nameConfidence(WIGWAM, "Wigwam")).toBeGreaterThanOrEqual(GIG_MATCH_CONFIDENCE)
    expect(nameConfidence(WIGWAM, "Live")).toBeLessThan(GIG_MATCH_CONFIDENCE)
    for (const other of ["Ex", "Cellar", "Jazz", "Excellar", "Ex Cellar", "The Jazz"]) {
      expect(nameConfidence(HOUSE, other)).toBeLessThan(GIG_MATCH_CONFIDENCE)
    }
    expect(nameConfidence("The Guitar of Brazil", "Brazil")).toBeLessThan(GIG_MATCH_CONFIDENCE)
    expect(nameConfidence("Earth, Wind & Fire", "Earth, Wind & Fire")).toBe(1)
  })

  it("shows matched featured artists and one no-match row for a house night", () => {
    expect(displayBill(GUINGA, state({ matched: ["Guinga", "Raquel Vega"], missed: [GUINGA, "The Guitar of Brazil"] }))).toEqual([
      "Guinga",
      "Raquel Vega",
    ])
    expect(displayBill(STEFAN, state({ matched: [STEFAN], missed: [] }))).toEqual([STEFAN])
    expect(displayBill(WIGWAM, state({ matched: [WIGWAM], missed: [] }))).toEqual([WIGWAM])
    expect(displayBill(HOUSE, state({ matched: [], missed: [HOUSE] }))).toEqual([HOUSE])
    expect(displayBill("Earth, Wind & Fire", state({ matched: ["Earth, Wind & Fire"], missed: [] }))).toEqual([
      "Earth, Wind & Fire",
    ])

    const links = {
      [foldName(HOUSE)]: null,
      [foldName(GUINGA)]: null,
      [foldName("Guinga")]: link("Guinga"),
      [foldName("Raquel Vega")]: link("Raquel Vega"),
      [foldName("The Guitar of Brazil")]: null,
    }
    expect(gigActRows(HOUSE, links).map((row) => [row.name, row.match])).toEqual([[HOUSE, null]])
    expect(gigActRows(GUINGA, links).map((row) => row.name)).toEqual(["Guinga", "Raquel Vega"])
  })

  it("reads a Skiddle artist object, including a Spotify artist URL, without splitting the stored bill", () => {
    const parsed = parseSkiddle({
      error: 0,
      totalcount: 1,
      results: [
        {
          id: "42289250",
          eventname: GUINGA,
          date: "2026-10-18",
          artists: [
            {
              artistid: "123",
              name: GUINGA,
              spotifyartisturl: "https://open.spotify.com/artist/guingaSpot1",
            },
          ],
          venue: { name: "Ex Cellar", postcode: "KT1 1JQ" },
        },
      ],
    })
    expect(parsed.gigs[0]?.artistNames).toEqual([GUINGA])
    expect(parsed.gigs[0]?.artistSpotifyIds).toEqual({ Guinga: "guingaSpot1" })
    expect(spotifyArtistIdFrom("https://open.spotify.com/artist/guingaSpot1")).toBe("guingaSpot1")
    expect(spotifyArtistIdFrom("http://open.spotify.com/artist/guingaSpot1")).toBeNull()
  })
})

describe("gig Spotify matching", () => {
  it("matches the real bills, keeps Earth, Wind & Fire whole, and leaves Ex Cellar Jazz unmatched", async () => {
    const searches: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)
      if (url.host === "accounts.spotify.com") return json({ access_token: "app-token", expires_in: 3600 })
      if (url.pathname === "/v1/search" && url.searchParams.get("type") === "artist") {
        const query = url.searchParams.get("q") ?? ""
        searches.push(query)
        expect(query.startsWith("artist:")).toBe(false)
        return json({ artists: { items: artistsFor(query) } })
      }
      if (url.pathname.endsWith("/top-tracks")) return json({ tracks: [] })
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch
    const client = createSpotify({
      fetch: fetchImpl,
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    })
    const matched = await client.matchGigLineup([record(STEFAN), record(WIGWAM), record(HOUSE), record(GUINGA), record("Earth, Wind & Fire")])
    const byName = new Map(matched.map((artist) => [artist.name, artist.spotify?.id ?? null]))
    expect(byName.get(STEFAN)).toBe("funkestra")
    expect(byName.get(WIGWAM)).toBe("wigwam")
    expect(byName.get(HOUSE)).toBeNull()
    expect(matched.filter((artist) => artist.name === HOUSE)).toHaveLength(1)
    expect(byName.get("Guinga")).toBe("guinga")
    expect(byName.get("Raquel Vega")).toBe("raquel")
    expect(byName.has("The Guitar of Brazil")).toBe(false)
    expect(byName.get("Earth, Wind & Fire")).toBe("ewf")
    expect(matched.filter((artist) => artist.name === "Earth" || artist.name === "Wind" || artist.name === "Fire")).toHaveLength(0)
    expect(searches.some((query) => query === HOUSE)).toBe(true)
  })

  it("uses a Skiddle Spotify artist id without searching by the long bill", async () => {
    const searches: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)
      if (url.host === "accounts.spotify.com") return json({ access_token: "app-token", expires_in: 3600 })
      if (url.pathname === "/v1/artists/guingaSpot1") {
        return json({
          id: "guingaSpot1",
          name: "Guinga",
          popularity: 20,
          followers: { total: 10 },
          external_urls: { spotify: "https://open.spotify.com/artist/guingaSpot1" },
        })
      }
      if (url.pathname === "/v1/search") {
        searches.push(url.searchParams.get("q") ?? "")
        return json({ artists: { items: [] }, tracks: { items: [] } })
      }
      if (url.pathname.endsWith("/top-tracks")) return json({ tracks: [] })
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch
    const client = createSpotify({
      fetch: fetchImpl,
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    })
    const hints = new Map<string, string>([[foldName("Guinga"), "guingaSpot1"]])
    const matched = await client.matchGigLineup([record(GUINGA)], hints)
    expect(matched.map((artist) => [artist.name, artist.spotify?.id ?? null])).toEqual([
      ["Guinga", "guingaSpot1"],
      ["Raquel Vega", null],
    ])
    expect(searches).not.toContain("Guinga")
    expect(searches).toContain("Raquel Vega")
  })
})

function state(input: { matched: string[]; missed: string[] }): (name: string) => "match" | "miss" | "absent" {
  const matched = new Set(input.matched.map((name) => foldName(name)))
  const missed = new Set(input.missed.map((name) => foldName(name)))
  return (name) => {
    const key = foldName(name)
    if (matched.has(key)) return "match"
    if (missed.has(key)) return "miss"
    return "absent"
  }
}

function link(label: string) {
  return {
    artistUrl: `https://open.spotify.com/artist/${encodeURIComponent(label)}`,
    artistLabel: label,
    trackUrl: null,
    trackName: null,
    previewUrl: null,
  }
}

function artistsFor(query: string): { id: string; name: string; popularity: number; followers: { total: number } }[] {
  if (query === STEFAN) {
    return [
      profile("stefan", "Stefan", 80),
      profile("funkestra", "Redtenbacher's Funkestra", 40),
    ]
  }
  if (query === WIGWAM) return [profile("live", "Live", 90), profile("wigwam", "Wigwam", 20)]
  if (query === HOUSE) return [profile("jazz", "Jazz", 70), profile("ex", "Ex", 10), profile("cellar", "Cellar", 12)]
  if (query === "Guinga") return [profile("guinga", "Guinga", 30)]
  if (query === "Raquel Vega") return [profile("raquel", "Raquel Vega", 15)]
  if (query === "The Guitar of Brazil") return [profile("brazil", "Brazil", 50)]
  if (query === "Earth, Wind & Fire") return [profile("ewf", "Earth, Wind & Fire", 80), profile("earth", "Earth", 60)]
  return []
}

function profile(id: string, name: string, popularity: number) {
  return { id, name, popularity, followers: { total: popularity * 10 } }
}

function record(name: string): ArtistRecord {
  return {
    mbid: null,
    wikidata_qid: null,
    name,
    sort_name: name,
    type: null,
    disambiguation: null,
    country: null,
    life_span: null,
    tags: [],
    locality: [],
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
