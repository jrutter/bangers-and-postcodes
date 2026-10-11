export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback"
export const AUTH_URL = "https://accounts.spotify.com/authorize"
export const TOKEN_URL = "https://accounts.spotify.com/api/token"
export const API_ROOT = "https://api.spotify.com/v1"
export const PLAYLIST_SCOPES = ["playlist-modify-private", "playlist-modify-public"] as const

export function redirectUri(envValue?: string | null): string {
  const value = (envValue ?? "").trim()
  return value || DEFAULT_REDIRECT_URI
}

export function authorizeUrl(options: {
  clientId: string
  redirectUri: string
  state: string
  scopes?: readonly string[]
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: (options.scopes ?? PLAYLIST_SCOPES).join(" "),
    state: options.state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

/** Only same-site relative paths. Rejects protocol-relative and absolute URLs. */
export function safeReturnPath(value: string | null | undefined, fallback = "/playlist"): string {
  if (!value) return fallback
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return fallback
  }
  const lowered = value.toLowerCase()
  if (lowered.includes("%2f%2f") || lowered.includes("%5c")) return fallback
  return value
}

export function envValue(name: string, source: NodeJS.ProcessEnv = process.env): string {
  return (source[name] ?? "").trim()
}
