import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { GigSection } from "@/components/gig-section"
import { areaPath, knownPostcode, placeById, postcodePath } from "@/lib/catalogue"
import { venueById, venues } from "@/lib/venues"

export const maxDuration = 60

export function generateStaticParams() {
  return venues().map((venue) => ({ venue: venue.id }))
}

export async function generateMetadata(props: PageProps<"/venue/[venue]">): Promise<Metadata> {
  const { venue: venueId } = await props.params
  const venue = venueById(venueId)
  return { title: venue?.name ?? "Venue" }
}

export default async function VenuePage(props: PageProps<"/venue/[venue]">) {
  const { venue: venueId } = await props.params
  const venue = venueById(venueId)
  if (!venue) notFound()
  return (
    <article className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">{venue.postcode}</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{venue.name}</h1>
        <p className="text-base leading-7 text-muted-foreground">
          {venue.address}, {venue.postcode}. {venue.note}
        </p>
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
