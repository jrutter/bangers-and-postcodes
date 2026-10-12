import { NextRequest, NextResponse } from "next/server"

import { LISTENER_COOKIE, analyticsConsentAllows } from "@/lib/analytics"

export async function GET(request: NextRequest) {
  const allowed = analyticsConsentAllows({
    dnt: request.headers.get("dnt"),
    consent: request.cookies.get("bangers_analytics")?.value,
  })
  const id = request.cookies.get(LISTENER_COOKIE)?.value ?? ""
  if (!allowed || !/^[a-f0-9]{64}$/.test(id)) {
    return NextResponse.json({ id: null })
  }
  return NextResponse.json({ id })
}
