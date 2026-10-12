import { describe, expect, it, vi } from "vitest"

import { artistsInPostcode, catalogue } from "@/lib/catalogue"
import { chooseArtist, chooseTrack, metricsFromArtist, namesMatch } from "@/lib/names"
import { authorizeUrl, DEFAULT_REDIRECT_URI, LOGIN_SCOPES, PLAYLIST_SCOPES, safeReturnPath, scopeAllowsTaste } from "@/lib/oauth"
import { chunk, trackUris } from "@/lib/playlist"
import { artistsForPostcode, summarize } from "@/lib/stats"
import { SpotifyError, appendSpotifyFailure, createSpotify, describeSpotifyFailure } from "@/lib/spotify"
import type { MatchedArtist } from "@/lib/types"

describe("names", () => {
  it("ignores case, punctuation, and a leading the", () => {
    expect(namesMatch("The Buggles", "Buggles")).toBe(true)
    expect(namesMatch("Jamie T", "jamie t")).toBe(true)
    expect(namesMatch("Four Tet", "Four Tetters")).toBe(false)
  })

  it("leaves missing popularity and followers empty", () => {
    const metrics = metricsFromArtist({ id: "abc", name: "Route 94", external_urls: {} })
    expect(metrics.popularity).toBeNull()
    expect(metrics.followers).toBeNull()
    expect(metrics.id).toBe("abc")
  })

  it("picks the exact name with the highest popularity", () => {
    const chosen = chooseArtist(
      [
        { id: "other", name: "Four Tetters", popularity: 99, followers: { total: 1 } },
        { id: "low", name: "Four Tet", popularity: 10, followers: { total: 5 } },
        { id: "high", name: "The Four Tet", popularity: 70, followers: { total: 50 } },
        { id: "blank", name: "Four Tet" },
      ],
      "Four Tet",
    )
    expect(chosen?.id).toBe("high")
  })

  it("keeps Spotify's order when no track has popularity", () => {
    const track = chooseTrack([
      { id: "first", name: "First", uri: "spotify:track:first" },
      { id: "second", name: "Second", uri: "spotify:track:second", popularity: null },
    ])
    expect(track?.id).toBe("first")
    expect(track?.popularity).toBeNull()
  })
})

describe("playlists", () => {
  it("dedupes Spotify artists and orders by popularity", () => {
    const artists = [
      profile("Low", "a", 10, "spotify:track:low"),
      profile("High", "b", 80, "spotify:track:high"),
      profile("Alias", "b", 80, "spotify:track:other"),
      { ...blankArtist("No match"), spotify: null },
    ]
    expect(trackUris(artists)).toEqual(["spotify:track:high", "spotify:track:low"])
  })

  it("splits track URIs into batches of 100", () => {
    const uris = Array.from({ length: 101 }, (_, index) => `spotify:track:${index}`)
    const batches = chunk(uris, 100)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(100)
    expect(batches[1]).toEqual(["spotify:track:100"])
  })
})

describe("oauth", () => {
  it("builds the authorize URL with the local callback and playlist scopes", () => {
    const url = authorizeUrl({
      clientId: "cid",
      redirectUri: DEFAULT_REDIRECT_URI,
      state: "state-123",
    })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.spotify.com/authorize")
    expect(parsed.searchParams.get("client_id")).toBe("cid")
    expect(parsed.searchParams.get("response_type")).toBe("code")
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/auth/callback")
    expect(parsed.searchParams.get("state")).toBe("state-123")
    expect(parsed.searchParams.get("scope")).toBe("playlist-modify-private playlist-modify-public")
    expect(PLAYLIST_SCOPES).toEqual(["playlist-modify-private", "playlist-modify-public"])
    expect(LOGIN_SCOPES).toEqual([
      "playlist-modify-private",
      "playlist-modify-public",
      "user-top-read",
      "user-follow-read",
    ])
    expect(scopeAllowsTaste("playlist-modify-private playlist-modify-public")).toBe(false)
    expect(scopeAllowsTaste(LOGIN_SCOPES.join(" "))).toBe(true)
  })

  it("rejects off-site return paths", () => {
    expect(safeReturnPath("/playlist?scope=postcode:SW13")).toBe("/playlist?scope=postcode:SW13")
    expect(safeReturnPath("//evil.example")).toBe("/playlist")
    expect(safeReturnPath("https://evil.example")).toBe("/playlist")
    expect(safeReturnPath("/%2f%2fevil.example")).toBe("/playlist")
  })
})

