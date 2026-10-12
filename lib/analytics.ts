/** Shared PostHog event names and property rules. Safe to import from client and server code. */

export const ANALYTICS_APP = "bangers-and-postcodes"
/** Latest posthog-js config defaults. Turns on history-aware pageviews unless capture_pageview is set explicitly. */
export const POSTHOG_DEFAULTS = "2026-08-30" as const
export const INGEST_PATH = "/ingest"
export const CONSENT_COOKIE = "bangers_analytics"
/** HMAC of the Spotify user id. HttpOnly. Never the raw id, email, or a token. */
export const LISTENER_COOKIE = "bangers_listener"
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180

export type Consent = "accepted" | "rejected" | "unknown"

const BLOCKED_KEYS = new Set([
  "email",
  "$email",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "password",
  "phone",
  "spotify_token",
  "code",
  "id_token",
])

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const STRIP_URL_PARAMS = ["code", "access_token", "refresh_token", "token", "email", "id_token", "q", "query"]

export function readConsent(cookie: string, dnt: boolean): Consent {
  if (dnt) return "rejected"
  const match = cookie.match(/(?:^|; )bangers_analytics=([^;]*)/)
  const value = match?.[1] ? decodeURIComponent(match[1]) : ""
  if (value === "accepted" || value === "rejected") return value
  return "unknown"
}

export function analyticsConsentAllows(input: { dnt: string | null; consent: string | undefined }): boolean {
  if (input.dnt === "1") return false
  return input.consent === "accepted"
}

export function consentCookie(choice: "accepted" | "rejected", secure: boolean): string {
  const secureAttr = secure ? "; Secure" : ""
  return `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${secureAttr}`
}

export function posthogCookieName(projectKey: string): string {
  return `ph_${projectKey}_posthog`
}

export function posthogUiHost(host: string | undefined): string {
  if (host?.includes("eu.")) return "https://eu.posthog.com"
  return "https://us.posthog.com"
}

export type BrowserInitOptions = {
  api_host: string
  ui_host: string
  defaults: typeof POSTHOG_DEFAULTS
  capture_pageview: false
  capture_pageleave: false
  capture_exceptions: true
  autocapture: false
  persistence: "localStorage+cookie"
  disable_session_recording: false
  disable_surveys: true
  advanced_disable_feature_flags: true
  respect_dnt: true
  opt_out_capturing_by_default: false
  person_profiles: "identified_only"
  session_recording: { maskAllInputs: true }
}

/** Called only after the visitor accepts. No PostHog network, cookies, or replay before that. */
export function browserInitOptions(ingestionHost: string | undefined): BrowserInitOptions {
  return {
    api_host: INGEST_PATH,
    ui_host: posthogUiHost(ingestionHost),
    defaults: POSTHOG_DEFAULTS,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: true,
    autocapture: false,
    persistence: "localStorage+cookie",
    disable_session_recording: false,
    disable_surveys: true,
    advanced_disable_feature_flags: true,
    respect_dnt: true,
    opt_out_capturing_by_default: false,
    person_profiles: "identified_only",
    session_recording: { maskAllInputs: true },
  }
}

export function eventsForPath(pathname: string): { event: string; properties: Record<string, string> }[] {
  const postcode = pathname.match(/^\/postcode\/([a-z0-9]+)$/i)
  if (postcode?.[1]) {
    return [{ event: "area_viewed", properties: { kind: "postcode", postcode: postcode[1].toUpperCase() } }]
  }
  const area = pathname.match(/^\/area\/([a-z0-9-]+)$/i)
  if (area?.[1]) return [{ event: "area_viewed", properties: { kind: "area", area: area[1] } }]
  const region = pathname.match(/^\/region\/([a-z0-9-]+)$/i)
  if (region?.[1]) return [{ event: "region_viewed", properties: { region: region[1] } }]
  if (pathname === "/favourites") return [{ event: "favourites_viewed", properties: { page: "favourites" } }]
  const venue = pathname.match(/^\/venue\/([a-z0-9-]+)$/i)
  if (venue?.[1]) return [{ event: "venue_viewed", properties: { venue: venue[1] } }]
  const artist = pathname.match(/^\/artist\/([a-z0-9-]+)$/i)
  if (artist?.[1]) return [{ event: "artist_viewed", properties: { artist: artist[1] } }]
  return []
}

