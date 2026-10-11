import { describe, expect, it } from "vitest"

import { artistsInPostcode, catalogue } from "@/lib/catalogue"
import { chooseArtist, chooseTrack, metricsFromArtist, namesMatch } from "@/lib/names"
import { authorizeUrl, DEFAULT_REDIRECT_URI, LOGIN_SCOPES, PLAYLIST_SCOPES, safeReturnPath, scopeAllowsTaste } from "@/lib/oauth"
import { chunk, trackUris } from "@/lib/playlist"
import { artistsForPostcode, summarize } from "@/lib/stats"
import { createSpotify } from "@/lib/spotify"
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
    expect(catalogue.artists).toHaveLength(203)
    expect(artistsInPostcode("SW13")).toHaveLength(2)
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
