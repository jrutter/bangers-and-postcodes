export type Scope =
  | { kind: "all" }
  | { kind: "english" }
  | { kind: "region"; regionId: string }
  | { kind: "postcode"; postcode: string }
  | { kind: "area"; placeId: string }
  | { kind: "venue"; venueId: string }
  | { kind: "week"; focus: "all" | { postcode: string } | { placeId: string } }

export function isGigScope(scope: Scope): scope is Extract<Scope, { kind: "week" | "venue" }> {
  return scope.kind === "week" || scope.kind === "venue"
}

export function scopeValue(scope: Scope): string {
  if (scope.kind === "all") return "all"
  if (scope.kind === "english") return "english"
  if (scope.kind === "region") return `region:${scope.regionId}`
  if (scope.kind === "postcode") return `postcode:${scope.postcode}`
  if (scope.kind === "area") return `area:${scope.placeId}`
  if (scope.kind === "venue") return `venue:${scope.venueId}`
  if (scope.focus === "all") return "week:all"
  if ("postcode" in scope.focus) return `week:${scope.focus.postcode}`
  return `week:${scope.focus.placeId}`
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

export function artistPath(slug: string): string {
  return `/artist/${slug}`
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