describe("catalogue", () => {
  it("does not count borough-only artists inside a postcode", () => {
    const boroughOnly = {
      name: "Borough Only",
      locality: [
        {
          place_id: "wandsworth-borough",
          place_name: "Wandsworth (borough)",
          postcodes: [],
          precision: "borough",
          claims: [],
        },
      ],
    }
    const precise = {
      name: "Southfields Band",
      locality: [
        {
          place_id: "southfields",
          place_name: "Southfields",
          postcodes: ["SW18"],
          precision: "place",
          claims: [],
        },
      ],
    }
    expect(artistsForPostcode([boroughOnly as never, precise as never], "SW18").map((artist) => artist.name)).toEqual([
      "Southfields Band",
    ])
  })

  it("keeps the committed southwest London list place-accurate", () => {
    expect(catalogue.artists).toHaveLength(catalogue.artist_count)
    expect(catalogue.artist_count).toBeGreaterThan(100)
    expect(artistsInPostcode("SW13").length).toBeGreaterThan(0)
    expect(artistsInPostcode("SW15").some((artist) => artist.name === "Four Tet")).toBe(true)
    expect(artistsInPostcode("SW18").some((artist) => artist.name === "The xx")).toBe(false)
    const summary = summarize(
      artistsInPostcode("SW15").map((artist) => ({ ...artist, spotify: null })),
    )
    expect(summary.spotifyMatched).toBe(0)
    expect(summary.artistCount).toBe(artistsInPostcode("SW15").length)
  })
})

