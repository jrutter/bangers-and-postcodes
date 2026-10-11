import { NextResponse } from "next/server"

import { newsletterEnv } from "@/lib/newsletter/config"
import { unsubscribeSubscriber } from "@/lib/newsletter/flow"
import { getStore } from "@/lib/newsletter/store"

export async function GET(request: Request) {
  const result = await unsubscribeFromRequest(request)
  const status = result === "unsubscribed" ? "unsubscribed" : result === "unavailable" ? "unavailable" : "invalid"
  return NextResponse.redirect(new URL(`/newsletter?status=${status}`, request.url))
}

export async function POST(request: Request) {
  const body = (await request.text()).trim()
  if (body !== "List-Unsubscribe=One-Click") {
    return new Response("Expected one-click unsubscribe.", { status: 400 })
  }
  const result = await unsubscribeFromRequest(request)
  if (result === "unsubscribed") return new Response("Unsubscribed.", { status: 200 })
  if (result === "unavailable") return new Response("Newsletter is not configured.", { status: 503 })
  return new Response("Invalid unsubscribe link.", { status: 400 })
}

async function unsubscribeFromRequest(request: Request): Promise<"unsubscribed" | "invalid" | "unavailable"> {
  const token = new URL(request.url).searchParams.get("token") || ""
  const store = getStore()
  const secret = newsletterEnv().tokenSecret
  if (!store || !secret || !token) return "unavailable"
  try {
    const result = await unsubscribeSubscriber(token, { store, now: new Date(), tokenSecret: secret })
    return result === "unsubscribed" ? "unsubscribed" : "invalid"
  } catch {
    return "unavailable"
  }
}
