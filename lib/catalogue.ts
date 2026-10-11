import catalogueJson from "@/data/artists.json"

import type { ArtistRecord, Catalogue, PlaceRecord } from "@/lib/types"
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
  return postcodeList(catalogue.places)
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
  return null
}

export function scopeValue(scope: Scope): string {
  if (scope.kind === "all") return "all"
  if (scope.kind === "postcode") return `postcode:${scope.postcode}`
  return `area:${scope.placeId}`
}

export function scopeLabel(scope: Scope): string {
  if (scope.kind === "all") return "SW London"
  if (scope.kind === "postcode") return scope.postcode
  return placeById(scope.placeId)?.name ?? scope.placeId
}

export function artistsForScope(scope: Scope): ArtistRecord[] {
  if (scope.kind === "all") return catalogue.artists
  if (scope.kind === "postcode") return artistsInPostcode(scope.postcode)
  return artistsInPlace(scope.placeId)
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
