import { openSpotifyPlaylist } from "@/lib/format"
import { billPieces, foldName, pickGigArtist, spotifyArtistIdFrom } from "@/lib/gigs/bill"
import { chooseArtist, chooseTrack, metricsFromArtist } from "@/lib/names"
import { API_ROOT, TOKEN_URL, envValue, redirectUri } from "@/lib/oauth"
import { chunk } from "@/lib/playlist"
import type { ArtistRecord, MatchedArtist, SpotifyProfile, TokenBundle } from "@/lib/types"

export type SpotifyFailurePhase = "token" | "create" | "items"

const SECRET_KEY = /^(access_token|refresh_token|client_secret|authorization|id_token|code_verifier|code|token)$/i
const BEARER = /Bearer\s+\S+/gi
const LABELED_SECRET = /\b(access_token|refresh_token|client_secret|authorization|id_token|code_verifier)\b(\s*[:=]\s*)\S+/gi
const LONG_TOKEN = /\b[A-Za-z0-9_-]{40,}\b/g

export class SpotifyError extends Error {
  readonly status: number | null
  readonly spotifyMessage: string
  readonly phase: SpotifyFailurePhase | null
  playlistUrl: string | null

  constructor(
    message: string,
    options?: {
      status?: number | null
      spotifyMessage?: string
      phase?: SpotifyFailurePhase | null
      playlistUrl?: string | null
    },
  ) {
    const spotifyMessage = sanitizeSpotifyDetail(options?.spotifyMessage)
    super(message)
    this.name = "SpotifyError"
    this.status = options?.status ?? null
    this.spotifyMessage = spotifyMessage
    this.phase = options?.phase ?? null
    this.playlistUrl = options?.playlistUrl ?? null
  }
}

/** User-facing copy. Query values are untrusted, so status, phase, and detail are checked here. */
export function describeSpotifyFailure(input: {
  status?: string | null
  detail?: string | null
  phase?: string | null
}): string {
  const status = input.status && /^\d{3}$/.test(input.status) ? input.status : ""
  const detail = sanitizeSpotifyDetail(input.detail).replace(/[. ]+$/g, "")
  const phase = input.phase === "token" || input.phase === "create" || input.phase === "items" ? input.phase : null
  let text = "Spotify could not finish that request. Try again."
  if (status && detail) text = `Spotify returned ${status}: ${detail}.`
  else if (status) text = `Spotify returned ${status}.`
  else if (detail) text = `Spotify returned an error: ${detail}.`
  if (status === "401") text += " Log in with Spotify again."
  if (phase === "items") text += " The playlist was created, but the tracks were not added."
  return text
}

export function appendSpotifyFailure(path: string, error: SpotifyError): string {
  const url = new URL(path, "http://local.invalid")
  url.searchParams.set("error", "spotify")
  if (error.status) url.searchParams.set("spotifyStatus", String(error.status))
  const detail = sanitizeSpotifyDetail(error.spotifyMessage)
  if (detail) url.searchParams.set("spotifyDetail", detail)
  if (error.phase) url.searchParams.set("spotifyPhase", error.phase)
  const playlist = error.phase === "items" ? openSpotifyPlaylist(error.playlistUrl ?? undefined) : null
  if (playlist) url.searchParams.set("spotifyPlaylist", playlist)
  return `${url.pathname}${url.search}`
}