export function safeFilterValue(value: string): string {
  const trimmed = value.trim().slice(0, 64)
  if (!/^[A-Za-z0-9:_-]+$/.test(trimmed)) return "other"
  return trimmed
}

export function newsletterEventProperties(input: { status: string; areaCount?: number }): Record<string, string | number> {
  const status = input.status === "success" || input.status === "failed" || input.status === "submitted" ? input.status : "submitted"
  const properties: Record<string, string | number> = { status }
  if (typeof input.areaCount === "number" && Number.isFinite(input.areaCount)) {
    properties.area_count = Math.max(0, Math.min(99, Math.round(input.areaCount)))
  }
  return properties
}

export function playlistEventProperties(input: {
  success: boolean
  status: string
  scopeKind: string
  scopeId: string
  isPublic: boolean
  trackCount: number
  phase?: string | null
  httpStatus?: number | null
}): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = {
    success: input.success,
    status: safeFilterValue(input.status),
    scope_kind: safeFilterValue(input.scopeKind),
    scope_id: safeFilterValue(input.scopeId),
    is_public: input.isPublic,
    track_count: input.trackCount,
  }
  if (input.phase) properties.phase = safeFilterValue(input.phase)
  if (typeof input.httpStatus === "number" && input.httpStatus > 0) properties.http_status = input.httpStatus
  return properties
}

export function sanitizeProperties(input: Record<string, unknown> | undefined): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  if (input) {
    for (const [key, value] of Object.entries(input)) {
      if (BLOCKED_KEYS.has(key.toLowerCase()) || /email|token|password|authorization/i.test(key)) continue
      if (key === "$current_url" && typeof value === "string") {
        output[key] = scrubUrl(value)
        continue
      }
      if (typeof value === "string") {
        output[key] = redactText(value)
        continue
      }
      output[key] = value
    }
  }
  output.app = ANALYTICS_APP
  return output
}

export function distinctIdFromPosthogCookie(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null
  const parsed = parseCookieJson(cookieValue)
  const id = parsed && typeof parsed.distinct_id === "string" ? parsed.distinct_id.trim() : ""
  if (!id || id.length > 200 || id.includes("@") || /\s/.test(id)) return null
  return id
}

export type CookieReader = { get(name: string): { value: string } | undefined }

export function distinctIdFromJar(jar: CookieReader, projectKey = process.env.NEXT_PUBLIC_POSTHOG_KEY): string {
  const listener = jar.get(LISTENER_COOKIE)?.value ?? ""
  if (/^[a-f0-9]{64}$/.test(listener)) return listener
  if (!projectKey) return ""
  return distinctIdFromPosthogCookie(jar.get(posthogCookieName(projectKey))?.value) ?? ""
}

function redactText(value: string): string {
  return value.replace(EMAIL_IN_TEXT, "[redacted]")
}

function scrubUrl(value: string): string {
  try {
    const url = new URL(value)
    for (const key of STRIP_URL_PARAMS) url.searchParams.delete(key)
    return url.toString()
  } catch {
    return redactText(value)
  }
}

function parseCookieJson(value: string): { distinct_id?: unknown } | null {
  const candidates = [value]
  try {
    candidates.push(decodeURIComponent(value))
  } catch {
    // The cookie was not URI-encoded.
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { distinct_id?: unknown }
      if (parsed && typeof parsed === "object") return parsed
    } catch {
      // Try the next encoding.
    }
  }
  return null
}
