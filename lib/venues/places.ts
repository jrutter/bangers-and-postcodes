import { asRecord, numberField, stringField } from "@/lib/gigs/http"
import { pace } from "@/lib/gigs/pace"

/** IDs-only Text Search. Google allows storing the place id, not the rest of the payload. */
export const TEXT_SEARCH_FIELD_MASK = "places.id"
/** Place Details Enterprise fields. Do not add reviews, photos, or atmosphere fields. */
export const DETAILS_FIELD_MASK = "rating,userRatingCount"
export const GOOGLE_RATINGS_ATTRIBUTION = "Ratings from Google"

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
const DETAILS_URL = "https://places.googleapis.com/v1/places/"
const LONDON = { latitude: 51.5074, longitude: -0.1278 }

export type PlaceDetails = {
  rating: number | null
  userRatingCount: number | null
}

export function textQueryFor(venue: { name: string; address: string; postcode: string }): string {
  return [venue.name, venue.address, venue.postcode, "London"].filter((part) => part.trim()).join(", ")
}

export function placeIdFromTextSearch(body: unknown): string | null {
  const record = asRecord(body)
  const places = record && Array.isArray(record.places) ? record.places : []
  const id = stringField(asRecord(places[0]), "id")
  if (!id || !/^[\w-]{8,}$/.test(id)) return null
  return id
}

export function detailsFromPlace(body: unknown): PlaceDetails {
  const record = asRecord(body)
  const rating = numberField(record, "rating")
  const userRatingCount = numberField(record, "userRatingCount")
  return {
    rating: rating == null ? null : rating,
    userRatingCount: userRatingCount == null ? null : Math.max(0, Math.round(userRatingCount)),
  }
}

export async function searchPlaceId(
  fetchImpl: typeof fetch,
  apiKey: string,
  textQuery: string,
  paceMs: number,
): Promise<string | null> {
  await pace("google-places", paceMs)
  const body = await googleJson(
    fetchImpl,
    TEXT_SEARCH_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        regionCode: "GB",
        pageSize: 1,
        locationBias: { circle: { center: LONDON, radius: 28000 } },
      }),
    },
    "text-search",
  )
  if (body == null) return null
  return placeIdFromTextSearch(body)
}

export async function fetchPlaceDetails(
  fetchImpl: typeof fetch,
  apiKey: string,
  placeId: string,
  paceMs: number,
): Promise<PlaceDetails | null> {
  await pace("google-places", paceMs)
  const body = await googleJson(
    fetchImpl,
    `${DETAILS_URL}${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    },
    "details",
  )
  if (body == null) return null
  return detailsFromPlace(body)
}

async function googleJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  kind: string,
): Promise<unknown | null> {
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, cache: "no-store" })
  } catch {
    throw new Error(`Google Places ${kind} could not be reached.`)
  }
  if (response.status === 404) return null
  const text = await response.text()
  if (!response.ok) throw new Error(`Google Places ${kind} returned ${response.status}.`)
  try {
    return text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Google Places ${kind} returned no JSON.`)
  }
}
