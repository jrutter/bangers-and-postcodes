import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => {
  const captureImmediate = vi.fn(async () => undefined)
  const shutdown = vi.fn(async () => undefined)
  return {
    constructed: 0,
    keys: [] as string[],
    hosts: [] as Array<string | undefined>,
    captureImmediate,
    shutdown,
  }
})

vi.mock("posthog-node", () => {
  class PostHog {
    captureImmediate = state.captureImmediate
    shutdown = state.shutdown
    constructor(key: string, options: { host?: string }) {
      state.constructed += 1
      state.keys.push(key)
      state.hosts.push(options.host)
    }
  }
  return { PostHog }
})

import { captureServer } from "@/lib/posthog-server"
import { listenerId } from "@/lib/listener-id"
import {
  ANALYTICS_APP,
  analyticsConsentAllows,
  browserInitOptions,
  distinctIdFromJar,
  distinctIdFromPosthogCookie,
  eventsForPath,
  playlistEventProperties,
  posthogCookieName,
  readConsent,
  sanitizeProperties,
} from "@/lib/analytics"

describe("analytics consent", () => {
  it("treats Do Not Track as rejected and otherwise reads the consent cookie", () => {
    expect(readConsent("", false)).toBe("unknown")
    expect(readConsent("bangers_analytics=accepted", false)).toBe("accepted")
    expect(readConsent("other=1; bangers_analytics=rejected", false)).toBe("rejected")
    expect(readConsent("bangers_analytics=accepted", true)).toBe("rejected")
  })

  it("allows server capture only after accept and without DNT", () => {
    expect(analyticsConsentAllows({ dnt: null, consent: "accepted" })).toBe(true)
    expect(analyticsConsentAllows({ dnt: "1", consent: "accepted" })).toBe(false)
    expect(analyticsConsentAllows({ dnt: null, consent: undefined })).toBe(false)
    expect(analyticsConsentAllows({ dnt: null, consent: "rejected" })).toBe(false)
  })
})

describe("analytics init", () => {
  it("configures the reverse proxy, masked replay, and no shared-project flags", () => {
    const accepted = browserInitOptions("https://us.i.posthog.com")
    expect(accepted.api_host).toBe("/ingest")
    expect(accepted.ui_host).toBe("https://us.posthog.com")
    expect(accepted.defaults).toBe("2026-08-30")
    expect(accepted.capture_pageview).toBe(false)
    expect(accepted.autocapture).toBe(false)
    expect(accepted.persistence).toBe("localStorage+cookie")
    expect(accepted.opt_out_capturing_by_default).toBe(false)
    expect(accepted.disable_session_recording).toBe(false)
    expect(accepted.disable_surveys).toBe(true)
    expect(accepted.advanced_disable_feature_flags).toBe(true)
    expect(accepted.session_recording.maskAllInputs).toBe(true)
    expect(accepted.respect_dnt).toBe(true)
  })
})

describe("analytics events", () => {
  it("maps postcode, area, and venue paths", () => {
    expect(eventsForPath("/postcode/sw15")).toEqual([
      { event: "area_viewed", properties: { kind: "postcode", postcode: "SW15" } },
    ])
    expect(eventsForPath("/area/putney")).toEqual([{ event: "area_viewed", properties: { kind: "area", area: "putney" } }])
    expect(eventsForPath("/venue/half-moon")).toEqual([{ event: "venue_viewed", properties: { venue: "half-moon" } }])
    expect(eventsForPath("/")).toEqual([])
  })

  it("strips emails, tokens, and secrets from properties and stamps the app", () => {
    const properties = sanitizeProperties({
      artist: "Four Tet",
      email: "person@example.com",
      access_token: "secret-token",
      note: "write to person@example.com please",
      $current_url: "https://bangers-and-postcodes.vercel.app/playlist?code=abc&scope=sw15",
    })
    expect(properties.app).toBe(ANALYTICS_APP)
    expect(properties.artist).toBe("Four Tet")
    expect(properties.email).toBeUndefined()
    expect(properties.access_token).toBeUndefined()
    expect(properties.note).toBe("write to [redacted] please")
    expect(properties.$current_url).toBe("https://bangers-and-postcodes.vercel.app/playlist?scope=sw15")
  })

  it("describes a playlist result without the playlist name", () => {
    expect(
      playlistEventProperties({
        success: false,
        status: "gig-keys",
        scopeKind: "venue",
        scopeId: "half-moon",
        isPublic: false,
        trackCount: 0,
      }),
    ).toEqual({
      success: false,
      status: "gig-keys",
      scope_kind: "venue",
      scope_id: "half-moon",
      is_public: false,
      track_count: 0,
    })
  })
})

describe("listener identity", () => {
  it("hashes the Spotify user id and does not echo it", () => {
    const hash = listenerId("spotify-user-123", "secret")
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain("spotify-user-123")
    expect(listenerId("spotify-user-123", "secret")).toBe(hash)
    expect(listenerId("spotify-user-123", "other")).not.toBe(hash)
  })

  it("prefers the listener hash, then the PostHog cookie", () => {
    const encoded = encodeURIComponent(JSON.stringify({ distinct_id: "anon-1" }))
    expect(distinctIdFromPosthogCookie(encoded)).toBe("anon-1")
    expect(distinctIdFromPosthogCookie(encodeURIComponent(JSON.stringify({ distinct_id: "a@b.com" })))).toBeNull()
    const listener = "a".repeat(64)
    const key = "phc_test"
    expect(
      distinctIdFromJar(
        {
          get(name: string) {
            if (name === "bangers_listener") return { value: listener }
            return undefined
          },
        },
        key,
      ),
    ).toBe(listener)
    expect(
      distinctIdFromJar(
        {
          get(name: string) {
            if (name === posthogCookieName(key)) return { value: encoded }
            return undefined
          },
        },
        key,
      ),
    ).toBe("anon-1")
  })
})

describe("posthog server", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    state.constructed = 0
    state.keys = []
    state.hosts = []
    state.captureImmediate.mockClear()
    state.shutdown.mockClear()
  })

  it("does nothing when the project key is missing", async () => {
    await captureServer("person", "playlist_created", { success: true })
    expect(state.constructed).toBe(0)
  })

  it("sends the app property and drops an email when the key is set", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"
    await captureServer("person", "playlist_created", { success: true, email: "person@example.com", status: "created" })
    expect(state.constructed).toBe(1)
    expect(state.keys).toEqual(["phc_test"])
    expect(state.hosts).toEqual(["https://us.i.posthog.com"])
    expect(state.captureImmediate).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "person",
        event: "playlist_created",
        disableGeoip: true,
        properties: expect.objectContaining({ app: ANALYTICS_APP, success: true, status: "created" }),
      }),
    )
    const properties = (state.captureImmediate.mock.calls as unknown as Array<[{ properties: Record<string, unknown> }]>)[0]?.[0]
      .properties
    expect(properties?.email).toBeUndefined()
    expect(state.shutdown).toHaveBeenCalled()
  })
})
