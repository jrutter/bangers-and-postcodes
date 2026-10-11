import type { Metadata } from "next"
import { Suspense } from "react"

import { PreferenceForm } from "@/components/newsletter-preferences"
import { newsletterAreas } from "@/lib/newsletter/areas"
import { newsletterEnv } from "@/lib/newsletter/config"
import { subscriberFromToken } from "@/lib/newsletter/flow"
import { getStore } from "@/lib/newsletter/store"

export const metadata: Metadata = {
  title: "Email areas",
  robots: { index: false, follow: false },
}

export default function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your areas…</p>}>
      <PreferencesBody searchParams={searchParams} />
    </Suspense>
  )
}

async function PreferencesBody({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || ""
  const store = getStore()
  const secret = newsletterEnv().tokenSecret
  if (!token || !store || !secret) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Email areas</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Use the change-areas link from a Thursday email. The weekly email is off when its keys are missing.
        </p>
      </div>
    )
  }
  const subscriber = await subscriberFromToken(token, { store, tokenSecret: secret }).catch(() => null)
  if (!subscriber) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Email areas</h1>
        <p className="text-sm leading-6 text-muted-foreground">This link does not match a subscriber.</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <header className="max-w-2xl space-y-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Email areas</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {subscriber.email}. The next Thursday email uses the districts you leave ticked. Unsubscribe from the link in
          any email.
        </p>
      </header>
      <PreferenceForm token={token} options={newsletterAreas()} selected={subscriber.areas} status={subscriber.status} />
    </div>
  )
}
