import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

import { readVenueIndex } from "@/lib/page-data"
import { DETAILS_FIELD_MASK, TEXT_SEARCH_FIELD_MASK, detailsFromPlace, placeIdFromTextSearch } from "@/lib/venues/places"
import { rankingsFromRows } from "@/lib/venues/rankings"
import { refreshVenueRatings, takeSlice } from "@/lib/venues/refresh"
import { bayesianScore, rankByBayesian } from "@/lib/venues/score"
import { fileRatingStore, memoryRatingStore } from "@/lib/venues/store"

const NOW = new Date("2026-10-12T06:00:00.000Z")

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv
}

describe("venue ratings", () => {
  it("keeps a handful of five-star reviews below a well reviewed room", () => {
    const prior = 4.2
    const tiny = bayesianScore(5, 10, prior)
    const established = bayesianScore(4.5, 5000, prior)
    expect(tiny).toBeLessThan(established)
    expect(tiny).toBeCloseTo((10 / 210) * 5 + (200 / 210) * prior, 5)
    const crowd = Array.from({ length: 40 }, (_, index) => ({
      venueId: `room-${index}`,
      rating: 4.2,
      userRatingCount: 800,
    }))
    const ranked = rankByBayesian([
      ...crowd,
      { venueId: "tiny", rating: 5, userRatingCount: 10 },
      { venueId: "established", rating: 4.6, userRatingCount: 4000 },
    ])
    expect(ranked.rows[0]?.venueId).toBe("established")
    expect(ranked.rows.find((row) => row.venueId === "tiny")?.rank).toBeGreaterThan(1)
    const tinyRow = ranked.rows.find((row) => row.venueId === "tiny")
    expect(tinyRow && tinyRow.weighted).toBeLessThan(4.6)
  })

  it("reads only the place id and the two rating fields", () => {
    expect(placeIdFromTextSearch({ places: [{ id: "ChIJhalfmoon", displayName: { text: "The Half Moon" }, rating: 5 }] })).toBe(
      "ChIJhalfmoon",
    )
    expect(placeIdFromTextSearch({ places: [] })).toBeNull()
    expect(detailsFromPlace({ rating: 4.6, userRatingCount: 800, reviews: [{ text: "secret" }] })).toEqual({
      rating: 4.6,
      userRatingCount: 800,
    })
  })

  it("does nothing when the Places key is missing", async () => {
    const fetchImpl = vi.fn()
    const store = memoryRatingStore()
    const report = await refreshVenueRatings({
      env: env(),
      store,
      fetchImpl: fetchImpl as typeof fetch,
      now: NOW,
      venues: [{ id: "half-moon", name: "The Half Moon", address: "93 Lower Richmond Road", postcode: "SW15 1EU" }],
      resolveBudget: 10,
      detailsBudget: 10,
      concurrency: 2,
      paceMs: 0,
    })
    expect(report.skippedReason).toBe("not-configured")
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await store.read()).toEqual([])
  })

  it("resolves a place id, stores the rating, and drops Google prose", async () => {
    const masks: string[] = []
    const queries: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const headers = new Headers(init?.headers)
      masks.push(headers.get("X-Goog-FieldMask") ?? "")
      if (url.includes(":searchText")) {
        const body = JSON.parse(String(init?.body)) as { textQuery: string }
        queries.push(body.textQuery)
        expect(headers.get("X-Goog-Api-Key")).toBe("places-key")
        return Response.json({
          places: [{ id: "ChIJhalfmoonplace", displayName: { text: "The Half Moon" }, rating: 1 }],
        })
      }
      return Response.json({
        rating: 4.6,
        userRatingCount: 800,
        displayName: { text: "The Half Moon" },
        reviews: [{ text: { text: "do not store" } }],
      })
    }) as typeof fetch
    const directory = mkdtempSync(join(tmpdir(), "venue-ratings-"))
    const store = fileRatingStore(join(directory, "ratings.json"))
    const report = await refreshVenueRatings({
      env: env({ GOOGLE_PLACES_API_KEY: "places-key" }),
      store,
      fetchImpl,
      now: NOW,
      venues: [
        { id: "half-moon", name: "The Half Moon", address: "93 Lower Richmond Road", postcode: "SW15 1EU" },
        { id: "tiny-room", name: "Tiny Room", address: "1 High Street", postcode: "E1 1AA" },
      ],
      resolveBudget: 10,
      detailsBudget: 10,
      concurrency: 2,
      paceMs: 0,
    })
    expect(queries.some((query) => query.includes("The Half Moon") && query.includes("London"))).toBe(true)
    expect(masks).toContain(TEXT_SEARCH_FIELD_MASK)
    expect(masks).toContain(DETAILS_FIELD_MASK)
    expect(report.resolved).toBe(2)
    expect(report.rated).toBe(2)
    const rows = await store.read()
    expect(rows.map((row) => row.placeId).sort()).toEqual(["ChIJhalfmoonplace", "ChIJhalfmoonplace"])
    const saved = JSON.stringify(rows)
    expect(saved).not.toContain("displayName")
    expect(saved).not.toContain("do not store")
    expect(saved).not.toContain("places-key")
    const index = readVenueIndex()
    expect(index).toHaveLength(531)
    expect(index.find((venue) => venue.id === "half-moon")?.regionId).toBe("southwest")
    const ranked = rankingsFromRows(
      [
        { venueId: "half-moon", placeId: "ChIJhalfmoonplace", rating: 4.6, userRatingCount: 800, fetchedAt: NOW.toISOString() },
        { venueId: "not-a-real-venue", placeId: "ChIJmissing", rating: 5, userRatingCount: 9, fetchedAt: NOW.toISOString() },
      ],
      index,
    )
    expect(ranked.rows.map((row) => row.venueId)).toEqual(["half-moon"])
    expect(ranked.rows[0]?.regionId).toBe("southwest")
    expect(ranked.rows[0]?.rank).toBe(1)
    expect(ranked.rows.every((row) => !("placeId" in row))).toBe(true)
  })

  it("rotates unresolved venues across weeks", () => {
    const venues = ["a", "b", "c", "d"]
    const week = 7 * 24 * 60 * 60 * 1000
    expect(takeSlice(venues, new Date(0), 2, week)).toEqual(["a", "b"])
    expect(takeSlice(venues, new Date(week), 2, week)).toEqual(["c", "d"])
  })
})
