import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { artists, places } from "@/lib/catalogue"
import type { Gig } from "@/lib/gigs/types"
import { artistsInPostcode } from "@/lib/catalogue"
import { buildMapModel, MAP_STYLE_URL } from "@/lib/map-model"
import { buildTasteProfile } from "@/lib/taste"
import type { ArtistRecord, PlaceRecord } from "@/lib/types"
import { venues } from "@/lib/venues"

const NOW = new Date("2026-10-11T12:00:00Z")

describe("map model", () => {
  it("uses a keyless tile style", () => {
    const url = new URL(MAP_STYLE_URL)
    expect(url.protocol).toBe("https:")
    expect(url.search).toBe("")
    expect(url.hostname).toBe("tiles.openfreemap.org")
  })

  it("covers every mapped district with a Wikipedia polygon", () => {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), "data/postcode-districts.json"), "utf8")) as {
      licence: string
      features: { id: string; geometry: { type: string; coordinates: number[][][] } }[]
    }
    expect(file.licence).toContain("creativecommons.org/licenses/by-sa/3.0")
    const ids = file.features.map((feature) => feature.id)
    expect(ids.sort()).toEqual(["KT1", "KT2", "SW12", "SW13", "SW14", "SW15", "SW18", "SW19", "SW6", "TW1", "TW10", "TW9"])
    for (const feature of file.features) {
      expect(feature.geometry.type).toBe("Polygon")
      const ring = feature.geometry.coordinates[0]
      expect(ring[0]).toEqual(ring[ring.length - 1])
    }
  })

  it("counts catalogue artists and builds the postcode playlist link", () => {
    const model = buildMapModel({
      artists: artists(),
      places: places(),
      venues: venues(),
      gigs: [],
      now: NOW,
      profile: null,
      listingsConfigured: false,
    })
    const putney = model.districts.find((district) => district.postcode === "SW15")
    expect(putney?.artistCount).toBe(artistsInPostcode("SW15").length)
    expect(putney?.label).toContain("Putney")
    expect(putney?.playlistHref).toBe("/playlist?scope=postcode%3ASW15")
    expect(putney?.highlighted).toBe(false)
    const twickenham = model.districts.find((district) => district.postcode === "TW1")
    expect(twickenham?.label).toBe("Twickenham")
    expect(twickenham?.artistCount).toBe(0)
    expect(twickenham?.playlistHref).toBeNull()
    expect(model.venues.find((venue) => venue.id === "half-moon")?.playlistHref).toBe("/playlist?scope=venue%3Ahalf-moon")
  })

  it("highlights a district and a venue when the billed artist matches taste", () => {
    const profile = buildTasteProfile({
      followed: [],
      topArtistsShort: [{ id: "wet", name: "Wet Leg", genres: [] }],
      topArtistsMedium: [],
      topTracksShort: [],
      topTracksMedium: [],
      related: [],
    })
    const model = buildMapModel({
      artists: [artist("Four Tet", "SW15"), artist("Local Only", "SW6")],
      places: [place("putney", "Putney", ["SW15"]), place("fulham", "Fulham", ["SW6"])],
      venues: venues().filter((venue) => venue.id === "half-moon" || venue.id === "bulls-head"),
      gigs: [gig()],
      now: NOW,
      profile,
      listingsConfigured: true,
    })
    const putney = model.districts.find((district) => district.postcode === "SW15")
    const fulham = model.districts.find((district) => district.postcode === "SW6")
    expect(putney?.highlighted).toBe(true)
    expect(putney?.highlightReason).toBe("You listen to Wet Leg")
    expect(putney?.gigs[0]?.title).toBe("Wet Leg")
    expect(putney?.artists[0]?.name).toBe("Four Tet")
    expect(fulham?.highlighted).toBe(false)
    expect(model.venues.find((venue) => venue.id === "half-moon")?.highlighted).toBe(true)
    expect(model.venues.find((venue) => venue.id === "bulls-head")?.highlighted).toBe(false)
    expect(model.personalised).toBe(true)
  })
})

function artist(name: string, postcode: string): ArtistRecord {
  return {
    mbid: null,
    wikidata_qid: null,
    name,
    sort_name: name,
    type: "Group",
    disambiguation: null,
    country: "GB",
    life_span: null,
    tags: [],
    locality: [
      {
        place_id: postcode.toLowerCase(),
        place_name: postcode,
        postcodes: [postcode],
        precision: "place",
        claims: [],
      },
    ],
  }
}

function place(id: string, name: string, postcodes: string[]): PlaceRecord {
  return {
    id,
    name,
    postcodes,
    precision: "place",
    musicbrainz_area_mbid: null,
    musicbrainz_area_name: null,
    wikidata_qid: null,
    note: "",
  }
}

function gig(): Gig {
  return {
    id: "gig-1",
    provider: "skiddle",
    title: "Wet Leg",
    artistNames: ["Wet Leg"],
    venueName: "The Half Moon",
    address: "93 Lower Richmond Road",
    town: "Putney",
    postcode: "SW15 1EU",
    latitude: 51.467,
    longitude: -0.22,
    startsAt: "2026-10-12T19:30:00+01:00",
    date: "2026-10-12",
    doorTime: null,
    ticketUrl: "https://example.test/tickets",
  }
}
