export type GigProviderId = "skiddle" | "ticketmaster" | "bandsintown"

export type Gig = {
  id: string
  provider: GigProviderId
  title: string
  artistNames: string[]
  /** Spotify artist ids from the listing, keyed by the act name they belong to. */
  artistSpotifyIds?: Record<string, string>
  venueName: string
  address: string | null
  town: string | null
  postcode: string | null
  latitude: number | null
  longitude: number | null
  /** Zoned instant, when the provider sent one. */
  startsAt: string | null
  /** Calendar date YYYY-MM-DD. */
  date: string | null
  doorTime: string | null
  ticketUrl: string | null
}

export type TaggedGig = Gig & {
  venueId: string | null
}

export type ProviderReport = {
  id: GigProviderId
  label: string
  configured: boolean
  error: string | null
  count: number
}

export type GigFeed = {
  gigs: Gig[]
  providers: ProviderReport[]
  from: string
  to: string
  cacheKey?: string
  /** A tile or page was skipped because the request budget for this refresh ran out. */
  truncated?: boolean
}

export type GigSearch = {
  latitude: number
  longitude: number
  radiusMiles: number
  from: string
  to: string
}

export type GigDeps = {
  fetchImpl?: typeof fetch
  env?: NodeJS.ProcessEnv
  /** Gap before each HTTP call for this provider. Tests pass 0. */
  paceMs?: number
  /** Shared counter. Each HTTP call spends one. Omitted means unlimited. */
  requests?: { current: number }
  /** Artist names for a catalogue sweep. Tests pass a short list. */
  artistNames?: string[]
}

export type GigCitySearch = {
  from: string
  to: string
  now: Date
}

export type GigProvider = {
  id: GigProviderId
  label: string
  configured(env?: NodeJS.ProcessEnv): boolean
  search(query: GigSearch, deps?: GigDeps): Promise<Gig[]>
  /** One city-wide pull. Used instead of searching every tile. */
  searchCity?(query: GigCitySearch, deps?: GigDeps): Promise<Gig[]>
}

export type GigSelection =
  | { kind: "london" }
  | { kind: "southwest" }
  | { kind: "region"; regionId: string }
  | { kind: "postcode"; postcode: string }
  | { kind: "place"; placeId: string }
  | { kind: "venue"; venueId: string }
