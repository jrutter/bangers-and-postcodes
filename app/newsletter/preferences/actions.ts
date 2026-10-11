"use server"

import { updateSubscriberAreas } from "@/lib/newsletter/flow"
import { newsletterEnv } from "@/lib/newsletter/config"
import { getStore } from "@/lib/newsletter/store"

export type PreferenceResult = { status: "updated" } | { status: "invalid"; message: string } | { status: "unsubscribed" }

export async function updateAreasAction(_prev: PreferenceResult | null, formData: FormData): Promise<PreferenceResult> {
  const store = getStore()
  const secret = newsletterEnv().tokenSecret
  if (!store || !secret) return { status: "invalid", message: "The weekly email is not switched on yet." }
  try {
    const result = await updateSubscriberAreas(String(formData.get("token") || ""), formData.getAll("areas").map(String), {
      store,
      now: new Date(),
      tokenSecret: secret,
    })
    if (result === "updated") return { status: "updated" }
    if (result === "unsubscribed") return { status: "unsubscribed" }
    return { status: "invalid", message: "Pick at least one postcode district from the list." }
  } catch {
    return { status: "invalid", message: "Those areas did not save. Try again in a minute." }
  }
}
