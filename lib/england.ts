import { knownPagePostcode } from "@/lib/page-data"
import { areaPath, postcodePath } from "@/lib/paths"
import { namesMatch, normalizeName } from "@/lib/names"
import type { PlaceRecord } from "@/lib/types"

/** MusicBrainz area for England. Its type is Subdivision, and the ISO code is GB-ENG. */
export const ENGLAND_AREA_MBID = "9d5dd675-3cf4-4296-9e39-67865ebee758"
/** MusicBrainz area for the United Kingdom. Country code GB, which is not England. */
export const UNITED_KINGDOM_AREA_MBID = "8a754a16-0027-3a29-b6d7-2b40ea0481ed"

export const ENGLAND_QID = "Q21"
export const SCOTLAND_QID = "Q22"
export const WALES_QID = "Q25"
export const NORTHERN_IRELAND_QID = "Q26"
export const UK_QID = "Q145"

export type OriginStatus = "england" | "elsewhere" | "unknown" | "unchecked"

export type OriginHit = {
  status: OriginStatus
  place: string | null
  source: string | null
  qid: string | null
  areaMbid: string | null
}

export const UNCHECKED: OriginHit = {
  status: "unchecked",
  place: null,
  source: null,
  qid: null,
  areaMbid: null,
}

export type AreaSignal = {
  id?: string | null
  name?: string | null
  type?: string | null
  qid?: string | null
  iso31661?: string[] | null
  iso31662?: string[] | null
  /** A country that is not the UK and not a UK nation. */
  foreign?: boolean
}

export type FavouriteReason = "top-short" | "top-medium" | "top-long" | "followed"

export type FavouriteArtist = {
  id: string
  name: string
  image: string | null
  reasons: FavouriteReason[]
}

export type FavouriteLink = { label: string; href: string }

export type FavouriteCard = {
  id: string
  name: string
  image: string | null
  why: string
  place: string | null
  source: string | null
  links: FavouriteLink[]
  spotifyUrl: string
}

export type FavouriteView = {
  english: FavouriteCard[]
  unknown: FavouriteCard[]
  unchecked: FavouriteCard[]
  elsewhereCount: number
}

const WHY: Record<FavouriteReason, string> = {
  "top-short": "Top artist, last 4 weeks",
  "top-medium": "Top artist, last 6 months",
  "top-long": "Top artist, several years",
  followed: "Followed",
}

const WHY_RANK: Record<FavouriteReason, number> = {
  "top-short": 4,
  "top-medium": 3,
  "top-long": 2,
  followed: 1,
}

/**
 * Most specific area first. England wins only from England itself (Q21, GB-ENG, or the
 * England area), never from country code GB. Scotland, Wales, and Northern Ireland are elsewhere.
 */
export function classifyChain(areas: AreaSignal[]): "england" | "elsewhere" | "unknown" {
  let sawBritain = false
  for (const area of areas) {
    const nation = nationOf(area)
    if (nation === "england") return "england"
    if (nation === "scotland" || nation === "wales" || nation === "northern-ireland" || nation === "other") return "elsewhere"
    if (isBritainOnly(area)) sawBritain = true
  }
  if (sawBritain) return "unknown"
  return "unknown"
}

export function nationOf(area: AreaSignal): "england" | "scotland" | "wales" | "northern-ireland" | "other" | null {
  if (area.id === UNITED_KINGDOM_AREA_MBID || area.qid === UK_QID) return null
  const iso2 = upper(area.iso31662)
  if (iso2.includes("GB-ENG")) return "england"
  if (iso2.includes("GB-SCT")) return "scotland"
  if (iso2.includes("GB-WLS")) return "wales"
  if (iso2.includes("GB-NIR")) return "northern-ireland"
  if (area.qid === ENGLAND_QID || area.id === ENGLAND_AREA_MBID) return "england"
  if (area.qid === SCOTLAND_QID) return "scotland"
  if (area.qid === WALES_QID) return "wales"
  if (area.qid === NORTHERN_IRELAND_QID) return "northern-ireland"
  if (area.foreign) return "other"
  const iso1 = upper(area.iso31661).filter((code) => code !== "GB")
  if (iso1.length > 0) return "other"
  const name = area.name?.trim().toLowerCase()
  if (!name || !countryish(area.type)) return null
  if (name === "england") return "england"
  if (name === "scotland") return "scotland"
  if (name === "wales") return "wales"
  if (name === "northern ireland") return "northern-ireland"
  return null
}

export function whyText(reasons: FavouriteReason[]): string {
  const ordered = [...reasons].sort((left, right) => WHY_RANK[right] - WHY_RANK[left])
  const labels: string[] = []
  for (const reason of ordered) {
    if (!labels.includes(WHY[reason])) labels.push(WHY[reason])
  }
  return labels.join(" · ")
}

