import { createHmac } from "node:crypto"

/** One-way id for PostHog. The Spotify user id never leaves the server. */
export function listenerId(spotifyUserId: string, secret: string): string {
  const key = secret.trim() || "bangers-and-postcodes"
  return createHmac("sha256", key).update(`bangers-and-postcodes:${spotifyUserId}`).digest("hex")
}

export function analyticsSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SPOTIFY_CLIENT_SECRET ?? "").trim() || "bangers-and-postcodes"
}
