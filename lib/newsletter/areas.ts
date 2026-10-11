import { areasInPostcode, places, postcodes } from "@/lib/catalogue"
import { placeGigPostcodes } from "@/lib/gigs/select"
import type { Scope } from "@/lib/catalogue"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type NewsletterArea = {
  code: string
  label: string
}

export function subscribablePostcodes(): string[] {
  return postcodes()
}

export function newsletterAreas(): NewsletterArea[] {
  return subscribablePostcodes().map((code) => ({
    code,
    label: areaLabel(code),
  }))
}

export function areaLabel(code: string): string {
  const names = areasInPostcode(code)
    .filter((place) => place.precision === "place")
    .map((place) => place.name)
  return names.length > 0 ? names.join(" & ") : code
}

export function areaPostcodeMap(): Record<string, string[]> {
  const allowed = new Set(subscribablePostcodes())
  const map: Record<string, string[]> = {}
  for (const place of places()) {
    const codes = place.precision === "borough" ? placeGigPostcodes(place.id) : place.postcodes
    map[place.id] = codes.filter((code) => allowed.has(code))
  }
  return map
}

export function defaultAreasForScope(scope: Scope): string[] {
  const allowed = new Set(subscribablePostcodes())
  if (scope.kind === "postcode") return allowed.has(scope.postcode) ? [scope.postcode] : []
  if (scope.kind === "area") return (areaPostcodeMap()[scope.placeId] ?? []).filter((code) => allowed.has(code))
  return []
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  if (email.length < 3 || email.length > 254 || !EMAIL.test(email)) return null
  return email
}

export function normalizeAreas(values: string[]): string[] | null {
  const allowed = new Set(subscribablePostcodes())
  const codes = [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))]
  if (codes.length === 0 || codes.length > 12) return null
  if (codes.some((code) => !allowed.has(code))) return null
  codes.sort()
  return codes
}
