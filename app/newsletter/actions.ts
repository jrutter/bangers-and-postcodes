"use server"

import { createEmailClient } from "@/lib/newsletter/email"
import { requestSubscription, type SubscribeResult } from "@/lib/newsletter/flow"
import { liveSendsAllowed, newsletterEnv, signupEnabled } from "@/lib/newsletter/config"
import { getStore } from "@/lib/newsletter/store"

export async function subscribeAction(_prev: SubscribeResult | null, formData: FormData): Promise<SubscribeResult> {
  if (!signupEnabled()) {
    return { status: "invalid", message: "The weekly email is not switched on yet." }
  }
  const store = getStore()
  if (!store) return { status: "invalid", message: "The weekly email is not switched on yet." }
  const deliver = liveSendsAllowed()
  const cfg = newsletterEnv()
  try {
    const email = deliver ? await createEmailClient() : null
    return await requestSubscription(
      {
        email: String(formData.get("email") || ""),
        areas: formData.getAll("areas").map(String),
        consent: formData.get("consent") === "yes",
        company: String(formData.get("company") || ""),
      },
      {
        store,
        email,
        now: new Date(),
        siteUrl: cfg.siteUrl,
        tokenSecret: cfg.tokenSecret,
        deliver,
      },
    )
  } catch {
    return { status: "invalid", message: "That signup did not save. Try again in a minute." }
  }
}
