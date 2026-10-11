import { cookies } from "next/headers"

import type { TokenBundle } from "@/lib/types"
import { spotifyClient } from "@/lib/spotify"

export const COOKIE = {
  access: "bangers_spotify_access",
  refresh: "bangers_spotify_refresh",
  expires: "bangers_spotify_expires",
  state: "bangers_oauth_state",
  returnTo: "bangers_oauth_return",
} as const

type CookieOptions = {
  httpOnly: true
  sameSite: "lax"
  secure: boolean
  path: "/"
  maxAge: number
}

export function cookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}

export function tokenLifetime(expiresIn?: number): number {
  return typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 3600
}

const REFRESH_MAX_AGE = 60 * 60 * 24 * 60

type CookieWriter = {
  set: (name: string, value: string, options: CookieOptions) => void
}

export function applyTokenCookies(jar: CookieWriter, bundle: TokenBundle): void {
  const lifetime = tokenLifetime(bundle.expires_in)
  const expiresAt = Date.now() + lifetime * 1000
  jar.set(COOKIE.access, bundle.access_token, cookieOptions(lifetime))
  jar.set(COOKIE.expires, String(expiresAt), cookieOptions(lifetime))
  if (bundle.refresh_token) {
    jar.set(COOKIE.refresh, bundle.refresh_token, cookieOptions(REFRESH_MAX_AGE))
  }
}

export async function hasSpotifySession(): Promise<boolean> {
  const jar = await cookies()
  return Boolean(jar.get(COOKIE.access)?.value || jar.get(COOKIE.refresh)?.value)
}

export async function getUserToken(): Promise<string | null> {
  const jar = await cookies()
  const access = jar.get(COOKIE.access)?.value
  const expires = Number(jar.get(COOKIE.expires)?.value || "0")
  const refresh = jar.get(COOKIE.refresh)?.value
  if (access && expires > Date.now() + 15_000) return access
  if (!refresh) return null
  try {
    const bundle = await spotifyClient().refresh(refresh)
    if (!bundle.refresh_token) bundle.refresh_token = refresh
    applyTokenCookies(jar, bundle)
    return bundle.access_token
  } catch {
    return null
  }
}
