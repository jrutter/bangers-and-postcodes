import { Suspense } from "react"

import { ArtistBoard } from "@/components/artist-board"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { NewsletterSignup } from "@/components/newsletter-signup"
import { LinkButton } from "@/components/link-button"
import { EraFilter } from "@/components/era-filter"
import { LocalityBody } from "@/components/locality-body"
import { Badge } from "@/components/ui/badge"
import { areaPath, playlistPath, postcodePath, venuePath, venueTypeLabel, type Scope } from "@/lib/paths"
import { eraScope, filterArtists, withEra, type EraFilter as Era } from "@/lib/era"
import { defaultAreasForScope } from "@/lib/newsletter/areas"
import type { GigSelection } from "@/lib/gigs/types"
import type { PageRoom } from "@/lib/page-data"
import type { ArtistRecord, PlaceRecord } from "@/lib/types"

export function LocalityView({
  kicker,
  title,
  note,
  artists,
  places,
  scope,
  gigs,
  era = null,
  page = 1,
  crumbs,
  visitor,
  rooms = [],
}: {
  kicker: string
  title: string
  note: string
  artists: ArtistRecord[]
  places: { href: string; label: string }[]
  scope: Scope
  era?: Era | null
  page?: number
  crumbs?: { href?: string; label: string }[]
  visitor?: { knownFor: string; gettingThere: string }
  rooms?: PageRoom[]
  gigs: {
    heading: string
    intro: string
    selection: GigSelection
    playlistScope: Scope
    playlistLabel: string
    emptyLabel: string
  }
}) {
  const path = scopePath(scope)
  const filtered = filterArtists(artists, era)
  return (
    <article className="space-y-8">
      <header className="max-w-3xl space-y-4">
        {crumbs && crumbs.length > 0 ? <Breadcrumbs items={crumbs} /> : null}
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">{kicker}</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-base leading-7 text-muted-foreground">{note}</p>
        {visitor ? (
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Known for. </span>
              {visitor.knownFor}
            </p>
            <p>
              <span className="font-medium text-foreground">Getting there. </span>
              {visitor.gettingThere}
            </p>
          </div>
        ) : null}
        {places.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {places.map((place) => (
              <Badge key={place.href} variant="outline" render={<a href={place.href} />}>
                {place.label}
              </Badge>
            ))}
          </div>
        ) : null}
        <EraFilter path={path} era={era} />
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "artist" : "artists"}
          {era ? ` ${eraScope(era)}` : ""}. Lists are paged. Spotify stats load for the visible page.
        </p>
        <LinkButton href={withEra(playlistPath(scope), era)}>
          {era ? `Make a playlist, ${eraScope(era)}` : "Make a playlist"}
        </LinkButton>
      </header>
      {rooms.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">Venues</h2>
          <ul className="space-y-1 text-sm">
            {rooms.slice(0, 12).map((venue) => (
              <li key={venue.id}>
                <a className="font-medium underline decoration-border underline-offset-4" href={venuePath(venue.id)}>
                  {venue.name}
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  · {venueTypeLabel(venue.type)}
                  {venue.postcode ? ` · ${venue.postcode}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the weekly email signup…</p>}>
        <NewsletterSignup placement="panel" defaultAreas={defaultAreasForScope(scope)} />
      </Suspense>
      <Suspense
        fallback={
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">Loading artists…</p>
            <p className="text-sm text-muted-foreground">Checking gig listings…</p>
          </div>
        }
      >
        <LocalityBody artists={filtered} emptyNote={note} gigs={gigs} scope={scope} era={era} page={page} path={path} />
      </Suspense>
    </article>
  )
}

function scopePath(scope: Scope): string {
  if (scope.kind === "postcode") return postcodePath(scope.postcode)
  if (scope.kind === "area") return areaPath(scope.placeId)
  return "/"
}

export function placeLinks(records: PlaceRecord[]): { href: string; label: string }[] {
  return records.map((place) => ({
    href: areaPath(place.id),
    label: place.postcodes.length > 0 ? `${place.name} · ${place.postcodes.join(", ")}` : place.name,
  }))
}

export function postcodeLinks(postcodes: string[]): { href: string; label: string }[] {
  return postcodes.map((postcode) => ({ href: postcodePath(postcode), label: postcode }))
}
