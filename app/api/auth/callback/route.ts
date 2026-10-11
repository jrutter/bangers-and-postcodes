import { timingSafeEqual } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { safeReturnPath } from "@/lib/oauth"
import { COOKIE, applyTokenCookies, cookieOptions } from "@/lib/session"
import { spotifyClient } from "@/lib/spotify"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const returnedState = params.get("state") ?? ""
  const expectedState = request.cookies.get(COOKIE.state)?.value ?? ""
  const returnTo = safeReturnPath(request.cookies.get(COOKIE.returnTo)?.value)
  const fail = (code: string) => {
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
    const bundle = await spotifyClient().exchangeCode(code)
    const destination = new URL(returnTo, request.url)
    const response = NextResponse.redirect(destination)
    applyTokenCookies(response.cookies, bundle)
    clearOauth(response)
    return response
  } catch {
    return fail("spotify")
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
