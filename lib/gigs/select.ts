import { readPlacePostcodes, readVenueMatch, venueMatchById, type VenueMatch } from "@/lib/page-data"
import type { Scope } from "@/lib/paths"
import { districtPoint, LONDON_DISTRICTS } from "@/lib/districts"
import {
  NEAR_MILES,
  VENUE_MATCH_MILES,
  GIG_LINEUP_CAP,
  GIG_PLAYLIST_CAP,
} from "@/lib/gigs/constants"
import type { Gig, GigSelection, TaggedGig } from "@/lib/gigs/types"
import {
  addDays,
  compactPostcode,
  coveredPostcodes,
  londonDate,
  milesBetween,
  outwardCode,
} from "@/lib/geo"
import { namesMatch, normalizeName } from "@/lib/names"
import { districtInRegion, regionForPostcode, regions } from "@/lib/regions"
import type { ArtistRecord } from "@/lib/types"

const GENERIC_BILLS = new Set([
  "live music",
  "open mic",
  "open mic night",
  "dj",
  "djs",
  "dj set",
  "club night",
  "karaoke",
  "quiz",
  "quiz night",
  "various",
  "various artists",
  "tbc",
  "tba",
  "special guest",
  "special guests",
])

/** Borough records in the catalogue have no postcodes of their own. These are the districts their gig lists cover. */
const BOROUGH_POSTCODES: Record<string, string[]> = {
  "richmond-borough": ["SW13", "SW14", "TW9", "TW10", "TW1"],
  "wandsworth-borough": ["SW15", "SW18", "SW12"],
  "kingston-borough": ["KT1", "KT2"],
}

export function placeGigPostcodes(placeId: string): string[] {
  if (BOROUGH_POSTCODES[placeId]) return BOROUGH_POSTCODES[placeId]
  return readPlacePostcodes()[placeId] ?? []
}

export function venueForGig(gig: Pick<Gig, "venueName" | "postcode" | "latitude" | "longitude">): VenueMatch | null {
  const gigName = normalizeName(gig.venueName)
  if (!gigName) return null
  const outward = outwardCode(gig.postcode)
  let best: { venue: VenueMatch; score: number } | null = null
  for (const venue of readVenueMatch()) {
    const aliases = [venue.name, ...venue.aliases]
    if (!aliases.some((alias) => nameHits(gigName, normalizeName(alias)))) continue
    const sameFull = postcodesMatch(gig.postcode, venue.postcode)
    const sameOutward = Boolean(outward && outward === outwardCode(venue.postcode))
    const near = isNearVenue(gig, venue)
    if (!sameFull && !sameOutward && !near) continue
    const score = (sameFull ? 4 : 0) + (near ? 2 : 0) + (sameOutward ? 1 : 0)
    if (!best || score > best.score) best = { venue, score }
  }
  return best?.venue ?? null
}

export function inSouthwest(gig: Gig): boolean {
  const code = outwardCode(gig.postcode)
  if (code) return coveredPostcodes().includes(code)
  if (venueForGig(gig)) return true
  return coveredPostcodes().some((postcode) => nearPostcode(gig, postcode, NEAR_MILES))
}

/** A listing counts when its postcode, matched venue, or coordinates sit in Greater London. */
export function inLondon(gig: Gig): boolean {
  return assignedDistrict(gig) != null
}

export function assignedDistrict(gig: Pick<Gig, "venueName" | "postcode" | "latitude" | "longitude">): string | null {
  const venue = venueForGig(gig)
  const fromVenue = venue?.postcodeDistrict ?? (venue ? outwardCode(venue.postcode) : null)
  if (fromVenue && districtPoint(fromVenue)) return fromVenue
  const code = outwardCode(gig.postcode)
  if (code && districtPoint(code)) return code
  return nearestDistrict(gig)
}

export type ListingVenue = {
  id: string
  name: string
  postcode: string | null
  district: string | null
}

