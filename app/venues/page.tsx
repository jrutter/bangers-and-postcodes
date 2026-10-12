import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"

import { TastePrompt } from "@/components/taste-prompt"
import { TasteSort } from "@/components/taste-sort"
import { areaPath, artists, knownPostcode, placeById, postcodePath } from "@/lib/catalogue"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { selectGigs } from "@/lib/gigs/select"
import { indexTags, matchVenue, orderByTaste } from "@/lib/taste"
import { loadTasteSession, tasteAccess } from "@/lib/taste-session"
import {
  VENUE_ATTRIBUTION,
  filterVenues,
  groupVenues,
  venueBoroughs,
  venuePath,
  venueTypeLabel,
  venueTypes,
  venues,
  type Venue,
} from "@/lib/venues"

export const metadata: Metadata = {
  title: "Venues",
  description: "Music venues across Greater London, with upcoming gigs when a listings key is set.",
}

export const maxDuration = 60

export default function VenuesPage(props: PageProps<"/venues">) {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Venues</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Music venues from the GLA Cultural Infrastructure Map and OpenStreetMap, plus the hand-checked southwest
          rooms. Pryzm Kingston, at 154 Clarence Street, KT1 1QP, closed in July 2025, so it is not listed. Gig dates
          come from Skiddle or Ticketmaster when a listing falls inside the southwest search. Other rooms still have a
          page and a playlist of whoever the feeds attach to that room.
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
  const q = first(query.q) ?? ""
  const area = first(query.area) ?? ""
  const type = first(query.type) ?? ""
  const access = await tasteAccess()
  const returnTo = venueQuery({ q, area, type, sort: "for-you" })
  const taste = sort === "for-you" && (access === "granted" || access === "unknown") ? await loadTasteSession(returnTo) : null
  const sortTaste = taste?.status === "ready" ? taste.profile : null
  const filtered = filterVenues(venues(), { q, area, type })
  let rows: { item: Venue; reason: string | null }[] = filtered.map((item) => ({ item, reason: null }))
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
    rows = orderByTaste(filtered, (venue) => matchVenue(sortTaste, byVenue.get(venue.id) ?? [], tags)).map((row) => ({
      item: row.item,
      reason: row.taste?.reason ?? null,
    }))
    if (!configured) listingNote = "No gig provider is configured, so the rooms stay in directory order."
    else if (upcoming.length === 0) listingNote = "No upcoming gigs were listed, so the rooms stay in directory order."
  }

  const needsScope = access === "needs-scope" || taste?.status === "needs-scope"
  const districts = [...new Set(venues().map((venue) => venue.postcodeDistrict).filter((code): code is string => Boolean(code)))].sort()
  return (
    <div className="space-y-6">
      <form className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" method="get">
        <input
          className="h-10 rounded-lg bg-card px-3 text-sm ring-1 ring-foreground/15"
          name="q"
          defaultValue={q}
          placeholder="Search name or address"
          aria-label="Search venues"
        />
        <select className="h-10 rounded-lg bg-card px-3 text-sm ring-1 ring-foreground/15" name="area" defaultValue={area} aria-label="Area">
          <option value="">All areas</option>
          <optgroup label="Boroughs">
            {venueBoroughs().map((borough) => (
              <option key={borough.id} value={borough.id}>
                {borough.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Postcodes">
            {districts.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </optgroup>
        </select>
        <select className="h-10 rounded-lg bg-card px-3 text-sm ring-1 ring-foreground/15" name="type" defaultValue={type} aria-label="Venue type">
          <option value="">All types</option>
          <option value="grassroots">Grassroots</option>
          {venueTypes()
            .filter((item) => item !== "grassroots")
            .map((item) => (
              <option key={item} value={item}>
                {venueTypeLabel(item)}
              </option>
            ))}
        </select>
        <button className="h-10 rounded-lg bg-foreground px-4 text-sm text-background" type="submit">
          Filter
        </button>
      </form>
      {access === "anonymous" ? <TastePrompt returnTo={returnTo} mode="anonymous" /> : null}
      {needsScope ? <TastePrompt returnTo={returnTo} mode="needs-scope" /> : null}
      {access !== "anonymous" && !needsScope ? (
        <div className="space-y-3">
          <TasteSort pathname="/venues" sort={sort} query={{ q, area, type }} />
          {taste?.status === "error" ? <p className="text-sm text-muted-foreground">{taste.message}</p> : null}
          {taste?.status === "empty" ? (
            <p className="text-sm text-muted-foreground">
              Spotify did not return top artists, tracks, or follows, so the rooms stay in directory order.
            </p>
          ) : null}
          {listingNote ? <p className="text-sm text-muted-foreground">{listingNote}</p> : null}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {rows.length} {rows.length === 1 ? "venue" : "venues"}
        {q || area || type ? " match this filter" : " across London"}.
      </p>
      {sort === "for-you" ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.item.id}>
              <VenueRow venue={row.item} reason={row.reason} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          {groupVenues(rows.map((row) => row.item)).map((group) => (
            <details key={group.borough} open={Boolean(area || q || type)} className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium">
                {group.borough} · {group.districts.reduce((sum, district) => sum + district.venues.length, 0)}
              </summary>
              <div className="space-y-4 pt-2">
                {group.districts.map((district) => (
                  <section key={district.district} className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {district.district !== "No district" && knownPostcode(district.district) ? (
                        <Link href={postcodePath(district.district)} className="underline decoration-border underline-offset-4">
                          {district.district}
                        </Link>
                      ) : (
                        district.district
                      )}
                    </h2>
                    <ul className="space-y-2">
                      {district.venues.map((venue) => (
                        <li key={venue.id}>
                          <VenueRow venue={venue} reason={null} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">{VENUE_ATTRIBUTION}</p>
    </div>
  )
}

function VenueRow({ venue, reason }: { venue: Venue; reason: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <Link href={venuePath(venue.id)} className="font-medium underline decoration-border underline-offset-4">
          {venue.name}
        </Link>{" "}
        <span className="text-muted-foreground">
          {venueTypeLabel(venue.type)}
          {venue.grassroots ? " · grassroots" : ""}
          {venue.postcode ? ` · ${venue.postcode}` : ""}
        </span>
      </p>
      {reason ? <p className="text-sm font-medium text-accent">{reason}</p> : null}
      <p className="text-sm text-muted-foreground">
        {venue.address}
        {venue.boroughId && placeById(venue.boroughId) ? (
          <>
            {" · "}
            <Link href={areaPath(venue.boroughId)} className="underline decoration-border underline-offset-4">
              {placeById(venue.boroughId)?.name}
            </Link>
          </>
        ) : venue.borough ? (
          ` · ${venue.borough}`
        ) : null}
      </p>
    </div>
  )
}

function venueQuery(query: { q?: string; area?: string; type?: string; sort?: string }): string {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.area) params.set("area", query.area)
  if (query.type) params.set("type", query.type)
  if (query.sort) params.set("sort", query.sort)
  const text = params.toString()
  return text ? `/venues?${text}` : "/venues"
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
