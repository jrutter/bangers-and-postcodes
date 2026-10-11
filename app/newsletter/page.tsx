import type { Metadata } from "next"
import { Suspense } from "react"

import { NewsletterSignup } from "@/components/newsletter-signup"

export const metadata: Metadata = {
  title: "Weekly email",
  description: "Confirm a weekly gig roundup for the London postcode districts you pick.",
}

export default function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <NewsletterStatus searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the weekly email signup…</p>}>
        <NewsletterSignup placement="panel" defaultAreas={[]} />
      </Suspense>
    </div>
  )
}

async function NewsletterStatus({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  if (status === "confirmed") {
    return <p className="text-sm leading-6">You are on the list. Thursday&apos;s email covers the areas you picked.</p>
  }
  if (status === "unsubscribed") {
    return <p className="text-sm leading-6">You are unsubscribed. The Thursday email will stop.</p>
  }
  if (status === "invalid") {
    return (
      <p className="text-sm leading-6">
        That link has expired or was already used. Sign up again and use the newest email.
      </p>
    )
  }
  if (status === "unavailable") {
    return <p className="text-sm leading-6">The weekly email is not switched on yet.</p>
  }
  return null
}
