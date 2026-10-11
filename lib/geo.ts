/** Outward-code centroids from postcodes.io (October 2026). */

export type LatLng = {
  latitude: number
  longitude: number
}

export const POSTCODE_CENTROIDS: Record<string, LatLng> = {
  SW13: { latitude: 51.4763, longitude: -0.24326 },
  SW15: { latitude: 51.45696, longitude: -0.2286 },
  SW14: { latitude: 51.46537, longitude: -0.267 },
  SW6: { latitude: 51.47654, longitude: -0.20095 },
  SW18: { latitude: 51.45151, longitude: -0.19143 },
  SW19: { latitude: 51.42417, longitude: -0.20282 },
  TW9: { latitude: 51.46962, longitude: -0.29235 },
  TW10: { latitude: 51.44767, longitude: -0.30296 },
  KT1: { latitude: 51.40761, longitude: -0.29828 },
  KT2: { latitude: 51.41905, longitude: -0.29046 },
  // Twickenham and Balham are outside the catalogue districts. They are here
  // because curated venues sit in TW1 and SW12.
  TW1: { latitude: 51.45101, longitude: -0.32536 },
  SW12: { latitude: 51.44632, longitude: -0.14906 },
}

const CATALOGUE_POSTCODES = ["SW13", "SW15", "SW14", "SW6", "SW18", "SW19", "TW9", "TW10", "KT1", "KT2"]

export function coveredPostcodes(): string[] {
  return Object.keys(POSTCODE_CENTROIDS)
}

export function cataloguePostcodes(): string[] {
  return CATALOGUE_POSTCODES.filter((code) => POSTCODE_CENTROIDS[code])
}

export function centroid(postcode: string): LatLng | null {
  return POSTCODE_CENTROIDS[postcode.toUpperCase()] ?? null
}

/** Mean of the catalogue district centroids. An 8 mile radius reaches Kingston, Wimbledon, Fulham, and Twickenham. */
export function southwestSearchPoint(): LatLng & { radiusMiles: number } {
  const points = cataloguePostcodes().map((code) => POSTCODE_CENTROIDS[code])
  const latitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length
  const longitude = points.reduce((sum, point) => sum + point.longitude, 0) / points.length
  return { latitude, longitude, radiusMiles: 8 }
}

export function outwardCode(postcode: string | null | undefined): string | null {
  if (!postcode) return null
  const compact = postcode.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const full = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/)
  if (full) return full[1]
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(compact)) return compact
  return null
}

export function compactPostcode(postcode: string | null | undefined): string | null {
  if (!postcode) return null
  const compact = postcode.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return compact || null
}

export function milesBetween(left: LatLng, right: LatLng): number {
  const earthMiles = 3958.8
  const lat1 = toRadians(left.latitude)
  const lat2 = toRadians(right.latitude)
  const dLat = toRadians(right.latitude - left.latitude)
  const dLon = toRadians(right.longitude - left.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earthMiles * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function londonDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

export function searchWindow(now: Date, days = 90): { from: string; to: string } {
  const from = londonDate(now)
  return { from, to: addDays(from, days) }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
