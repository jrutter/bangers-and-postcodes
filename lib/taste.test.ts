import { describe, expect, it } from "vitest"

import { accessIsFresh } from "@/lib/session"

import {
  buildTasteProfile,
  indexTags,
  matchCandidate,
  matchGig,
  matchVenue,
  orderByTaste,
  type TasteArtist,
  type TasteTrack,
} from "@/lib/taste"
import { readUserTaste, TasteScopeError } from "@/lib/taste-spotify"

const fourTet: TasteArtist = { id: "four", name: "Four Tet", genres: ["electronic"] }
const radiohead: TasteArtist = { id: "radio", name: "Radiohead", genres: ["art rock", "alternative rock"] }
const jamie: TasteArtist = { id: "jamie", name: "Jamie xx", genres: [] }
const wetLeg: TasteArtist = { id: "wet", name: "Wet Leg", genres: [] }
const smile: TasteArtist = { id: "smile", name: "The Smile", genres: [] }

function track(name: string, artists: TasteArtist[]): TasteTrack {
  return { name, artists }
}

describe("access tokens", () => {
  it("treats a token as fresh until 15 seconds before expiry", () => {
    const now = 1_000_000
    expect(accessIsFresh("token", now + 20_000, now)).toBe(true)
    expect(accessIsFresh("token", now + 10_000, now)).toBe(false)
    expect(accessIsFresh(undefined, now + 60_000, now)).toBe(false)
  })
})

describe("taste ranking", () => {
  const profile = buildTasteProfile({
    followed: [jamie],
    topArtistsShort: [fourTet],
    topArtistsMedium: [radiohead],
    topTracksShort: [track("Chaise Longue", [wetLeg])],
    topTracksMedium: [],
    related: [{ seedName: "Radiohead", artists: [smile] }],
  })

  it("prefers a follow, then a top artist, then a track credit, then a related artist", () => {
    const artists = [
      { name: "Someone Else", tags: ["opera"] },
      { name: "The Smile", tags: [] },
      { name: "Wet Leg", tags: [] },
      { name: "Four Tet", tags: ["electronic"] },
      { name: "Jamie xx", tags: [] },
    ]
    const ordered = orderByTaste(artists, (artist) => matchCandidate(profile, artist))
    expect(ordered.map((row) => row.item.name)).toEqual(["Jamie xx", "Four Tet", "Wet Leg", "The Smile", "Someone Else"])
    expect(ordered[0]?.taste?.reason).toBe("Followed on Spotify")
    expect(ordered[1]?.taste?.reason).toBe("You listen to Four Tet")
    expect(ordered[2]?.taste?.reason).toBe("You listen to Wet Leg")
    expect(ordered[3]?.taste?.reason).toBe("Similar to Radiohead")
    expect(ordered[4]?.taste).toBeNull()
  })

  it("uses a shared genre when the artist is not a direct match", () => {
    const hit = matchCandidate(profile, { name: "Local Art Rock", tags: ["art rock"] })
    expect(hit?.reason).toBe("Similar to Radiohead")
    expect(hit && hit.score).toBeLessThan(50)
  })

  it("falls back to direct matches and track credits when genres and related artists are missing", () => {
    const bare = buildTasteProfile({
      followed: [],
      topArtistsShort: [{ id: "four", name: "Four Tet", genres: [] }],
      topArtistsMedium: [],
      topTracksShort: [track("Chaise Longue", [{ id: "wet", name: "Wet Leg", genres: [] }])],
      topTracksMedium: [],
      related: [],
    })
    expect(bare.genresAvailable).toBe(false)
    expect(bare.relatedAvailable).toBe(false)
    expect(matchCandidate(bare, { name: "Local Art Rock", tags: ["art rock"] })).toBeNull()
    expect(matchCandidate(bare, { name: "Wet Leg" })?.reason).toBe("You listen to Wet Leg")
    expect(matchCandidate(bare, { name: "Four Tet" })?.reason).toBe("You listen to Four Tet")
  })

  it("ranks a gig by its strongest billed artist and a venue by its gigs", () => {
    const gig = matchGig(profile, { artistNames: ["Local Art Rock", "Jamie xx"] })
    expect(gig?.reason).toBe("Followed on Spotify")
    const tags = indexTags([{ name: "Local Art Rock", tags: ["art rock"] }])
    expect(matchGig(profile, { artistNames: ["Local Art Rock"] })).toBeNull()
    const rooms = orderByTaste(
      [
        { id: "bulls-head", gigs: [{ artistNames: ["Local Art Rock"] }] },
        { id: "half-moon", gigs: [{ artistNames: ["Wet Leg"] }] },
      ],
      (room) => matchVenue(profile, room.gigs, tags),
    )
    expect(rooms.map((row) => row.item.id)).toEqual(["half-moon", "bulls-head"])
    expect(rooms[0]?.taste?.reason).toBe("You listen to Wet Leg")
    expect(rooms[1]?.taste?.reason).toBe("Similar to Radiohead")
  })
})

describe("readUserTaste", () => {
  it("keeps direct matches when related artists are refused and genres are empty", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.pathname.endsWith("/related-artists")) {
        return { status: 403, body: { error: { status: 403, message: "Forbidden" } } }
      }
      if (url.pathname === "/v1/me/top/artists" && url.searchParams.get("time_range") === "short_term") {
        return { status: 200, body: { items: [{ id: "four", name: "Four Tet", genres: [] }] } }
      }
      if (url.pathname === "/v1/me/top/tracks" && url.searchParams.get("time_range") === "short_term") {
        return { status: 200, body: { items: [{ name: "Chaise Longue", artists: [{ id: "wet", name: "Wet Leg", genres: [] }] }] } }
      }
      if (url.pathname === "/v1/me/following") {
        return { status: 200, body: { artists: { items: [{ id: "jamie", name: "Jamie xx", genres: [] }], next: null } } }
      }
      return { status: 200, body: { items: [] } }
    })

    const profile = await readUserTaste("token", fetchImpl)
    expect(profile.relatedAvailable).toBe(false)
    expect(profile.genresAvailable).toBe(false)
    expect(matchCandidate(profile, { name: "Jamie xx" })?.reason).toBe("Followed on Spotify")
    expect(matchCandidate(profile, { name: "The Smile" })).toBeNull()
    expect(matchCandidate(profile, { name: "Wet Leg" })?.reason).toBe("You listen to Wet Leg")
  })

  it("reports a missing top-artist scope without calling related artists", async () => {
    const calls: string[] = []
    const fetchImpl = mockFetch((url) => {
      calls.push(url.pathname)
      if (url.pathname.startsWith("/v1/me/top/")) {
        return { status: 403, body: { error: { status: 403, message: "Insufficient client scope" } } }
      }
      return { status: 200, body: { items: [] } }
    })
    await expect(readUserTaste("token", fetchImpl)).rejects.toBeInstanceOf(TasteScopeError)
    expect(calls.some((path) => path.endsWith("/related-artists"))).toBe(false)
  })
})

function mockFetch(handler: (url: URL) => { status: number; body: unknown }): typeof fetch {
  return async (input) => {
    const url = new URL(String(input))
    const result = handler(url)
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    })
  }
}
