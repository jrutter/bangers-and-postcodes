import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export function newToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const left = createHash("sha256").update(provided).digest()
  const right = createHash("sha256").update(expected).digest()
  return timingSafeEqual(left, right)
}

/** Preference and unsubscribe links are derived. The raw token is not stored. */
export function preferenceToken(subscriberId: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(subscriberId).digest("base64url")
  return `${subscriberId}.${sig}`
}

export function readPreferenceToken(token: string, secret: string): string | null {
  if (!secret) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const id = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const expected = createHmac("sha256", secret).update(id).digest("base64url")
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  return id
}

export function batchIdempotencyKey(weekKey: string, subscriberIds: string[]): string {
  const digest = createHash("sha256").update([...subscriberIds].sort().join(",")).digest("hex").slice(0, 32)
  return `nl-${weekKey}-${digest}`
}
