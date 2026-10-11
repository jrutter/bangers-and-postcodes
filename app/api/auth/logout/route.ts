import { NextRequest, NextResponse } from "next/server"

import { COOKIE, cookieOptions } from "@/lib/session"

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url))
  for (const name of [COOKIE.access, COOKIE.refresh, COOKIE.expires, COOKIE.state, COOKIE.returnTo]) {
    response.cookies.set(name, "", cookieOptions(0))
  }
  return response
}