export function sanitizeSpotifyDetail(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(BEARER, "Bearer [redacted]")
    .replace(LABELED_SECRET, "$1$2[redacted]")
    .replace(LONG_TOKEN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
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
      return mapPool(artists, 4, (artist) => this.matchArtist(artist))
    },
    /** One top track per known Spotify artist id. Skips artists with no track. */
    async tracksForArtists(ids: string[]): Promise<string[]> {
      const unique = [...new Set(ids.filter(Boolean))].slice(0, 50)
      const uris = await mapPool(unique, 4, async (id) => {
        try {
          const payload = await apiSend(fetchImpl, "GET", `/artists/${encodeURIComponent(id)}/top-tracks`, {
            token: await this.accessToken(),
            params: { market: "GB" },
            shared: true,
          })
          const tracks = Array.isArray(payload.tracks) ? payload.tracks : []
          return chooseTrack(tracks as Parameters<typeof chooseTrack>[0])?.uri || null
        } catch {
          return null
        }
      })
      return uris.filter((uri): uri is string => Boolean(uri))
    },
    /**
     * Gig bills. The catalogue path stays an exact quoted search.
     * A bill is kept whole when that string clears the confidence bar, otherwise each
     * featured name is tried. Anything under the bar stays unmatched.
     */
    async matchGigLineup(artists: ArtistRecord[], hints?: ReadonlyMap<string, string>): Promise<MatchedArtist[]> {
      const accessToken = () => this.accessToken()
      const looseCache = new Map<string, LooseArtist | null>()
      const rows = await mapPool(artists, 4, (artist) =>
        resolveGigBill(fetchImpl, accessToken, artist, hints, looseCache),
      )
      return rows.flat()
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
        throw new SpotifyError("No Spotify tracks to add.", {
          spotifyMessage: "No Spotify tracks to add.",
          phase: "create",
        })
      }
      const playlist = await apiSend(fetchImpl, "POST", "/me/playlists", {
        token: accessToken,
        phase: "create",
        json: {
          name: input.name,
          description: input.description.slice(0, 300),
          public: input.isPublic,
        },
      })
      const id = typeof playlist.id === "string" ? playlist.id : ""
      if (!id) {
        throw new SpotifyError("Spotify created a playlist response with no id.", {
          spotifyMessage: "Playlist response had no id.",
          phase: "create",
        })
      }
      const external = playlist.external_urls
      const url =
        external && typeof external === "object" && typeof (external as { spotify?: string }).spotify === "string"
          ? (external as { spotify: string }).spotify
          : null
      for (const batch of chunk(input.uris, 100)) {
        try {
          await apiSend(fetchImpl, "POST", `/playlists/${encodeURIComponent(id)}/items`, {
            token: accessToken,
            phase: "items",
            json: { uris: batch },
          })
        } catch (error) {
          if (error instanceof SpotifyError) error.playlistUrl = url
          throw error
        }
      }
      return {
        id,
        name: typeof playlist.name === "string" ? playlist.name : input.name,
        url,
        isPublic: input.isPublic,
        trackCount: input.uris.length,
      }
    },
    async profileId(accessToken: string): Promise<string | null> {
      try {
        const payload = await apiSend(fetchImpl, "GET", "/me", { token: accessToken })
        const id = payload.id
        return typeof id === "string" && id.trim() ? id.trim() : null
      } catch {
        return null
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
      shared: true,
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
  return completeMatch(fetchImpl, accessToken, artist, chosen, name)
}

type LooseArtist = {
  id?: string
  name?: string
  popularity?: number
  followers?: { total?: number }
  images?: { url?: string }[]
  external_urls?: { spotify?: string }
}

async function resolveGigBill(
  fetchImpl: FetchLike,
  accessToken: () => Promise<string>,
  artist: ArtistRecord,
  hints: ReadonlyMap<string, string> | undefined,
  looseCache: Map<string, LooseArtist | null>,
): Promise<MatchedArtist[]> {
  const hinted = await artistFromHint(fetchImpl, accessToken, artist.name, hints)
  if (hinted?.id) return [await completeMatch(fetchImpl, accessToken, artist, hinted, hinted.name || artist.name)]
  const full = await looseArtist(fetchImpl, accessToken, artist.name, looseCache)
  if (full?.id) return [await completeMatch(fetchImpl, accessToken, artist, full, full.name || artist.name)]
  const pieces = billPieces(artist.name).filter((piece) => foldName(piece.name) !== foldName(artist.name))
  const rows: MatchedArtist[] = []
  for (const piece of pieces) {
    const named = { ...artist, name: piece.name, sort_name: piece.name }
    const hintedPiece = await artistFromHint(fetchImpl, accessToken, piece.name, hints)
    const found = hintedPiece?.id ? hintedPiece : await looseArtist(fetchImpl, accessToken, piece.name, looseCache)
    if (found?.id) rows.push(await completeMatch(fetchImpl, accessToken, named, found, found.name || piece.name))
    else if (piece.role !== "subtitle") rows.push({ ...named, spotify: null })
  }
  if (rows.length === 0) return [{ ...artist, spotify: null }]
  return rows
}

async function artistFromHint(
  fetchImpl: FetchLike,
  accessToken: () => Promise<string>,
  name: string,
  hints: ReadonlyMap<string, string> | undefined,
): Promise<LooseArtist | null> {
  const id = spotifyArtistIdFrom(hints?.get(foldName(name)))
  if (!id) return null
  try {
    const payload = await apiSend(fetchImpl, "GET", `/artists/${encodeURIComponent(id)}`, {
      token: await accessToken(),
      shared: true,
    })
    return typeof payload.id === "string" ? (payload as LooseArtist) : null
  } catch (error) {
    if (error instanceof SpotifyError && (error.status === 401 || error.status === 429)) throw error
    return null
  }
}

async function looseArtist(
  fetchImpl: FetchLike,
  accessToken: () => Promise<string>,
  name: string,
  cache: Map<string, LooseArtist | null>,
): Promise<LooseArtist | null> {
  const key = foldName(name)
  if (!key) return null
  if (cache.has(key)) return cache.get(key) ?? null
  let candidates: LooseArtist[] = []
  try {
    const payload = await apiSend(fetchImpl, "GET", "/search", {
      token: await accessToken(),
      params: { q: name.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200), type: "artist", limit: "8" },
      shared: true,
    })
    const block = payload.artists
    const items =
      block && typeof block === "object" && Array.isArray((block as { items?: unknown }).items)
        ? ((block as { items: LooseArtist[] }).items ?? [])
        : []
    candidates = items
  } catch (error) {
    if (error instanceof SpotifyError && (error.status === 401 || error.status === 429)) throw error
    cache.set(key, null)
    return null
  }
  const picked = pickGigArtist(name, candidates)
  const chosen = picked?.artist.id ? picked.artist : null
  cache.set(key, chosen)
  return chosen
}

