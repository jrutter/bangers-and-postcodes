import { NextRequest, NextResponse } from "next/server"

import { safeReturnPath } from "@/lib/oauth"
import { COOKIE, accessIsFresh, applyTokenCookies, cookieOptions } from "@/lib/session"
import { spotifyClient } from "@/lib/spotify"

export async function GET(request: NextRequest) {
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"), "/")
  const destination = new URL(returnTo, request.url)
  const access = request.cookies.get(COOKIE.access)?.value
  const expires = Number(request.cookies.get(COOKIE.expires)?.value || "0")
  const refresh = request.cookies.get(COOKIE.refresh)?.value
  if (accessIsFresh(access, expires)) return NextResponse.redirect(destination)
  if (!refresh) return NextResponse.redirect(destination)

  try {
    const bundle = await spotifyClient().refresh(refresh)
    if (!bundle.refresh_token) bundle.refresh_token = refresh
    const response = NextResponse.redirect(destination)
    applyTokenCookies(response.cookies, bundle)
    return response
  } catch {
    const response = NextResponse.redirect(destination)
    for (const name of [COOKIE.access, COOKIE.refresh, COOKIE.expires, COOKIE.scope]) {
      response.cookies.set(name, "", cookieOptions(0))
    }
    return response
  }
}
