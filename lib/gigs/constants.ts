export const GIG_PAGE_SIZE = 100
export const GIG_MAX_PAGES = 2
/** Server cache lifetime for a city listings pull. About six hours. */
export const GIG_REVALIDATE_SECONDS = 60 * 60 * 6
/** Each tile is an 8 mile circle. Centres sit 10 miles apart, so the circles overlap. */
export const TILE_RADIUS_MILES = 8
export const TILE_SPACING_MILES = 10
/** Skiddle asks callers to cache and to avoid bursting. One request at a time, about one per second. */
export const SKIDDLE_PACE_MS = 1100
export const SKIDDLE_REQUEST_BUDGET = 48
export const TICKETMASTER_PACE_MS = 250
export const TICKETMASTER_REQUEST_BUDGET = 36
export const GIG_LINEUP_CAP = 8
export const GIG_PLAYLIST_CAP = 80
export const GIG_SPOTIFY_CAP = 30
export const NEAR_MILES = 1.5
export const VENUE_MATCH_MILES = 0.35
