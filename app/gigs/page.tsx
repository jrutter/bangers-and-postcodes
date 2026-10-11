import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"

import { GigSection } from "@/components/gig-section"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"

export const metadata: Metadata = {
  title: "Gigs",
  description: "Upcoming gigs in southwest London, with Spotify links for the artists on the bill.",
}

export const maxDuration = 60

export default function GigsPage() {
  return (
    <div className="space-y-12">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-primary uppercase">Southwest London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Gigs</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Upcoming shows around Barnes, Putney, Richmond, Kingston, Wimbledon, Mortlake, Fulham, and Wandsworth, plus
          Twickenham and Balham rooms that sit in those boroughs. Touring artists are included. Nothing here is filled
          in when the listing feeds are off.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking gig listings…</p>}>
        <GigsBody />
      </Suspense>
    </div>
  )
}

async function GigsBody() {
  await connection()
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  return (
    <div className="space-y-12">
      <GigSection
        feed={feed}
        heading="This week"
        intro="Artists with a gig in the next 7 days. The playlist uses this set."
        selection={{ kind: "southwest" }}
        span="week"
        playlistScope={{ kind: "week", focus: "all" }}
        playlistLabel="This week's gigs playlist"
        emptyLabel="No gigs were listed for the next 7 days."
      />
      <GigSection
        feed={feed}
        heading="Later"
        intro="The same area, after this week, inside the cached listings window."
        selection={{ kind: "southwest" }}
        span="later"
        emptyLabel="No later gigs were listed."
      />
    </div>
  )
}
