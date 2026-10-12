import { LONDON_DISTRICTS } from "@/lib/districts"
import { TILE_RADIUS_MILES, TILE_SPACING_MILES } from "@/lib/gigs/constants"
import { milesBetween, type LatLng } from "@/lib/geo"

export type SearchTile = LatLng & { radiusMiles: number }

const MILES_PER_LAT = 69

/**
 * Circles that together cover every Greater London district.
 * A square of TILE_SPACING_MILES has a corner TILE_SPACING_MILES / √2 from its centre,
 * which is inside the 8 mile radius, and any district the grid still misses gets its own tile.
 */
export function londonSearchTiles(): SearchTile[] {
  const districts = LONDON_DISTRICTS
  if (districts.length === 0) return []
  const lats = districts.map((district) => district.latitude)
  const lngs = districts.map((district) => district.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const midLat = (minLat + maxLat) / 2
  const milesPerLng = MILES_PER_LAT * Math.cos((midLat * Math.PI) / 180)
  const latStep = TILE_SPACING_MILES / MILES_PER_LAT
  const lngStep = TILE_SPACING_MILES / milesPerLng
  const tiles: SearchTile[] = []
  for (let lat = minLat; lat <= maxLat + latStep * 0.01; lat += latStep) {
    for (let lng = minLng; lng <= maxLng + lngStep * 0.01; lng += lngStep) {
      const centre = { latitude: round(lat), longitude: round(lng) }
      const covers = districts.some((district) => milesBetween(centre, district) <= TILE_RADIUS_MILES)
      if (covers) tiles.push({ ...centre, radiusMiles: TILE_RADIUS_MILES })
    }
  }
  for (const district of districts) {
    const covered = tiles.some((tile) => milesBetween(tile, district) <= TILE_RADIUS_MILES)
    if (covered) continue
    tiles.push({
      latitude: round(district.latitude),
      longitude: round(district.longitude),
      radiusMiles: TILE_RADIUS_MILES,
    })
  }
  return tiles
}

function round(value: number): number {
  return Math.round(value * 1e5) / 1e5
}
