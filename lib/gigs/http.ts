import { GIG_REVALIDATE_SECONDS } from "@/lib/gigs/constants"

export class GigProviderError extends Error {
  constructor(message: string) {
    super(scrubSecrets(message))
    this.name = "GigProviderError"
  }
}

export function scrubSecrets(message: string): string {
  return message
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1redacted")
    .replace(/(app_id=)[^&\s]+/gi, "$1redacted")
    .slice(0, 200)
}

export async function getJson(fetchImpl: typeof fetch, url: string, provider: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "bangers-and-postcodes",
      },
      next: { revalidate: GIG_REVALIDATE_SECONDS, tags: ["gigs"] },
    })
  } catch {
    throw new GigProviderError(`${provider} could not be reached.`)
  }
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new GigProviderError(`${provider} returned ${response.status} and no JSON.`)
  }
  if (!response.ok) throw new GigProviderError(`${provider} returned ${response.status}.`)
  return body
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function stringField(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

export function numberField(record: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

export function httpsUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}
