import { randomUUID } from "node:crypto"

import { cookies, headers } from "next/headers"
import { PostHog } from "posthog-node"

import { CONSENT_COOKIE, analyticsConsentAllows, distinctIdFromJar, sanitizeProperties } from "@/lib/analytics"

const FLUSH_TIMEOUT_MS = 2000

export async function captureServer(distinctId: string, event: string, properties?: Record<string, unknown>): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
  if (!key || !distinctId) return
  const host = absolutePosthogHost(process.env.NEXT_PUBLIC_POSTHOG_HOST)
  const client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 })
  try {
    await Promise.race([
      client.captureImmediate({
        distinctId,
        event,
        properties: sanitizeProperties(properties),
        disableGeoip: true,
      }),
      new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ])
  } finally {
    await Promise.race([client.shutdown(), new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))])
  }
}

/** Sends a server event only after the visitor has accepted analytics and has not set Do Not Track. */
export async function captureServerIfAllowed(
  event: string,
  properties?: Record<string, unknown>,
  distinctId?: string,
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
  if (!key) return
  const jar = await cookies()
  const headerList = await headers()
  if (!analyticsConsentAllows({ dnt: headerList.get("dnt"), consent: jar.get(CONSENT_COOKIE)?.value })) return
  const id = distinctId || distinctIdFromJar(jar, key) || randomUUID()
  await captureServer(id, event, properties)
}

function absolutePosthogHost(host: string | undefined): string {
  const value = host?.trim() || "https://us.i.posthog.com"
  if (value.startsWith("http://") || value.startsWith("https://")) return value
  return "https://us.i.posthog.com"
}
