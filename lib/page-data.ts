import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { ArtistRecord } from "@/lib/types"

export type RegionSummary = {
  id: string
  name: string
  districts: number
  artists: number
  venues: number
}

export type HomePageData = {
  generated_at: string
  artist_count: number
  precision: { withPlace: number; boroughOnly: number }
  regions: RegionSummary[]
  boroughs: { id: string; name: string; artistCount: number }[]
  curatedVenues: { id: string; name: string; postcode: string; note: string }[]
}

export type PageArtist = ArtistRecord & { slug: string }

export type PageRoom = {
  id: string
  name: string
  type: string
  postcode: string
  postcodeDistrict: string | null
}

export type RegionPageData = {
  id: string
  artistCount: number
  districts: { code: string; artistCount: number }[]
  artists: { slug: string; name: string; life_span: ArtistRecord["life_span"]; postcodes: string[] }[]
  venues: PageRoom[]
}

export type AreaPageData = {
  id: string
  name: string
  precision: string
  note: string
  postcodes: string[]
  regionId: string | null
  artists: PageArtist[]
  rooms: PageRoom[]
}

export type PostcodePageData = {
  code: string
  regionId: string | null
  placeNames: string[]
  places: { href: string; label: string }[]
  artists: PageArtist[]
  rooms: PageRoom[]
}

export type VenuePageData = {
  id: string
  name: string
  address: string
  postcode: string
  postcodeDistrict: string | null
  borough: string | null
  boroughId: string | null
  type: string
  grassroots: boolean
  capacity: number | null
  note: string
  website: string | null
  regionId: string | null
  postcodeLinks: { code: string; href: string | null }[]
  areaLinks: { id: string; name: string }[]
}

export type ArtistPageData = {
  slug: string
  artist: PageArtist
}

export type TasteRow = {
  slug: string
  name: string
  tags: string[]
  postcodes: string[]
  placeIds: string[]
}

export type VenueIndexEntry = {
  id: string
  name: string
  address: string
  postcode: string
  regionId: string | null
}

export type VenueMatch = {
  id: string
  name: string
  aliases: string[]
  postcode: string
  postcodeDistrict: string | null
  latitude: number
  longitude: number
  postcodes: string[]
  areaIds: string[]
}

export type NewsletterFile = {
  postcodes: string[]
  areas: { code: string; label: string; regionId: string; regionName: string }[]
  placePostcodes: Record<string, string[]>
}

export type PageManifest = {
  regions: string[]
  areas: string[]
  postcodes: string[]
  venues: string[]
  artistCount: number
}

const memory = new Map<string, unknown>()

function readJson<T>(relative: string): T {
  if (relative.includes("..") || relative.startsWith("/")) throw new Error(`Unsafe page data path: ${relative}`)
  const cached = memory.get(relative)
  if (cached) return cached as T
  const file = join(process.cwd(), "data", "pages", relative)
  let text: string
  try {
    text = readFileSync(file, "utf8")
  } catch {
    throw new Error(`Missing ${file}. Run node scripts/build-page-data.mjs`)
  }
  const data = JSON.parse(text) as T
  memory.set(relative, data)
  return data
}

function readOptional<T>(relative: string): T | null {
  try {
    return readJson<T>(relative)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing ")) return null
    throw error
  }
}

export function readHome(): HomePageData {
  return readJson("home.json")
}

export function readManifest(): PageManifest {
  return readJson("manifest.json")
}

export function readRegion(id: string): RegionPageData | null {
  return readOptional(`regions/${id}.json`)
}

export function readArea(id: string): AreaPageData | null {
  return readOptional(`areas/${id}.json`)
}

export function readPostcode(code: string): PostcodePageData | null {
  return readOptional(`postcodes/${code.toLowerCase()}.json`)
}

export function readVenuePage(id: string): VenuePageData | null {
  return readOptional(`venues/${id}.json`)
}

export function readArtist(slug: string): ArtistPageData | null {
  return readOptional(`artists/${slug}.json`)
}

export function readArtistIndex(): { slug: string; name: string }[] {
  return readJson("artist-index.json")
}

export function readTasteIndex(): TasteRow[] {
  return readJson("taste-index.json")
}

export function readPlacePostcodes(): Record<string, string[]> {
  return readJson("place-postcodes.json")
}

export function readVenueMatch(): VenueMatch[] {
  return readJson("venue-match.json")
}

export function readVenueIndex(): VenueIndexEntry[] {
  return readJson("venue-index.json")
}

const venueMatchByIdCache = new Map<string, VenueMatch>()
let venueMatchLoaded = false

export function venueMatchById(id: string): VenueMatch | undefined {
  if (!venueMatchLoaded) {
    for (const venue of readVenueMatch()) venueMatchByIdCache.set(venue.id, venue)
    venueMatchLoaded = true
  }
  return venueMatchByIdCache.get(id)
}

export function readNewsletterFile(): NewsletterFile {
  return readJson("newsletter.json")
}

export function knownPagePostcode(code: string): boolean {
  const wanted = code.toUpperCase()
  return readManifest().postcodes.some((item) => item.toUpperCase() === wanted)
}
