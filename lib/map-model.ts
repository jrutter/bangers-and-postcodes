import { playlistPath, postcodePath, venuePath } from "@/lib/paths"
import { districtPoint, londonPostcodes } from "@/lib/districts"
import { filterArtists, showcaseArtists, withEra, type EraFilter } from "@/lib/era"
import { centroid } from "@/lib/geo"
import { formatGigWhen, selectGigs } from "@/lib/gigs/select"
import type { Gig } from "@/lib/gigs/types"
import { indexTags, matchCandidate, matchGig, matchVenue, orderByTaste, type TasteProfile } from "@/lib/taste"
import type { ArtistRecord, PlaceRecord } from "@/lib/types"
import { artistsForPostcode, placesForPostcode } from "@/lib/stats"
import type { Venue } from "@/lib/venues"

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

export type MapDistrictVenue = {
  id: string
  name: string
  type: string
  pageHref: string
}

export type MapDistrict = {
  postcode: string
  label: string
  artistCount: number
  artists: MapArtist[]
  gigs: MapGig[]
  venueCount: number
  venues: MapDistrictVenue[]
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
  type: string
  borough: string | null
}

export type MapModel = {
  districts: MapDistrict[]
  venues: MapVenuePin[]
  personalised: boolean
  listingsConfigured: boolean
  focusRegionId: string | null
}

export function buildMapModel(input: {
  artists: ArtistRecord[]
  places: PlaceRecord[]
  venues: Venue[]
  gigs: Gig[]
  now: Date
  profile: TasteProfile | null
  listingsConfigured: boolean
  era?: EraFilter | null
  focusRegionId?: string | null
}): MapModel {
  const tags = indexTags(input.artists)
  const profile = input.profile
  const era = input.era ?? null
  const districts = londonPostcodes().map((postcode) => {
    const localArtists = filterArtists(artistsForPostcode(input.artists, postcode), era, input.now).sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    )
    const gigs = selectGigs(input.gigs, { kind: "postcode", postcode }, "upcoming", input.now)
    const point = districtPoint(postcode) ?? centroid(postcode)
    const highlight = profile ? bestDistrictMatch(profile, localArtists, gigs, tags) : null
    const playlist = playlistPath({ kind: "postcode", postcode })
    return {
      postcode,
      label: districtLabel(postcode, input.places),
      artistCount: localArtists.length,
      artists: topArtists(localArtists, profile, input.now),
      gigs: gigs.slice(0, GIG_LIMIT).map(toMapGig),
      playlistHref: localArtists.length > 0 ? withEra(playlist, era) : null,
      pageHref: withEra(postcodePath(postcode), era),
      venueCount: 0,
      venues: [] as MapDistrictVenue[],
      highlighted: Boolean(highlight),
      highlightReason: highlight?.reason ?? null,
      latitude: point?.latitude ?? 0,
      longitude: point?.longitude ?? 0,
    }
  })

  const pins = input.venues.map((venue) => {
    const gigs = selectGigs(input.gigs, { kind: "venue", venueId: venue.id }, "upcoming", input.now)
    const highlight = profile ? matchVenue(profile, gigs, tags) : null
    return {
      id: venue.id,
      name: venue.name,
      address: venue.address ? `${venue.address}${venue.postcode ? `, ${venue.postcode}` : ""}` : venue.postcode,
      postcode: venue.postcode,
      latitude: venue.latitude,
      longitude: venue.longitude,
      gigs: gigs.slice(0, GIG_LIMIT).map(toMapGig),
      playlistHref: playlistPath({ kind: "venue", venueId: venue.id }),
      pageHref: venuePath(venue.id),
      highlighted: Boolean(highlight),
      highlightReason: highlight?.reason ?? null,
      type: venue.type,
      borough: venue.borough,
    }
  })
  const pinsByPostcode = new Map<string, MapVenuePin[]>()
  input.venues.forEach((venue, index) => {
    const pin = pins[index]
    if (!pin) return
    for (const postcode of venue.postcodes) {
      const list = pinsByPostcode.get(postcode) ?? []
      list.push(pin)
      pinsByPostcode.set(postcode, list)
    }
  })
  for (const district of districts) {
    const local = pinsByPostcode.get(district.postcode) ?? []
    district.venueCount = local.length
    district.venues = local.slice(0, 8).map((pin) => ({
      id: pin.id,
      name: pin.name,
      type: pin.type,
      pageHref: pin.pageHref,
    }))
  }

  return {
    districts,
    venues: pins,
    personalised: Boolean(profile),
    listingsConfigured: input.listingsConfigured,
    focusRegionId: input.focusRegionId ?? null,
  }
}

function districtLabel(postcode: string, places: PlaceRecord[]): string {
  const names = placesForPostcode(places, postcode)
    .filter((place) => place.precision === "place")
    .map((place) => place.name)
  if (names.length > 0) return names.slice(0, 4).join(", ")
  return postcode
}

function topArtists(artists: ArtistRecord[], profile: TasteProfile | null, now: Date): MapArtist[] {
  const mixed = showcaseArtists(artists, ARTIST_LIMIT, now)
  const ranked = profile
    ? orderByTaste(mixed, (artist) => matchCandidate(profile, { name: artist.name, tags: artist.tags }))
    : mixed.map((item) => ({ item, taste: null }))
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
