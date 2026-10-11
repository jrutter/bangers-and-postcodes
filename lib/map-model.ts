import { areaPath, playlistPath, postcodePath, knownPostcode } from "@/lib/catalogue"
import { centroid } from "@/lib/geo"
import { formatGigWhen, selectGigs } from "@/lib/gigs/select"
import type { Gig } from "@/lib/gigs/types"
import { indexTags, matchCandidate, matchGig, matchVenue, orderByTaste, type TasteProfile } from "@/lib/taste"
import type { ArtistRecord, PlaceRecord } from "@/lib/types"
import { artistsForPostcode, placesForPostcode } from "@/lib/stats"
import { venuePath, type Venue } from "@/lib/venues"

/** Keyless MapLibre style. OpenFreeMap serves OpenStreetMap vector tiles with no API key. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"

export const MAP_ATTRIBUTION =
  "District boundaries © Wikipedia contributors, CC BY-SA 3.0. Map data © OpenStreetMap contributors, ODbL. Tiles from OpenFreeMap."

const DISTRICT_ORDER = ["SW13", "SW15", "SW14", "SW6", "SW18", "SW19", "TW9", "TW10", "KT1", "KT2", "TW1", "SW12"]

const OUTSIDE_CATALOGUE: Record<string, string> = {
  TW1: "Twickenham",
  SW12: "Balham",
}

const ARTIST_LIMIT = 5
const GIG_LIMIT = 4

export type MapGig = {
  id: string
  title: string
  when: string
  venueName: string
  ticketUrl: string | null
}

export type MapArtist = {
  name: string
  reason: string | null
}

export type MapDistrict = {
  postcode: string
  label: string
  artistCount: number
  artists: MapArtist[]
  gigs: MapGig[]
  playlistHref: string | null
  pageHref: string | null
  highlighted: boolean
  highlightReason: string | null
  latitude: number
  longitude: number
}

export type MapVenuePin = {
  id: string
  name: string
  address: string
  postcode: string
  latitude: number
  longitude: number
  gigs: MapGig[]
  playlistHref: string
  pageHref: string
  highlighted: boolean
  highlightReason: string | null
}

export type MapModel = {
  districts: MapDistrict[]
  venues: MapVenuePin[]
  personalised: boolean
  listingsConfigured: boolean
}

export function buildMapModel(input: {
  artists: ArtistRecord[]
  places: PlaceRecord[]
  venues: Venue[]
  gigs: Gig[]
  now: Date
  profile: TasteProfile | null
  listingsConfigured: boolean
}): MapModel {
  const tags = indexTags(input.artists)
  const profile = input.profile
  const districts = DISTRICT_ORDER.map((postcode) => {
    const localArtists = artistsForPostcode(input.artists, postcode).sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    )
    const gigs = selectGigs(input.gigs, { kind: "postcode", postcode }, "upcoming", input.now)
    const point = centroid(postcode)
    const highlight = profile ? bestDistrictMatch(profile, localArtists, gigs, tags) : null
    return {
      postcode,
      label: districtLabel(postcode, input.places),
      artistCount: localArtists.length,
      artists: topArtists(localArtists, profile),
      gigs: gigs.slice(0, GIG_LIMIT).map(toMapGig),
      playlistHref: knownPostcode(postcode) ? playlistPath({ kind: "postcode", postcode }) : null,
      pageHref: knownPostcode(postcode) ? postcodePath(postcode) : areaPathFor(postcode, input.places),
      highlighted: Boolean(highlight),
      highlightReason: highlight?.reason ?? null,
      latitude: point?.latitude ?? 0,
      longitude: point?.longitude ?? 0,
    }
  })

  const venues = input.venues.map((venue) => {
    const gigs = selectGigs(input.gigs, { kind: "venue", venueId: venue.id }, "upcoming", input.now)
    const highlight = profile ? matchVenue(profile, gigs, tags) : null
    return {
      id: venue.id,
      name: venue.name,
      address: `${venue.address}, ${venue.postcode}`,
      postcode: venue.postcode,
      latitude: venue.latitude,
      longitude: venue.longitude,
      gigs: gigs.slice(0, GIG_LIMIT).map(toMapGig),
      playlistHref: playlistPath({ kind: "venue", venueId: venue.id }),
      pageHref: venuePath(venue.id),
      highlighted: Boolean(highlight),
      highlightReason: highlight?.reason ?? null,
    }
  })

  return {
    districts,
    venues,
    personalised: Boolean(profile),
    listingsConfigured: input.listingsConfigured,
  }
}

function districtLabel(postcode: string, places: PlaceRecord[]): string {
  const names = placesForPostcode(places, postcode)
    .filter((place) => place.precision === "place")
    .map((place) => place.name)
  if (names.length > 0) return names.join(", ")
  return OUTSIDE_CATALOGUE[postcode] ?? postcode
}

function areaPathFor(postcode: string, places: PlaceRecord[]): string | null {
  const place = placesForPostcode(places, postcode).find((item) => item.precision === "place")
  if (place) return areaPath(place.id)
  if (postcode === "TW1") return areaPath("richmond-borough")
  if (postcode === "SW12") return areaPath("wandsworth-borough")
  return null
}

function topArtists(artists: ArtistRecord[], profile: TasteProfile | null): MapArtist[] {
  const ranked = profile
    ? orderByTaste(artists, (artist) => matchCandidate(profile, { name: artist.name, tags: artist.tags }))
    : artists.map((item) => ({ item, taste: null }))
  return ranked.slice(0, ARTIST_LIMIT).map((row) => ({
    name: row.item.name,
    reason: row.taste?.reason ?? null,
  }))
}

function bestDistrictMatch(
  profile: TasteProfile,
  artists: ArtistRecord[],
  gigs: Gig[],
  tags: Map<string, string[]>,
) {
  let best: { score: number; reason: string } | null = null
  for (const artist of artists) {
    const hit = matchCandidate(profile, { name: artist.name, tags: artist.tags })
    if (hit && (!best || hit.score > best.score)) best = hit
  }
  const gigHit = matchGig(profile, { artistNames: gigs.flatMap((gig) => gig.artistNames) }, tags)
  if (gigHit && (!best || gigHit.score > best.score)) best = gigHit
  return best
}

function toMapGig(gig: Gig): MapGig {
  const names = gig.artistNames.length > 0 ? gig.artistNames.join(", ") : gig.title
  return {
    id: gig.id,
    title: names,
    when: formatGigWhen(gig),
    venueName: gig.venueName,
    ticketUrl: gig.ticketUrl,
  }
}
