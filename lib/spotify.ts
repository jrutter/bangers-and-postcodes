import { chooseArtist, chooseTrack, metricsFromArtist } from "@/lib/names"
import { API_ROOT, TOKEN_URL, envValue, redirectUri } from "@/lib/oauth"
import type { ArtistRecord, MatchedArtist, SpotifyProfile, TokenBundle } from "@/lib/types"

export class SpotifyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpotifyError"
  }
}

type FetchLike = typeof fetch

type SpotifyEnv = {
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
  SPOTIFY_REDIRECT_URI?: string
}

export type SpotifyClient = ReturnType<typeof createSpotify>

export function createSpotify(options?: { fetch?: FetchLike; env?: SpotifyEnv }) {
  const fetchImpl = options?.fetch ?? fetch
  const env = (options?.env ?? process.env) as NodeJS.ProcessEnv
  let token: { value: string; expiresAt: number } | null = null
  const cache = new Map<string, MatchedArtist>()

  function clientId(): string {
    return envValue("SPOTIFY_CLIENT_ID", env)
  }

  function clientSecret(): string {
    return envValue("SPOTIFY_CLIENT_SECRET", env)
  }

  return {
    configured(): boolean {
      return Boolean(clientId() && clientSecret())
    },
    redirectUri(): string {
      return redirectUri(envValue("SPOTIFY_REDIRECT_URI", env))
    },
    async matchArtist(artist: ArtistRecord): Promise<MatchedArtist> {
      const key = `${artist.mbid ?? artist.wikidata_qid ?? ""}:${artist.name}`
      const cached = cache.get(key)
      if (cached) return cached
      const matched = await matchOne(fetchImpl, () => this.accessToken(), artist)
      if (!matched.spotify_error) cache.set(key, matched)
      return matched
    },
    async matchCatalogue(artists: ArtistRecord[]): Promise<MatchedArtist[]> {
      return mapPool(artists, 6, (artist) => this.matchArtist(artist))
    },
    async exchangeCode(code: string): Promise<TokenBundle> {
      return tokenRequest(fetchImpl, clientId(), clientSecret(), {
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri(),
      })
    },
    async refresh(refreshToken: string): Promise<TokenBundle> {
      return tokenRequest(fetchImpl, clientId(), clientSecret(), {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    },
    async createPlaylist(
      accessToken: string,
      input: { name: string; description: string; isPublic: boolean; uris: string[] },
    ): Promise<{ id: string; name: string; url: string | null; isPublic: boolean; trackCount: number }> {
      if (input.uris.length === 0) {
        throw new SpotifyError("No Spotify tracks to add.")
      }
      const playlist = await apiSend(fetchImpl, "POST", "/me/playlists", {
        token: accessToken,
        json: {
          name: input.name,
          description: input.description.slice(0, 300),
          public: input.isPublic,
        },
      })
      const id = typeof playlist.id === "string" ? playlist.id : ""
      if (!id) throw new SpotifyError("Spotify created a playlist response with no id.")
      for (let index = 0; index < input.uris.length; index += 100) {
        await apiSend(fetchImpl, "POST", `/playlists/${id}/tracks`, {
          token: accessToken,
          json: { uris: input.uris.slice(index, index + 100) },
        })
      }
      const external = playlist.external_urls
      const url =
        external && typeof external === "object" && typeof (external as { spotify?: string }).spotify === "string"
          ? (external as { spotify: string }).spotify
          : null
      return {
        id,
        name: typeof playlist.name === "string" ? playlist.name : input.name,
        url,
        isPublic: input.isPublic,
        trackCount: input.uris.length,
      }
    },
    async accessToken(): Promise<string> {
      if (token && token.expiresAt > Date.now() + 30_000) return token.value
      const id = clientId()
      const secret = clientSecret()
      if (!id || !secret) {
        throw new SpotifyError("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. See .env.example.")
      }
      const bundle = await tokenRequest(fetchImpl, id, secret, { grant_type: "client_credentials" })
      const expiresIn = typeof bundle.expires_in === "number" ? bundle.expires_in : 3600
      token = { value: bundle.access_token, expiresAt: Date.now() + expiresIn * 1000 }
      return bundle.access_token
    },
  }
}

let singleton: SpotifyClient | null = null

export function spotifyClient(): SpotifyClient {
  if (!singleton) singleton = createSpotify()
  return singleton
}

async function matchOne(
  fetchImpl: FetchLike,
  accessToken: () => Promise<string>,
  artist: ArtistRecord,
): Promise<MatchedArtist> {
  const name = artist.name
  let candidates: Record<string, unknown>[]
  try {
    const payload = await apiSend(fetchImpl, "GET", "/search", {
      token: await accessToken(),
      params: { q: `artist:"${name.replace(/"/g, "")}"`, type: "artist", limit: "10" },
    })
    const block = payload.artists
    const items =
      block && typeof block === "object" && Array.isArray((block as { items?: unknown }).items)
        ? ((block as { items: Record<string, unknown>[] }).items ?? [])
        : []
    candidates = items
  } catch (error) {
    return { ...artist, spotify: null, spotify_error: error instanceof Error ? error.message : "Spotify search failed." }
  }

  const chosen = chooseArtist(candidates as Parameters<typeof chooseArtist>[0], name)
  if (!chosen?.id) return { ...artist, spotify: null }

  let profile = metricsFromArtist(chosen)
  if (profile.popularity === null || profile.followers === null) {
    try {
      const fetched = await apiSend(fetchImpl, "GET", `/artists/${chosen.id}`, { token: await accessToken() })
      const filled = metricsFromArtist(fetched)
      for (const key of ["followers", "popularity", "url", "image", "name"] as const) {
        if (profile[key] == null && filled[key] != null) profile = { ...profile, [key]: filled[key] }
      }
    } catch {
      // Search metrics are enough when the artist endpoint is restricted.
    }
  }

  let track = null
  try {
    const payload = await apiSend(fetchImpl, "GET", `/artists/${chosen.id}/top-tracks`, {
      token: await accessToken(),
      params: { market: "GB" },
    })
    const tracks = Array.isArray(payload.tracks) ? (payload.tracks as Parameters<typeof chooseTrack>[0]) : []
    track = chooseTrack(tracks)
  } catch {
    track = null
  }
  if (!track) {
    try {
      const payload = await apiSend(fetchImpl, "GET", "/search", {
        token: await accessToken(),
        params: { q: `artist:"${name.replace(/"/g, "")}"`, type: "track", limit: "5", market: "GB" },
      })
      const block = payload.tracks
      const items =
        block && typeof block === "object" && Array.isArray((block as { items?: unknown }).items)
          ? ((block as { items: Parameters<typeof chooseTrack>[0] }).items ?? [])
          : []
      track = chooseTrack(items)
    } catch {
      track = null
    }
  }

  const spotify: SpotifyProfile = { ...profile, id: chosen.id, match: "exact", representative_track: track }
  return { ...artist, spotify }
}

async function tokenRequest(
  fetchImpl: FetchLike,
  clientId: string,
  clientSecret: string,
  fields: Record<string, string>,
): Promise<TokenBundle> {
  const body = new URLSearchParams(fields)
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  })
  const payload = await readJson(response, "token")
  const access = payload.access_token
  if (typeof access !== "string" || !access) {
    throw new SpotifyError("Spotify token response had no access_token.")
  }
  return {
    access_token: access,
    refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    expires_in: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
    token_type: typeof payload.token_type === "string" ? payload.token_type : undefined,
  }
}

async function apiSend(
  fetchImpl: FetchLike,
  method: string,
  path: string,
  options: { token: string; params?: Record<string, string>; json?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const url = new URL(`${API_ROOT}${path}`)
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) url.searchParams.set(key, value)
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${options.token}` }
  let body: string | undefined
  if (options.json) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(options.json)
  }
  const response = await fetchImpl(url, { method, headers, body, cache: "no-store" })
  if (response.status === 204) return {}
  return readJson(response, `${method} ${path}`)
}

async function readJson(response: Response, what: string): Promise<Record<string, unknown>> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new SpotifyError(`Spotify ${what} returned ${response.status} and no JSON.`)
  }
  if (response.status >= 400) {
    let message = ""
    if (payload && typeof payload === "object") {
      const record = payload as { error_description?: string; error?: { message?: string } | string }
      message = record.error_description || ""
      if (record.error && typeof record.error === "object") message = record.error.message || message
      else if (typeof record.error === "string" && !message) message = record.error
    }
    throw new SpotifyError(`Spotify ${what} failed (${response.status}): ${message}`)
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SpotifyError(`Spotify ${what} returned an unexpected payload.`)
  }
  return payload as Record<string, unknown>
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
    }
  }
  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