async function completeMatch(
  fetchImpl: FetchLike,
  accessToken: () => Promise<string>,
  artist: ArtistRecord,
  chosen: LooseArtist,
  searchName: string,
): Promise<MatchedArtist> {
  if (!chosen.id) return { ...artist, spotify: null }
  let profile = metricsFromArtist(chosen)
  if (profile.popularity === null || profile.followers === null) {
    try {
      const fetched = await apiSend(fetchImpl, "GET", `/artists/${encodeURIComponent(chosen.id)}`, {
        token: await accessToken(),
        shared: true,
      })
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
    const payload = await apiSend(fetchImpl, "GET", `/artists/${encodeURIComponent(chosen.id)}/top-tracks`, {
      token: await accessToken(),
      params: { market: "GB" },
      shared: true,
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
        params: { q: `artist:"${searchName.replace(/"/g, "")}"`, type: "track", limit: "5", market: "GB" },
        shared: true,
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
  const payload = await readJson(response, "token", "token")
  const access = payload.access_token
  if (typeof access !== "string" || !access) {
    throw new SpotifyError("Spotify token response had no access_token.", {
      status: response.status,
      spotifyMessage: "Token response had no access_token.",
      phase: "token",
    })
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
  options: {
    token: string
    params?: Record<string, string>
    json?: Record<string, unknown>
    phase?: SpotifyFailurePhase | null
    /** Catalogue lookups can be shared. User tokens and playlist writes stay uncached. */
    shared?: boolean
  },
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
  const response = await fetchImpl(url, {
    method,
    headers,
    body,
    ...(options.shared
      ? { next: { revalidate: 60 * 60 * 24, tags: ["spotify", "artists"] } }
      : { cache: "no-store" as const }),
  })
  if (response.status === 204) return {}
  return readJson(response, `${method} ${path}`, options.phase ?? null)
}

async function readJson(
  response: Response,
  what: string,
  phase: SpotifyFailurePhase | null = null,
): Promise<Record<string, unknown>> {
  const text = await response.text()
  let payload: unknown = null
  let parsed = false
  if (text) {
    try {
      payload = JSON.parse(text)
      parsed = true
    } catch {
      parsed = false
    }
  }
  if (response.status >= 400) {
    const rawMessage = parsed ? spotifyErrorMessage(payload) : ""
    const spotifyMessage = sanitizeSpotifyDetail(rawMessage) || (parsed ? "Spotify rejected the request." : "Response was not JSON.")
    logSpotifyUpstream(what, response.status, parsed ? payload : text.slice(0, 500))
    throw new SpotifyError(`Spotify ${what} failed (${response.status}): ${spotifyMessage}`, {
      status: response.status,
      spotifyMessage,
      phase,
    })
  }
  if (!parsed || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SpotifyError(`Spotify ${what} returned an unexpected payload.`, {
      status: response.status,
      spotifyMessage: "Unexpected payload.",
      phase,
    })
  }
  return payload as Record<string, unknown>
}

function spotifyErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as { error_description?: unknown; error?: unknown }
  const description = typeof record.error_description === "string" ? record.error_description : ""
  if (record.error && typeof record.error === "object") {
    const message = (record.error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  if (description.trim()) return description
  if (typeof record.error === "string" && record.error.trim()) return record.error
  return ""
}

function logSpotifyUpstream(operation: string, status: number, body: unknown): void {
  console.error("[spotify] upstream error", {
    operation,
    status,
    body: redactForLog(body),
  })
}

function redactForLog(value: unknown): unknown {
  if (typeof value === "string") return sanitizeSpotifyDetail(value)
  if (Array.isArray(value)) return value.map(redactForLog)
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = SECRET_KEY.test(key) ? "[redacted]" : redactForLog(item)
    }
    return redacted
  }
  return value
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