describe("spotify client", () => {
  it("matches an exact name and keeps missing popularity empty", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.host === "accounts.spotify.com") return { access_token: "tok" }
      if (url.pathname === "/v1/search" && url.searchParams.get("type") === "artist") {
        return {
          artists: {
            items: [{ id: "route", name: "Route 94", external_urls: { spotify: "https://open.spotify.com/artist/route" } }],
          },
        }
      }
      if (url.pathname === "/v1/artists/route") return { id: "route", name: "Route 94" }
      if (url.pathname === "/v1/artists/route/top-tracks") {
        return { tracks: [{ id: "track1", name: "My Love", uri: "spotify:track:track1", album: { name: "My Love" } }] }
      }
      throw new Error(`unexpected ${url}`)
    })
    const client = createSpotify({
      fetch: fetchImpl,
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    })
    const matched = await client.matchArtist(blankArtist("Route 94"))
    expect(matched.spotify?.id).toBe("route")
    expect(matched.spotify?.match).toBe("exact")
    expect(matched.spotify?.popularity).toBeNull()
    expect(matched.spotify?.followers).toBeNull()
    expect(matched.spotify?.representative_track?.uri).toBe("spotify:track:track1")
  })

  it("leaves a non-exact search result unmatched", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.host === "accounts.spotify.com") return { access_token: "tok" }
      if (url.pathname === "/v1/search") {
        return { artists: { items: [{ id: "x", name: "Someone Else", popularity: 50 }] } }
      }
      throw new Error(`unexpected ${url}`)
    })
    const client = createSpotify({
      fetch: fetchImpl,
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    })
    const matched = await client.matchArtist(blankArtist("Four Tet"))
    expect(matched.spotify).toBeNull()
  })

  it("reads only the Spotify user id from the profile", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.pathname === "/v1/me") return { id: "listener-1", email: "person@example.com", display_name: "Ada" }
      throw new Error(`unexpected ${url}`)
    })
    const client = createSpotify({
      fetch: fetchImpl,
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    })
    await expect(client.profileId("access-token")).resolves.toBe("listener-1")
  })

  it("returns null when the Spotify profile lookup fails", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as typeof fetch
    const client = createSpotify({
      fetch: fetchImpl,
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    })
    await expect(client.profileId("access-token")).resolves.toBeNull()
  })

  it("adds tracks with POST /playlists/{id}/items in batches of 100", async () => {
    const uris = Array.from({ length: 101 }, (_, index) => `spotify:track:${index}`)
    const calls: CapturedRequest[] = []
    const client = playlistClient(
      scriptedFetch((url) => {
        if (url.pathname === "/v1/me/playlists") {
          return {
            status: 201,
            body: {
              id: "pl",
              name: "SW15",
              external_urls: { spotify: "https://open.spotify.com/playlist/pl" },
            },
          }
        }
        if (url.pathname === "/v1/playlists/pl/items") return { status: 201, body: { snapshot_id: "snap" } }
        throw new Error(`unexpected ${url.pathname}`)
      }, calls),
    )
    const created = await client.createPlaylist("user-access-token", {
      name: "SW15",
      description: "Local artists",
      isPublic: false,
      uris,
    })
    expect(created).toMatchObject({ id: "pl", url: "https://open.spotify.com/playlist/pl", trackCount: 101, isPublic: false })
    expect(calls.map((call) => call.url.pathname)).toEqual([
      "/v1/me/playlists",
      "/v1/playlists/pl/items",
      "/v1/playlists/pl/items",
    ])
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ name: "SW15", public: false })
    expect(JSON.parse(String(calls[1].init.body)).uris).toHaveLength(100)
    expect(JSON.parse(String(calls[2].init.body)).uris).toEqual(["spotify:track:100"])
    expect(calls.some((call) => call.url.pathname.endsWith("/tracks"))).toBe(false)
  })

  it.each([
    { status: 401, message: "Invalid access token" },
    { status: 403, message: "Forbidden" },
    { status: 400, message: "Missing required field: name" },
  ])("surfaces playlist create HTTP $status", async ({ status, message }) => {
    const calls: CapturedRequest[] = []
    const client = playlistClient(
      scriptedFetch((url) => {
        if (url.pathname === "/v1/me/playlists") return { status, body: { error: { status, message } } }
        throw new Error(`unexpected ${url.pathname}`)
      }, calls),
    )
    const error = await playlistFailure(client)
    expect(error.status).toBe(status)
    expect(error.phase).toBe("create")
    expect(error.spotifyMessage).toBe(message)
    expect(error.message).toContain(message)
    expect(error.message).not.toContain("user-access-token")
    expect(error.message).not.toContain("super-secret-client")
    expect(calls.map((call) => call.url.pathname)).toEqual(["/v1/me/playlists"])
  })

  it("reports an add-tracks failure from POST /playlists/{id}/items", async () => {
    const calls: CapturedRequest[] = []
    const client = playlistClient(
      scriptedFetch((url) => {
        if (url.pathname === "/v1/me/playlists") {
          return {
            status: 201,
            body: {
              id: "pl123",
              name: "SW15",
              external_urls: { spotify: "https://open.spotify.com/playlist/pl123" },
            },
          }
        }
        if (url.pathname === "/v1/playlists/pl123/items") {
          return { status: 403, body: { error: { status: 403, message: "Forbidden" } } }
        }
        throw new Error(`unexpected ${url.pathname}`)
      }, calls),
    )
    const error = await playlistFailure(client)
    expect(error.status).toBe(403)
    expect(error.phase).toBe("items")
    expect(error.spotifyMessage).toBe("Forbidden")
    expect(error.playlistUrl).toBe("https://open.spotify.com/playlist/pl123")
    expect(calls.map((call) => call.url.pathname)).toEqual(["/v1/me/playlists", "/v1/playlists/pl123/items"])
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ uris: ["spotify:track:one"] })
    expect(calls.some((call) => call.url.pathname.endsWith("/tracks"))).toBe(false)
    expect(error.message).not.toContain("user-access-token")
  })

  it("reports token exchange failure and logs the upstream body without secrets", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const leaked = `Bearer BQA${"a".repeat(50)}`
    const calls: CapturedRequest[] = []
    try {
      const client = createSpotify({
        fetch: scriptedFetch((url) => {
          if (url.host === "accounts.spotify.com") {
            return {
              status: 400,
              body: {
                error: "invalid_grant",
                error_description: `Invalid authorization code ${leaked}`,
                client_secret: "super-secret-client",
                access_token: "should-not-log-this-token-value-aaaaaaaaaaaaaaaa",
              },
            }
          }
          throw new Error(`unexpected ${url}`)
        }, calls),
        env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "super-secret-client" },
      })
      let caught: unknown
      try {
        await client.exchangeCode("auth-code")
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(SpotifyError)
      const error = caught as SpotifyError
      expect(error.status).toBe(400)
      expect(error.phase).toBe("token")
      expect(error.spotifyMessage).toContain("Invalid authorization code")
      expect(error.spotifyMessage).toContain("Bearer [redacted]")
      expect(error.spotifyMessage).not.toContain("BQAaa")
      expect(error.message).not.toContain("super-secret-client")
      expect(error.message).not.toContain("BQAaa")
      expect(calls[0]?.url.pathname).toBe("/api/token")
      const logged = JSON.stringify(spy.mock.calls)
      expect(logged).toContain("Invalid authorization code")
      expect(logged).toContain("400")
      expect(logged).toContain("[redacted]")
      expect(logged).not.toContain("super-secret-client")
      expect(logged).not.toContain("BQAaa")
      expect(logged).not.toContain("should-not-log-this-token")
    } finally {
      spy.mockRestore()
    }
  })
})

