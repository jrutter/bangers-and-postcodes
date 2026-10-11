import { timingSafeEqual } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { LISTENER_COOKIE } from "@/lib/analytics"
import { analyticsSecret, listenerId } from "@/lib/listener-id"
import { safeReturnPath } from "@/lib/oauth"
import { captureServerIfAllowed } from "@/lib/posthog-server"
import { COOKIE, applyTokenCookies, cookieOptions } from "@/lib/session"
import { SpotifyError, appendSpotifyFailure, spotifyClient } from "@/lib/spotify"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const returnedState = params.get("state") ?? ""
  const expectedState = request.cookies.get(COOKIE.state)?.value ?? ""
  const returnTo = safeReturnPath(request.cookies.get(COOKIE.returnTo)?.value)
  const fail = async (code: string) => {
    await reportLogin(false, code)
    const destination = new URL(returnTo, request.url)
    destination.searchParams.set("error", code)
    const response = NextResponse.redirect(destination)
    clearOauth(response)
    return response
  }

  if (params.get("error")) return fail("denied")
  const code = params.get("code")
  if (!code || !expectedState || !safeEqual(returnedState, expectedState)) return fail("state")

  try {
    const client = spotifyClient()
    const bundle = await client.exchangeCode(code)
    const destination = new URL(returnTo, request.url)
    const response = NextResponse.redirect(destination)
    applyTokenCookies(response.cookies, bundle)
    clearOauth(response)
    let hash: string | null = null
    try {
      const spotifyUserId = await client.profileId(bundle.access_token)
      if (spotifyUserId) {
        hash = listenerId(spotifyUserId, analyticsSecret())
        response.cookies.set(LISTENER_COOKIE, hash, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 60,
        })
      }
    } catch {
      // Login still succeeds when the profile lookup fails.
    }
    await reportLogin(true, "completed", hash)
    return response
  } catch (error) {
    if (error instanceof SpotifyError) {
      const destination = new URL(appendSpotifyFailure(returnTo, error), request.url)
      const response = NextResponse.redirect(destination)
      clearOauth(response)
      return response
    }
    console.error("[spotify] token exchange failed", error instanceof Error ? error.message : "unknown")
    return fail("spotify")
  }
}

async function reportLogin(success: boolean, status: string, distinctId?: string | null) {
  try {
    await captureServerIfAllowed("spotify_login_completed", { success, status }, distinctId || undefined)
  } catch {
    // Analytics must not block the redirect.
  }
}

function clearOauth(response: NextResponse) {
  response.cookies.set(COOKIE.state, "", cookieOptions(0))
  response.cookies.set(COOKIE.returnTo, "", cookieOptions(0))
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}
