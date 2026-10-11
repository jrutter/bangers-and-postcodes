import catalogueJson from "@/data/artists.json"

import { londonPostcodes } from "@/lib/districts"
import type { ArtistRecord, Catalogue, PlaceRecord } from "@/lib/types"
import { venueById } from "@/lib/venues"
import {
  artistsForPlace,
  artistsForPostcode,
  countPlaces,
  countPostcodes,
  placesForPostcode,
  postcodeList,
  precisionCounts,
} from "@/lib/stats"

export const catalogue = catalogueJson as Catalogue

export function places(): PlaceRecord[] {
  return catalogue.places
}

export function artists(): ArtistRecord[] {
  return catalogue.artists
}

export function postcodes(): string[] {
  const found = londonPostcodes()
  for (const postcode of postcodeList(catalogue.places)) {
    if (!found.includes(postcode)) found.push(postcode)
  }
  return found
}

export function placeById(id: string): PlaceRecord | undefined {
  return catalogue.places.find((place) => place.id === id)
}

export function knownPostcode(postcode: string): boolean {
  return postcodes().includes(postcode.toUpperCase())
}

export function artistsInPlace(placeId: string): ArtistRecord[] {
  return artistsForPlace(catalogue.artists, placeId).sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  )
}

export function artistsInPostcode(postcode: string): ArtistRecord[] {
  return artistsForPostcode(catalogue.artists, postcode).sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  )
}

export function areasInPostcode(postcode: string): PlaceRecord[] {
  return placesForPostcode(catalogue.places, postcode)
}

export function homePostcodeCounts() {
  return countPostcodes(catalogue.artists, catalogue.places)
}

export function homePlaceCounts() {
  return countPlaces(catalogue.artists, catalogue.places)
}

export function homePrecision() {
  return precisionCounts(catalogue.artists)
}

export type Scope =
  | { kind: "all" }
  | { kind: "postcode"; postcode: string }
  | { kind: "area"; placeId: string }
  | { kind: "venue"; venueId: string }
  | { kind: "week"; focus: "all" | { postcode: string } | { placeId: string } }

export function isGigScope(scope: Scope): scope is Extract<Scope, { kind: "week" | "venue" }> {
  return scope.kind === "week" || scope.kind === "venue"
}

export function parseScope(value: string | undefined | null): Scope | null {
  if (!value || value === "all") return { kind: "all" }
  if (value.startsWith("postcode:")) {
    const postcode = value.slice("postcode:".length).toUpperCase()
    if (!knownPostcode(postcode)) return null
    return { kind: "postcode", postcode }
  }
  if (value.startsWith("area:")) {
    const placeId = value.slice("area:".length)
    if (!placeById(placeId)) return null
    return { kind: "area", placeId }
  }
  if (value.startsWith("venue:")) {
    const venueId = value.slice("venue:".length)
    if (!venueById(venueId)) return null
    return { kind: "venue", venueId }
  }
  if (value.startsWith("week:")) {
    const rest = value.slice("week:".length)
    if (rest.toLowerCase() === "all") return { kind: "week", focus: "all" }
    const postcode = rest.toUpperCase()
    if (knownPostcode(postcode)) return { kind: "week", focus: { postcode } }
    if (placeById(rest)) return { kind: "week", focus: { placeId: rest } }
    return null
  }
  return null
}

export function scopeValue(scope: Scope): string {
  if (scope.kind === "all") return "all"
  if (scope.kind === "postcode") return `postcode:${scope.postcode}`
  if (scope.kind === "area") return `area:${scope.placeId}`
  if (scope.kind === "venue") return `venue:${scope.venueId}`
  if (scope.focus === "all") return "week:all"
  if ("postcode" in scope.focus) return `week:${scope.focus.postcode}`
  return `week:${scope.focus.placeId}`
}

export function scopeLabel(scope: Scope): string {
  if (scope.kind === "all") return "London"
  if (scope.kind === "postcode") return scope.postcode
  if (scope.kind === "area") return placeById(scope.placeId)?.name ?? scope.placeId
  if (scope.kind === "venue") return venueById(scope.venueId)?.name ?? "Venue"
  if (scope.focus === "all") return "This week in SW London"
  if ("postcode" in scope.focus) return `This week near ${scope.focus.postcode}`
  return `This week around ${placeById(scope.focus.placeId)?.name ?? "this area"}`
}

export function gigScopePhrase(scope: Extract<Scope, { kind: "week" | "venue" }>): string {
  if (scope.kind === "venue") return `at ${venueById(scope.venueId)?.name ?? "this venue"}`
  if (scope.focus === "all") return "in southwest London in the next 7 days"
  if ("postcode" in scope.focus) return `near ${scope.focus.postcode} in the next 7 days`
  return `around ${placeById(scope.focus.placeId)?.name ?? "this area"} in the next 7 days`
}

export function artistsForScope(scope: Scope): ArtistRecord[] {
  if (scope.kind === "all") return catalogue.artists
  if (scope.kind === "postcode") return artistsInPostcode(scope.postcode)
  if (scope.kind === "area") return artistsInPlace(scope.placeId)
  return []
}

export function playlistPath(scope: Scope = { kind: "all" }): string {
  if (scope.kind === "all") return "/playlist"
  return `/playlist?scope=${encodeURIComponent(scopeValue(scope))}`
}

export function postcodePath(postcode: string): string {
  return `/postcode/${postcode.toLowerCase()}`
}

export function areaPath(placeId: string): string {
  return `/area/${placeId}`
}

export function formatGeneratedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}
