import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"

import { TastePrompt } from "@/components/taste-prompt"
import { TasteSort } from "@/components/taste-sort"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { areaPath, artists, knownPostcode, placeById, postcodePath } from "@/lib/catalogue"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { selectGigs } from "@/lib/gigs/select"
import { indexTags, matchVenue, orderByTaste } from "@/lib/taste"
import { loadTasteSession, tasteAccess } from "@/lib/taste-session"
import { venuePath, venues, type Venue } from "@/lib/venues"

export const metadata: Metadata = {
  title: "Venues",
  description: "Music venues in southwest London, with upcoming gigs when a listings key is set.",
}

export const maxDuration = 60

export default function VenuesPage(props: PageProps<"/venues">) {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-primary uppercase">Southwest London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Venues</h1>
        <p className="text-base leading-7 text-muted-foreground">
          A short list of rooms that put music on, from Barnes to Wimbledon and out to Twickenham. Pryzm Kingston, at
          154 Clarence Street, KT1 1QP, closed in July 2025, and a separate Hippodrome music room could not be verified
          as open, so neither is listed. Gig dates on each venue page come from Skiddle or Ticketmaster.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking venues…</p>}>
        <VenuesBody searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function VenuesBody({ searchParams }: { searchParams: PageProps<"/venues">["searchParams"] }) {
  await connection()
  const query = await searchParams
  const sort = first(query.sort) === "for-you" ? "for-you" : "date"
  const access = await tasteAccess()
  const taste = sort === "for-you" && (access === "granted" || access === "unknown") ? await loadTasteSession("/venues?sort=for-you") : null
  const sortTaste = taste?.status === "ready" ? taste.profile : null
  let rows: { item: Venue; reason: string | null }[] = venues().map((item) => ({ item, reason: null }))
  let listingNote: string | null = null
  if (sortTaste) {
    const feed = await loadRegionalGigs(gigProviderFingerprint())
    const configured = feed.providers.some((provider) => provider.configured)
    const upcoming = selectGigs(feed.gigs, { kind: "southwest" }, "upcoming", new Date())
    const byVenue = new Map<string, { artistNames: string[] }[]>()
    for (const gig of upcoming) {
      if (!gig.venueId) continue
      const list = byVenue.get(gig.venueId) ?? []
      list.push(gig)
      byVenue.set(gig.venueId, list)
    }
    const tags = indexTags(artists())
    rows = orderByTaste(venues(), (venue) => matchVenue(sortTaste, byVenue.get(venue.id) ?? [], tags)).map((row) => ({
      item: row.item,
      reason: row.taste?.reason ?? null,
    }))
    if (!configured) listingNote = "No gig provider is configured, so the rooms stay in their usual order."
    else if (upcoming.length === 0) listingNote = "No upcoming gigs were listed, so the rooms stay in their usual order."
  }

  const needsScope = access === "needs-scope" || taste?.status === "needs-scope"
  return (
    <div className="space-y-6">
      {access === "anonymous" ? <TastePrompt returnTo="/venues?sort=for-you" mode="anonymous" /> : null}
      {needsScope ? <TastePrompt returnTo="/venues?sort=for-you" mode="needs-scope" /> : null}
      {access !== "anonymous" && !needsScope ? (
        <div className="space-y-3">
          <TasteSort pathname="/venues" sort={sort} />
          {taste?.status === "error" ? <p className="text-sm text-muted-foreground">{taste.message}</p> : null}
          {taste?.status === "empty" ? (
            <p className="text-sm text-muted-foreground">
              Spotify did not return top artists, tracks, or follows, so the rooms stay in their usual order.
            </p>
          ) : null}
          {listingNote ? <p className="text-sm text-muted-foreground">{listingNote}</p> : null}
        </div>
      ) : null}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.item.id}>
            <VenueCard venue={row.item} reason={row.reason} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function VenueCard({ venue, reason }: { venue: Venue; reason: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={venuePath(venue.id)} className="hover:text-primary">
            {venue.name}
          </Link>
        </CardTitle>
        <CardDescription>
          {venue.address}, {venue.postcode}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reason ? <p className="text-sm font-medium text-primary">{reason}</p> : null}
        <p className="text-sm leading-6 text-muted-foreground">{venue.note}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {venue.postcodes.map((code) =>
            knownPostcode(code) ? (
              <Link key={code} href={postcodePath(code)} className="underline decoration-border underline-offset-4">
                {code}
              </Link>
            ) : (
              <span key={code}>{code}</span>
            ),
          )}
          {venue.areaIds.map((areaId) => (
            <Link key={areaId} href={areaPath(areaId)} className="underline decoration-border underline-offset-4">
              {placeById(areaId)?.name ?? areaId}
            </Link>
          ))}
          {venue.website ? (
            <a className="underline decoration-border underline-offset-4" href={venue.website}>
              Website
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
