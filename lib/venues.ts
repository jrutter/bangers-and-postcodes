import venueFile from "@/data/venues.json"

import { compactPostcode } from "@/lib/geo"
import { districtInRegion, regionById } from "@/lib/regions"

export type VenueType =
  | "grassroots"
  | "pub"
  | "club"
  | "theatre"
  | "arena"
  | "concert-hall"
  | "arts-centre"
  | "bar"
  | "music-venue"

export type Venue = {
  id: string
  name: string
  address: string
  postcode: string
  postcodeDistrict: string | null
  borough: string | null
  boroughId: string | null
  latitude: number
  longitude: number
  /** Outward codes this room belongs to. */
  postcodes: string[]
  areaIds: string[]
  aliases: string[]
  website: string | null
  note: string
  type: VenueType | string
  grassroots: boolean
  capacity: number | null
  sources: string[]
  curated: boolean
}

type VenueFile = {
  generated_at: string
  venue_count: number
  skiddle_included: boolean
  attribution: string
  venues: Venue[]
}

const FILE = venueFile as VenueFile
const VENUES = FILE.venues
const BY_ID = new Map(VENUES.map((venue) => [venue.id, venue]))

export const VENUE_ATTRIBUTION = FILE.attribution

export function venues(): Venue[] {
  return VENUES
}

export function venueById(id: string): Venue | undefined {
  return BY_ID.get(id)
}

export function curatedVenues(): Venue[] {
  return VENUES.filter((venue) => venue.curated)
}

export function venuePath(id: string): string {
  return `/venue/${id}`
}

export function venueTypeLabel(type: string): string {
  if (type === "music-venue") return "Music venue"
  if (type === "arts-centre") return "Arts centre"
  if (type === "concert-hall") return "Concert hall"
  return type.slice(0, 1).toUpperCase() + type.slice(1)
}

export function venueTypes(): string[] {
  return [...new Set(VENUES.map((venue) => venue.type))].sort()
}

export function venueBoroughs(): { id: string; name: string }[] {
  const byId = new Map<string, string>()
  for (const venue of VENUES) {
    if (venue.boroughId && venue.borough) byId.set(venue.boroughId, venue.borough)
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
}

export function filterVenues(
  list: Venue[],
  query: { q?: string; area?: string; type?: string },
): Venue[] {
  const text = (query.q ?? "").trim().toLowerCase()
  const area = (query.area ?? "").trim()
  const type = (query.type ?? "").trim()
  return list.filter((venue) => {
    if (type === "grassroots") {
      if (!venue.grassroots && venue.type !== "grassroots") return false
    } else if (type && venue.type !== type) {
      return false
    }
    if (area) {
      const region = regionById(area)
      const inArea = region
        ? (venue.postcodeDistrict ? districtInRegion(venue.postcodeDistrict, region.id) : false) ||
          venue.postcodes.some((code) => districtInRegion(code, region.id))
        : venue.postcodeDistrict === area ||
          venue.boroughId === area ||
          venue.postcodes.includes(area) ||
          venue.areaIds.includes(area)
      if (!inArea) return false
    }
    if (!text) return true
    const haystack = `${venue.name} ${venue.address} ${venue.postcode} ${venue.borough ?? ""}`.toLowerCase()
    return haystack.includes(text)
  })
}

export function groupVenues(list: Venue[]): { borough: string; boroughId: string | null; districts: { district: string; venues: Venue[] }[] }[] {
  const boroughs = new Map<string, { borough: string; boroughId: string | null; districts: Map<string, Venue[]> }>()
  for (const venue of list) {
    const borough = venue.borough || "London"
    const group = boroughs.get(borough) ?? { borough, boroughId: venue.boroughId, districts: new Map() }
    const district = venue.postcodeDistrict || "No district"
    const rooms = group.districts.get(district) ?? []
    rooms.push(venue)
    group.districts.set(district, rooms)
    boroughs.set(borough, group)
  }
  return [...boroughs.values()]
    .sort((left, right) => left.borough.localeCompare(right.borough, "en"))
    .map((group) => ({
      borough: group.borough,
      boroughId: group.boroughId,
      districts: [...group.districts.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([district, rooms]) => ({ district, venues: rooms })),
    }))
}

export function samePostcode(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = compactPostcode(left)
  const b = compactPostcode(right)
  return Boolean(a && b && a === b)
}
