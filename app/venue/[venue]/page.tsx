import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { GigSection } from "@/components/gig-section"
import { VenueRank } from "@/components/venue-rank"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { readManifest, readVenuePage } from "@/lib/page-data"
import { areaPath, venueTypeLabel } from "@/lib/paths"
import { regionById, regionPath } from "@/lib/regions"

export const maxDuration = 120

export async function generateStaticParams() {
  return readManifest().venues.map((venue) => ({ venue }))
}

export async function generateMetadata(props: PageProps<"/venue/[venue]">): Promise<Metadata> {
  const { venue: venueId } = await props.params
  return { title: readVenuePage(venueId)?.name ?? "Venue" }
}

export default async function VenuePage(props: PageProps<"/venue/[venue]">) {
  const { venue: venueId } = await props.params
  const venue = readVenuePage(venueId)
  if (!venue) notFound()
  const region = venue.regionId ? regionById(venue.regionId) : null
  return (
    <article className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <Breadcrumbs
          items={[
            { href: "/", label: "London" },
            ...(region ? [{ href: regionPath(region.id), label: region.name }] : []),
            { label: venue.name },
          ]}
        />
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">
          {[venueTypeLabel(venue.type), venue.grassroots ? "Grassroots" : null, venue.borough].filter(Boolean).join(" · ")}
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{venue.name}</h1>
        <Suspense fallback={null}>
          <VenueRank venueId={venue.id} />
        </Suspense>
        <p className="text-base leading-7 text-muted-foreground">
          {[venue.address, venue.postcode].filter(Boolean).join(", ")}. {venue.note}
          {venue.capacity ? ` Capacity listed as ${venue.capacity.toLocaleString("en-GB")}.` : ""}
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          {venue.postcodeLinks.map((link) =>
            link.href ? (
              <Link key={link.code} href={link.href} className="underline decoration-border underline-offset-4">
                {link.code}
              </Link>
            ) : (
              <span key={link.code}>{link.code}</span>
            ),
          )}
          {venue.areaLinks.map((area) => (
            <Link key={area.id} href={areaPath(area.id)} className="underline decoration-border underline-offset-4">
              {area.name}
            </Link>
          ))}
          {venue.website ? (
            <a className="underline decoration-border underline-offset-4" href={venue.website}>
              Website
            </a>
          ) : null}
          <Link href="/venues" className="underline decoration-border underline-offset-4">
            All venues
          </Link>
        </div>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking listings for {venue.name}…</p>}>
        <GigSection
          heading="Upcoming gigs"
          intro="Shows the listing feeds attach to this room. The playlist is whoever is on those bills."
          selection={{ kind: "venue", venueId: venue.id }}
          span="upcoming"
          playlistScope={{ kind: "venue", venueId: venue.id }}
          playlistLabel="Playlist of who's playing here"
          emptyLabel={`No upcoming gigs were listed at ${venue.name}.`}
        />
      </Suspense>
    </article>
  )
}