export function dedupeFavourites(artists: FavouriteArtist[]): FavouriteArtist[] {
  const byId = new Map<string, FavouriteArtist>()
  for (const artist of artists) {
    if (!artist.id || !artist.name.trim()) continue
    const current = byId.get(artist.id)
    if (!current) {
      byId.set(artist.id, { ...artist, name: artist.name.trim(), reasons: uniqueReasons(artist.reasons) })
      continue
    }
    current.reasons = uniqueReasons([...current.reasons, ...artist.reasons])
    if (!current.image && artist.image) current.image = artist.image
  }
  return [...byId.values()]
}

export function catalogueLinks(hit: OriginHit, places: PlaceRecord[]): FavouriteLink[] {
  const place = matchPlace(hit, places)
  if (!place) return []
  const links: FavouriteLink[] = [{ label: place.name, href: areaPath(place.id) }]
  for (const postcode of place.postcodes) {
    if (!knownPagePostcode(postcode)) continue
    links.push({ label: postcode, href: postcodePath(postcode) })
  }
  return links
}

export function assembleFavourites(
  artists: FavouriteArtist[],
  origins: ReadonlyMap<string, OriginHit>,
  places: PlaceRecord[],
): FavouriteView {
  const english: FavouriteCard[] = []
  const unknown: FavouriteCard[] = []
  const unchecked: FavouriteCard[] = []
  let elsewhereCount = 0
  artists.forEach((artist, index) => {
    const hit = origins.get(artist.id) ?? UNCHECKED
    const card = toCard(artist, hit, places)
    if (hit.status === "england") english.push(card)
    else if (hit.status === "elsewhere") elsewhereCount += 1
    else if (hit.status === "unchecked") unchecked.push(card)
    else unknown.push(card)
    void index
  })
  const rank = (artist: FavouriteArtist) => Math.max(...artist.reasons.map((reason) => WHY_RANK[reason]), 0)
  const order = new Map(artists.map((artist, index) => [artist.id, index]))
  const sortCards = (cards: FavouriteCard[]) =>
    cards.sort((left, right) => {
      const leftArtist = artists.find((artist) => artist.id === left.id)
      const rightArtist = artists.find((artist) => artist.id === right.id)
      const score = rank(rightArtist ?? { id: "", name: "", image: null, reasons: [] }) - rank(leftArtist ?? { id: "", name: "", image: null, reasons: [] })
      if (score !== 0) return score
      return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)
    })
  return {
    english: sortCards(english),
    unknown: sortCards(unknown),
    unchecked,
    elsewhereCount,
  }
}

export function spotifyArtistUrl(id: string): string {
  return `https://open.spotify.com/artist/${encodeURIComponent(id)}`
}

function toCard(artist: FavouriteArtist, hit: OriginHit, places: PlaceRecord[]): FavouriteCard {
  return {
    id: artist.id,
    name: artist.name,
    image: artist.image,
    why: whyText(artist.reasons),
    place: hit.status === "england" ? hit.place || "England" : hit.place,
    source: hit.source,
    links: hit.status === "england" ? catalogueLinks(hit, places) : [],
    spotifyUrl: spotifyArtistUrl(artist.id),
  }
}

function matchPlace(hit: OriginHit, places: PlaceRecord[]): PlaceRecord | null {
  const byQid = hit.qid ? places.find((place) => place.wikidata_qid === hit.qid) : undefined
  if (byQid) return byQid
  const byArea = hit.areaMbid ? places.find((place) => place.musicbrainz_area_mbid === hit.areaMbid) : undefined
  if (byArea) return byArea
  const wanted = hit.place ? normalizeName(hit.place) : ""
  if (!wanted) return null
  const named = places.filter((place) => namesMatch(place.name, hit.place || ""))
  return named.find((place) => place.precision === "place") ?? named[0] ?? null
}

function isBritainOnly(area: AreaSignal): boolean {
  if (area.id === UNITED_KINGDOM_AREA_MBID || area.qid === UK_QID) return true
  return upper(area.iso31661).includes("GB") && upper(area.iso31662).length === 0 && !area.qid
}

function countryish(type: string | null | undefined): boolean {
  if (!type) return true
  const value = type.toLowerCase()
  return value === "country" || value === "subdivision"
}

function upper(values: string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.toUpperCase())
}

function uniqueReasons(reasons: FavouriteReason[]): FavouriteReason[] {
  const seen = new Set<FavouriteReason>()
  const result: FavouriteReason[] = []
  for (const reason of reasons) {
    if (seen.has(reason)) continue
    seen.add(reason)
    result.push(reason)
  }
  return result
}
