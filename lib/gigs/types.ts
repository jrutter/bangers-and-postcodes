export type GigProviderId = "skiddle" | "ticketmaster"

export type Gig = {
  id: string
  provider: GigProviderId
  title: string
  artistNames: string[]
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
}

export type GigProvider = {
  id: GigProviderId
  label: string
  configured(env?: NodeJS.ProcessEnv): boolean
  search(query: GigSearch, deps?: GigDeps): Promise<Gig[]>
}

export type GigSelection =
  | { kind: "southwest" }
  | { kind: "postcode"; postcode: string }
  | { kind: "place"; placeId: string }
  | { kind: "venue"; venueId: string }