/** Rooms on a bill that did not match the curated venue file. One row per name and district. */
export function listingVenues(gigs: TaggedGig[]): ListingVenue[] {
  const seen = new Set<string>()
  const rooms: ListingVenue[] = []
  for (const gig of gigs) {
    if (gig.venueId) continue
    const name = gig.venueName.trim()
    if (!name) continue
    const district = assignedDistrict(gig)
    const id = listingVenueId(name, district)
    if (seen.has(id)) continue
    seen.add(id)
    rooms.push({ id, name, postcode: gig.postcode, district })
  }
  rooms.sort((left, right) => left.name.localeCompare(right.name, "en"))
  return rooms
}

export function listingVenueId(name: string, district: string | null): string {
  const slug = normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room"
  return `listing-${slug}${district ? `-${district.toLowerCase()}` : ""}`
}

export function weekCountsByRegion(gigs: Gig[], now: Date): { id: string; name: string; count: number }[] {
  const week = selectGigs(gigs, { kind: "london" }, "week", now)
  const counts = new Map(regions().map((region) => [region.id, 0]))
  for (const gig of week) {
    const district = assignedDistrict(gig)
    const region = district ? regionForPostcode(district) : null
    if (!region) continue
    counts.set(region.id, (counts.get(region.id) ?? 0) + 1)
  }
  return regions().map((region) => ({ id: region.id, name: region.name, count: counts.get(region.id) ?? 0 }))
}

export function selectGigs(gigs: Gig[], selection: GigSelection, span: "upcoming" | "week" | "later", now: Date): TaggedGig[] {
  const today = londonDate(now)
  const last = addDays(today, 6)
  return gigs
    .filter((gig) => {
      if (!gig.date || gig.date < today) return false
      if (span === "week" && gig.date > last) return false
      if (span === "later" && gig.date <= last) return false
      return matchesSelection(gig, selection)
    })
    .map((gig) => ({ ...gig, venueId: venueForGig(gig)?.id ?? null }))
    .sort(compareGigs)
}

export function dedupeGigs(gigs: Gig[]): Gig[] {
  const byKey = new Map<string, Gig>()
  for (const gig of gigs) {
    const key = dedupeKey(gig)
    const current = byKey.get(key)
    byKey.set(key, current ? preferGig(current, gig) : gig)
  }
  return [...byKey.values()].sort(compareGigs)
}

export function lineupNames(gigs: Gig[], cap = GIG_PLAYLIST_CAP): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const gig of gigs) {
    let added = 0
    for (const raw of gig.artistNames) {
      if (added >= GIG_LINEUP_CAP || names.length >= cap) break
      const name = raw.trim()
      const key = normalizeName(name)
      if (!key || key.length < 2 || seen.has(key) || GENERIC_BILLS.has(key)) continue
      if (namesMatch(name, gig.venueName)) continue
      seen.add(key)
      names.push(name)
      added += 1
    }
    if (names.length >= cap) break
  }
  return names
}

export function artistRecordsForGigs(gigs: Gig[]): ArtistRecord[] {
  return lineupNames(gigs).map((name) => ({
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
  }))
}

export function selectionForScope(scope: Extract<Scope, { kind: "week" | "venue" }>): {
  selection: GigSelection
  span: "week" | "upcoming"
} {
  if (scope.kind === "venue") return { selection: { kind: "venue", venueId: scope.venueId }, span: "upcoming" }
  if (scope.focus === "all") return { selection: { kind: "london" }, span: "week" }
  if ("postcode" in scope.focus) return { selection: { kind: "postcode", postcode: scope.focus.postcode }, span: "week" }
  return { selection: { kind: "place", placeId: scope.focus.placeId }, span: "week" }
}

export function gigsForArtist(artistName: string, gigs: TaggedGig[]): TaggedGig[] {
  return gigs.filter((gig) => gig.artistNames.some((name) => namesMatch(name, artistName))).slice(0, 3)
}

export function formatGigWhen(gig: Pick<Gig, "startsAt" | "date" | "doorTime">): string {
  if (gig.startsAt) {
    const parsed = new Date(gig.startsAt)
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
        hourCycle: "h23",
      }).format(parsed)
    }
  }
  if (gig.date) {
    const [year, month, day] = gig.date.split("-").map(Number)
    const utc = new Date(Date.UTC(year, month - 1, day))
    const label = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(utc)
    return gig.doorTime ? `${label}, ${gig.doorTime}` : label
  }
  return "Date to be confirmed"
}

