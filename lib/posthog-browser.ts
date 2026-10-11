import posthog from "posthog-js"
import type { CaptureResult } from "posthog-js"

import {
  ANALYTICS_APP,
  type Consent,
  browserInitOptions,
  consentCookie,
  eventsForPath,
  readConsent,
  sanitizeProperties,
} from "@/lib/analytics"

let syncedId: string | null | undefined

export function analyticsKey(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? ""
}

export function browserDoNotTrack(): boolean {
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & { msDoNotTrack?: string }
  const win = typeof window === "undefined" ? undefined : (window as Window & { doNotTrack?: string }).doNotTrack
  const value = nav.doNotTrack || win || nav.msDoNotTrack
  return value === "1" || value === "yes"
}

export function initBrowserAnalytics(): void {
  const key = analyticsKey()
  if (!key || typeof window === "undefined" || posthog.__loaded) return
  const consent = readConsent(document.cookie, browserDoNotTrack())
  if (consent !== "accepted") return
  posthog.init(key, {
    ...browserInitOptions(process.env.NEXT_PUBLIC_POSTHOG_HOST),
    before_send: sanitizeCapture,
    loaded: (instance) => {
      instance.register({ app: ANALYTICS_APP })
    },
  })
}

export function analyticsReady(): boolean {
  return Boolean(analyticsKey()) && typeof window !== "undefined" && posthog.__loaded && !posthog.has_opted_out_capturing()
}

export function captureClient(event: string, properties?: Record<string, unknown>): void {
  if (!analyticsKey() || typeof window === "undefined" || !posthog.__loaded) return
  posthog.capture(event, sanitizeProperties(properties))
}

export function captureException(error: unknown): void {
  if (!analyticsKey() || typeof window === "undefined" || !posthog.__loaded) return
  const message = error instanceof Error ? error.message : ""
  if (/token|bearer|@/i.test(message)) {
    posthog.capture("$exception", sanitizeProperties({ message: "redacted" }))
    return
  }
  posthog.captureException(error)
}

export function captureCurrentView(): void {
  if (typeof window === "undefined") return
  captureClient("$pageview", { $current_url: window.location.href })
  for (const item of eventsForPath(window.location.pathname)) captureClient(item.event, item.properties)
  void syncIdentity()
}

export function applyConsent(choice: "accepted" | "rejected"): void {
  if (typeof document === "undefined") return
  document.cookie = consentCookie(choice, window.location.protocol === "https:")
  syncedId = undefined
  if (choice === "rejected" || browserDoNotTrack()) {
    if (!posthog.__loaded) return
    posthog.stopSessionRecording()
    posthog.opt_out_capturing()
    return
  }
  if (!posthog.__loaded) initBrowserAnalytics()
  if (!posthog.__loaded) return
  posthog.register({ app: ANALYTICS_APP })
  posthog.opt_in_capturing()
  posthog.startSessionRecording()
  captureCurrentView()
}

export function currentConsent(): Consent {
  if (typeof document === "undefined") return "unknown"
  return readConsent(document.cookie, browserDoNotTrack())
}

export async function syncIdentity(): Promise<void> {
  if (!analyticsKey() || typeof window === "undefined" || !posthog.__loaded || posthog.has_opted_out_capturing()) return
  if (syncedId === undefined) {
    try {
      const response = await fetch("/api/analytics/identity", { cache: "no-store", headers: { Accept: "application/json" } })
      const body = (await response.json()) as { id?: unknown }
      syncedId = typeof body.id === "string" && /^[a-f0-9]{64}$/.test(body.id) ? body.id : null
    } catch {
      syncedId = null
    }
  }
  const current = posthog.get_distinct_id()
  if (syncedId && current !== syncedId) posthog.identify(syncedId)
  if (!syncedId && /^[a-f0-9]{64}$/.test(current)) posthog.reset()
}

function sanitizeCapture(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event
  event.properties = sanitizeProperties(event.properties as Record<string, unknown> | undefined)
  return event
}
