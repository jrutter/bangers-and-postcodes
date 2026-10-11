import { NextResponse } from "next/server"

import { confirmSubscription } from "@/lib/newsletter/flow"
import { getStore } from "@/lib/newsletter/store"

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || ""
  const store = getStore()
  if (!store || !token) return NextResponse.redirect(new URL("/newsletter?status=unavailable", request.url))
  try {
    const result = await confirmSubscription(token, { store, now: new Date() })
    const status = result === "confirmed" ? "confirmed" : "invalid"
    return NextResponse.redirect(new URL(`/newsletter?status=${status}`, request.url))
  } catch {
    return NextResponse.redirect(new URL("/newsletter?status=unavailable", request.url))
  }
}