describe("spotify failure copy", () => {
  it("names the status and Spotify message without blaming the redirect URI", () => {
    expect(describeSpotifyFailure({ status: "403", detail: "Forbidden", phase: "create" })).toBe(
      "Spotify returned 403: Forbidden.",
    )
    expect(describeSpotifyFailure({ status: "403", detail: "Forbidden", phase: "items" })).toBe(
      "Spotify returned 403: Forbidden. The playlist was created, but the tracks were not added.",
    )
    expect(describeSpotifyFailure({ status: "401", detail: "Invalid access token", phase: "token" })).toBe(
      "Spotify returned 401: Invalid access token. Log in with Spotify again.",
    )
    expect(describeSpotifyFailure({ status: "400", detail: "Missing required field: name", phase: "create" })).toBe(
      "Spotify returned 400: Missing required field: name.",
    )
    const leaked = describeSpotifyFailure({ status: "400", detail: `Bearer ${"B".repeat(50)}`, phase: "token" })
    expect(leaked).toContain("Bearer [redacted]")
    expect(leaked).not.toContain("BBBBB")
    expect(describeSpotifyFailure({})).toBe("Spotify could not finish that request. Try again.")
    expect(describeSpotifyFailure({})).not.toMatch(/redirect URI/i)
  })

  it("keeps an existing scope and a validated playlist link on the failure redirect", () => {
    const error = new SpotifyError("failed", {
      status: 403,
      spotifyMessage: `Forbidden Bearer ${"C".repeat(40)}`,
      phase: "items",
      playlistUrl: "https://open.spotify.com/playlist/pl123",
    })
    const location = appendSpotifyFailure("/playlist?scope=postcode%3ASW15", error)
    const params = new URL(location, "http://local.invalid").searchParams
    expect(params.get("scope")).toBe("postcode:SW15")
    expect(params.get("error")).toBe("spotify")
    expect(params.get("spotifyStatus")).toBe("403")
    expect(params.get("spotifyPhase")).toBe("items")
    expect(params.get("spotifyDetail")).toContain("Forbidden")
    expect(params.get("spotifyDetail")).toContain("[redacted]")
    expect(params.get("spotifyDetail")).not.toContain("CCCC")
    expect(params.get("spotifyPlaylist")).toBe("https://open.spotify.com/playlist/pl123")
    expect(location).not.toContain("super-secret")
  })
})

function profile(name: string, id: string, popularity: number, uri: string): MatchedArtist {
  return {
    ...blankArtist(name),
    spotify: {
      id,
      name,
      url: null,
      followers: popularity * 10,
      popularity,
      image: null,
      match: "exact",
      representative_track: { id, name: "Song", uri, preview_url: null, album: null, popularity },
    },
  }
}

function blankArtist(name: string) {
  return {
    mbid: null,
    wikidata_qid: null,
    name,
    sort_name: name,
    type: "Person",
    disambiguation: null,
    country: null,
    life_span: null,
    tags: [],
    locality: [],
  }
}

type CapturedRequest = { url: URL; init: RequestInit }

function playlistClient(fetchImpl: typeof fetch) {
  return createSpotify({
    fetch: fetchImpl,
    env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "super-secret-client" },
  })
}

async function playlistFailure(client: ReturnType<typeof createSpotify>): Promise<SpotifyError> {
  try {
    await client.createPlaylist("user-access-token", {
      name: "SW15",
      description: "Local artists",
      isPublic: false,
      uris: ["spotify:track:one"],
    })
  } catch (error) {
    expect(error).toBeInstanceOf(SpotifyError)
    return error as SpotifyError
  }
  throw new Error("expected playlist create to fail")
}

function scriptedFetch(
  handler: (url: URL, init: RequestInit) => { status?: number; body: unknown },
  calls: CapturedRequest[] = [],
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw)
    const requestInit = init ?? {}
    calls.push({ url, init: requestInit })
    const result = handler(url, requestInit)
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
}

function mockFetch(handler: (url: URL) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw)
    return new Response(JSON.stringify(handler(url)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
}
