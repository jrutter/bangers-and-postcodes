import { Suspense } from "react"

import { ArtistBoard } from "@/components/artist-board"
import { NewsletterSignup } from "@/components/newsletter-signup"
import { LinkButton } from "@/components/link-button"
import { LocalityBody } from "@/components/locality-body"
import { Badge } from "@/components/ui/badge"
import { areaPath, playlistPath, postcodePath, type Scope } from "@/lib/catalogue"
import { defaultAreasForScope } from "@/lib/newsletter/areas"
import type { GigSelection } from "@/lib/gigs/types"
import type { ArtistRecord, PlaceRecord } from "@/lib/types"

export function LocalityView({
  kicker,
  title,
  note,
  artists,
  places,
  scope,
  gigs,
}: {
  kicker: string
  title: string
  note: string
  artists: ArtistRecord[]
  places: { href: string; label: string }[]
  scope: Scope
  gigs: {
    heading: string
    intro: string
    selection: GigSelection
    playlistScope: Scope
    playlistLabel: string
    emptyLabel: string
  }
}) {
  return (
    <article className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">{kicker}</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-base leading-7 text-muted-foreground">{note}</p>
        {places.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {places.map((place) => (
              <Badge key={place.href} variant="outline" render={<a href={place.href} />}>
                {place.label}
              </Badge>
            ))}
          </div>
        ) : null}
        <LinkButton href={playlistPath(scope)}>Make a playlist</LinkButton>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the weekly email signup…</p>}>
        <NewsletterSignup placement="panel" defaultAreas={defaultAreasForScope(scope)} />
      </Suspense>
      <Suspense
        fallback={
          <div className="space-y-6">
            <ArtistBoard artists={artists} status="loading" />
            <p className="text-sm text-muted-foreground">Checking gig listings…</p>
          </div>
        }
      >
        <LocalityBody artists={artists} emptyNote={note} gigs={gigs} scope={scope} />
      </Suspense>
    </article>
  )
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
