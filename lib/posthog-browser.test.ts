import { afterEach, describe, expect, it, vi } from "vitest"

const posthog = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
  capture: vi.fn(),
  register: vi.fn(),
  has_opted_out_capturing: vi.fn(() => true),
  get_distinct_id: vi.fn(() => "anon"),
  identify: vi.fn(),
  reset: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  set_config: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock("posthog-js", () => ({ default: posthog }))

import { captureClient, initBrowserAnalytics } from "@/lib/posthog-browser"

describe("posthog browser", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    posthog.__loaded = false
    posthog.init.mockClear()
    posthog.capture.mockClear()
    vi.unstubAllGlobals()
  })

  it("does not initialise when the key is missing", () => {
    vi.stubGlobal("window", { location: { protocol: "http:" } })
    vi.stubGlobal("document", { cookie: "" })
    vi.stubGlobal("navigator", {})
    initBrowserAnalytics()
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it("does not initialise or capture before consent", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"
    vi.stubGlobal("window", { location: { protocol: "http:" }, doNotTrack: null })
    vi.stubGlobal("document", { cookie: "" })
    vi.stubGlobal("navigator", { doNotTrack: null })
    initBrowserAnalytics()
    expect(posthog.init).not.toHaveBeenCalled()
    captureClient("area_viewed", { kind: "postcode", postcode: "SW15" })
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it("initialises through the reverse proxy after consent", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"
    vi.stubGlobal("window", { location: { protocol: "http:" }, doNotTrack: null })
    vi.stubGlobal("document", { cookie: "bangers_analytics=accepted" })
    vi.stubGlobal("navigator", { doNotTrack: null })
    initBrowserAnalytics()
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        defaults: "2026-08-30",
        capture_pageview: false,
        autocapture: false,
        respect_dnt: true,
        persistence: "localStorage+cookie",
        advanced_disable_feature_flags: true,
        disable_surveys: true,
        session_recording: { maskAllInputs: true },
      }),
    )
  })

  it("captures with the app property once PostHog is loaded", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
    posthog.__loaded = true
    vi.stubGlobal("window", {})
    captureClient("map_area_clicked", { kind: "district", postcode: "SW15", email: "person@example.com" })
    expect(posthog.capture).toHaveBeenCalledWith(
      "map_area_clicked",
      expect.objectContaining({ app: "bangers-and-postcodes", kind: "district", postcode: "SW15" }),
    )
    const properties = posthog.capture.mock.calls[0]?.[1] as Record<string, unknown>
    expect(properties.email).toBeUndefined()
  })
})
