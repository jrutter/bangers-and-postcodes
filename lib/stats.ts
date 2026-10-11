import type { ArtistRecord, MatchedArtist, PlaceRecord } from "@/lib/types"

export type PlaceCount = {
  placeId: string
  placeName: string
  postcodes: string[]
  precision: string
  artistCount: number
  note: string
}

export type PostcodeCount = {
  postcode: string
  placeIds: string[]
  artistCount: number
}

export type ArtistSummary = {
  artistCount: number
  spotifyMatched: number
  spotifyUnmatched: number
  withPopularity: number
  withFollowers: number
  withTrack: number
  top: MatchedArtist[]
}

export function hasPlace(artist: ArtistRecord, placeId: string): boolean {
  return artist.locality.some((place) => place.place_id === placeId)
}

export function hasPostcode(artist: ArtistRecord, postcode: string, precision = "place"): boolean {
  return artist.locality.some(
    (place) => place.precision === precision && place.postcodes.includes(postcode),
  )
}

export function artistsForPlace(artists: ArtistRecord[], placeId: string): ArtistRecord[] {
  return artists.filter((artist) => hasPlace(artist, placeId))
}

export function artistsForPostcode(artists: ArtistRecord[], postcode: string): ArtistRecord[] {
  return artists.filter((artist) => hasPostcode(artist, postcode.toUpperCase(), "place"))
}

export function postcodeList(places: PlaceRecord[]): string[] {
  const found: string[] = []
  for (const place of places) {
    for (const postcode of place.postcodes) {
      if (!found.includes(postcode)) found.push(postcode)
    }
  }
  return found
}

export function placesForPostcode(places: PlaceRecord[], postcode: string): PlaceRecord[] {
  return places.filter((place) => place.postcodes.includes(postcode.toUpperCase()))
}

function hasSpotify(artist: MatchedArtist): boolean {
  return Boolean(artist.spotify?.id)
}

export function compareMatched(left: MatchedArtist, right: MatchedArtist): number {
  const lp = typeof left.spotify?.popularity === "number" ? left.spotify.popularity : -1
  const rp = typeof right.spotify?.popularity === "number" ? right.spotify.popularity : -1
  if (lp !== rp) return rp - lp
  const lf = typeof left.spotify?.followers === "number" ? left.spotify.followers : -1
  const rf = typeof right.spotify?.followers === "number" ? right.spotify.followers : -1
  if (lf !== rf) return rf - lf
  return left.name.localeCompare(right.name, "en")
}

export function summarize(artists: MatchedArtist[], limit = 8): ArtistSummary {
  const matched = artists.filter(hasSpotify)
  return {
    artistCount: artists.length,
    spotifyMatched: matched.length,
    spotifyUnmatched: artists.length - matched.length,
    withPopularity: matched.filter((artist) => typeof artist.spotify?.popularity === "number").length,
    withFollowers: matched.filter((artist) => typeof artist.spotify?.followers === "number").length,
    withTrack: matched.filter((artist) => artist.spotify?.representative_track?.uri).length,
    top: [...matched].sort(compareMatched).slice(0, limit),
  }
}

export function countPlaces(artists: ArtistRecord[], places: PlaceRecord[]): PlaceCount[] {
  return places.map((place) => ({
    placeId: place.id,
    placeName: place.name,
    postcodes: place.postcodes,
    precision: place.precision,
    artistCount: artistsForPlace(artists, place.id).length,
    note: place.note,
  }))
}

export function countPostcodes(artists: ArtistRecord[], places: PlaceRecord[]): PostcodeCount[] {
  return postcodeList(places).map((postcode) => ({
    postcode,
    placeIds: places.filter((place) => place.postcodes.includes(postcode)).map((place) => place.id),
    artistCount: artistsForPostcode(artists, postcode).length,
  }))
}

export function precisionCounts(artists: ArtistRecord[]): { withPlace: number; boroughOnly: number } {
  let withPlace = 0
  let boroughOnly = 0
  for (const artist of artists) {
    const place = artist.locality.some((item) => item.precision === "place")
    const borough = artist.locality.some((item) => item.precision === "borough")
    if (place) withPlace += 1
    else if (borough) boroughOnly += 1
  }
  return { withPlace, boroughOnly }
}
