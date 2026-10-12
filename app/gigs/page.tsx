import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"

import { GigSection } from "@/components/gig-section"
import { TastePrompt } from "@/components/taste-prompt"
import { TasteSort } from "@/components/taste-sort"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { loadTasteSession, tasteAccess } from "@/lib/taste-session"

export const metadata: Metadata = {
  title: "Gigs",
  description: "Gigs this week across Greater London, with Spotify links for the artists on the bill.",
}

export const maxDuration = 120

export default function GigsPage(props: PageProps<"/gigs">) {
  return (
    <div className="space-y-12">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">This week</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Gigs</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Upcoming shows across Greater London. The search is split into overlapping 8 mile tiles so each part of the
          city is covered, then cached for about six hours. A region or area page shows what is on there this week.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking gig listings…</p>}>
        <GigsBody searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function GigsBody({
  searchParams,
}: {
  searchParams: PageProps<"/gigs">["searchParams"]
}) {
  await connection()
  const query = await searchParams
  const sort = first(query.sort) === "for-you" ? "for-you" : "date"
  const access = await tasteAccess()
  const taste = sort === "for-you" && (access === "granted" || access === "unknown") ? await loadTasteSession("/gigs?sort=for-you") : null
  const sortTaste = taste?.status === "ready" ? taste.profile : null
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  return (
    <div className="space-y-12">
      <TasteControls pathname="/gigs" sort={sort} access={access} taste={taste} />
      <GigSection
        feed={feed}
        heading="This week"
        intro="Artists with a gig in the next 7 days, anywhere in Greater London. The playlist uses this set."
        selection={{ kind: "london" }}
        span="week"
        playlistScope={{ kind: "week", focus: "all" }}
        playlistLabel="This week's gigs playlist"
        emptyLabel="No gigs were listed for the next 7 days."
        sortTaste={sortTaste}
      />
      <GigSection
        feed={feed}
        heading="Later"
        intro="After this week, inside the cached listings window, still inside Greater London."
        selection={{ kind: "london" }}
        span="later"
        emptyLabel="No later gigs were listed."
        sortTaste={sortTaste}
      />
    </div>
  )
}

function TasteControls({
  pathname,
  sort,
  access,
  taste,
}: {
  pathname: string
  sort: "date" | "for-you"
  access: Awaited<ReturnType<typeof tasteAccess>>
  taste: Awaited<ReturnType<typeof loadTasteSession>> | null
}) {
  if (access === "anonymous") return <TastePrompt returnTo={`${pathname}?sort=for-you`} mode="anonymous" />
  if (access === "needs-scope" || taste?.status === "needs-scope") {
    return <TastePrompt returnTo={`${pathname}?sort=for-you`} mode="needs-scope" />
  }
  return (
    <div className="space-y-3">
      <TasteSort pathname={pathname} sort={sort} />
      {taste?.status === "error" ? <p className="text-sm text-muted-foreground">{taste.message}</p> : null}
      {taste?.status === "empty" ? (
        <p className="text-sm text-muted-foreground">
          Spotify did not return top artists, tracks, or follows, so this list stays in date order.
        </p>
      ) : null}
    </div>
  )
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
