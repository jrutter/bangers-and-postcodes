import { describe, expect, it } from "vitest"

import { artistsInPlace, artistsInPostcode, homePrecision } from "@/lib/catalogue"
import { readArea, readArtistIndex, readHome, readPostcode, readRegion } from "@/lib/page-data"
import { artistsInRegion } from "@/lib/regions"
import { artists } from "@/lib/catalogue"
import { filterVenues, venues } from "@/lib/venues"

describe("precomputed page data", () => {
  it("matches the home region summaries and does not embed the artist list", () => {
    const home = readHome()
    expect(home.artist_count).toBe(2751)
    expect(home.precision).toEqual(homePrecision())
    expect(home.curatedVenues).toHaveLength(10)
    expect(home.boroughs.length).toBeGreaterThan(30)
    const southwest = home.regions.find((region) => region.id === "southwest")
    expect(southwest?.artists).toBe(artistsInRegion(artists(), "southwest").length)
    expect(southwest?.venues).toBe(filterVenues(venues(), { area: "southwest" }).length)
    expect(JSON.stringify(home)).not.toContain("\"mbid\"")
  })

  it("loads one region, one area, and one postcode instead of the whole catalogue", () => {
    const region = readRegion("southwest")
    const area = readArea("putney")
    const postcode = readPostcode("SW15")
    expect(region?.artistCount).toBe(artistsInRegion(artists(), "southwest").length)
    expect(region?.artists.length).toBe(region?.artistCount)
    expect(area?.artists).toHaveLength(artistsInPlace("putney").length)
    expect(postcode?.artists).toHaveLength(artistsInPostcode("SW15").length)
    expect(area?.artists.every((artist) => artist.slug)).toBe(true)
  })

  it("gives every artist a unique page slug", () => {
    const index = readArtistIndex()
    expect(index).toHaveLength(2751)
    expect(new Set(index.map((artist) => artist.slug)).size).toBe(2751)
    const smiths = index.filter((artist) => artist.name.toLowerCase() === "mike smith")
    expect(smiths).toHaveLength(2)
    expect(smiths[0]?.slug).not.toBe(smiths[1]?.slug)
  })
})