function matchesSelection(gig: Gig, selection: GigSelection): boolean {
  if (selection.kind === "london") return inLondon(gig)
  if (selection.kind === "southwest") return inSouthwest(gig)
  if (selection.kind === "region") {
    const district = assignedDistrict(gig)
    return Boolean(district && districtInRegion(district, selection.regionId))
  }
  if (selection.kind === "postcode") return matchesPostcode(gig, selection.postcode)
  if (selection.kind === "place") return matchesPlace(gig, selection.placeId)
  const venue = venueMatchById(selection.venueId)
  if (!venue) return false
  return venueForGig(gig)?.id === venue.id
}

function matchesPlace(gig: Gig, placeId: string): boolean {
  const venue = venueForGig(gig)
  if (venue?.areaIds.includes(placeId)) return true
  return placeGigPostcodes(placeId).some((postcode) => matchesPostcode(gig, postcode))
}

function matchesPostcode(gig: Gig, postcode: string): boolean {
  const venue = venueForGig(gig)
  if (venue?.postcodes.includes(postcode)) return true
  const code = outwardCode(gig.postcode)
  if (code) return code === postcode
  return nearPostcode(gig, postcode, NEAR_MILES)
}

function nearPostcode(gig: Pick<Gig, "latitude" | "longitude">, postcode: string, miles: number): boolean {
  if (gig.latitude == null || gig.longitude == null) return false
  const point = districtPoint(postcode)
  if (!point) return false
  return milesBetween({ latitude: gig.latitude, longitude: gig.longitude }, point) <= miles
}

function nearestDistrict(gig: Pick<Gig, "latitude" | "longitude">): string | null {
  if (gig.latitude == null || gig.longitude == null) return null
  let best: { code: string; miles: number } | null = null
  for (const district of LONDON_DISTRICTS) {
    const miles = milesBetween({ latitude: gig.latitude, longitude: gig.longitude }, district)
    if (miles > NEAR_MILES) continue
    if (!best || miles < best.miles) best = { code: district.postcode, miles }
  }
  return best?.code ?? null
}

function postcodesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = compactPostcode(left)
  const b = compactPostcode(right)
  return Boolean(a && b && a === b)
}

function isNearVenue(gig: Pick<Gig, "latitude" | "longitude">, venue: VenueMatch): boolean {
  if (gig.latitude == null || gig.longitude == null) return false
  return (
    milesBetween(
      { latitude: gig.latitude, longitude: gig.longitude },
      { latitude: venue.latitude, longitude: venue.longitude },
    ) <= VENUE_MATCH_MILES
  )
}

function nameHits(gigName: string, alias: string): boolean {
  if (!gigName || !alias) return false
  if (gigName === alias) return true
  if (alias.length >= 8 && gigName.includes(alias)) return true
  if (gigName.length >= 8 && alias.startsWith(gigName)) return true
  return false
}

function dedupeKey(gig: Gig): string {
  const artist = normalizeName(gig.artistNames[0] || gig.title)
  const venue = normalizeName(gig.venueName)
  return `${artist}|${venue}|${gig.date ?? ""}`
}

function preferGig(left: Gig, right: Gig): Gig {
  return scoreGig(right) > scoreGig(left) ? right : left
}

function scoreGig(gig: Gig): number {
  return (gig.ticketUrl ? 2 : 0) + Math.min(gig.artistNames.length, 4) + (gig.startsAt ? 1 : 0) + (gig.postcode ? 1 : 0)
}

function compareGigs(left: Gig, right: Gig): number {
  const leftDate = left.date ?? "9999-99-99"
  const rightDate = right.date ?? "9999-99-99"
  if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1
  const byVenue = left.venueName.localeCompare(right.venueName, "en")
  if (byVenue !== 0) return byVenue
  return left.title.localeCompare(right.title, "en")
}
