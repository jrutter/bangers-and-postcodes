import Link from "next/link"

import { SpotifyLinks } from "@/components/spotify-links"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatGigWhen } from "@/lib/gigs/select"
import { lookupLinks, type SpotifyLinkMap } from "@/lib/gigs/spotify"
import type { TaggedGig } from "@/lib/gigs/types"
import { venuePath } from "@/lib/venues"

export function GigList({ gigs, links }: { gigs: TaggedGig[]; links: SpotifyLinkMap }) {
  return (
    <ul className="grid gap-3">
      {gigs.map((gig) => (
        <li key={gig.id}>
          <GigCard gig={gig} links={links} />
        </li>
      ))}
    </ul>
  )
}

function GigCard({ gig, links }: { gig: TaggedGig; links: SpotifyLinkMap }) {
  const names = gig.artistNames.length > 0 ? gig.artistNames : [gig.title]
  const title = names.join(", ")
  const showEventName = gig.title && gig.title !== title && gig.title !== gig.venueName
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3 className="font-heading text-lg font-semibold">{title}</h3>
        </CardTitle>
        {showEventName ? <p className="text-sm text-muted-foreground">{gig.title}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <time dateTime={gig.startsAt ?? gig.date ?? undefined}>{formatGigWhen(gig)}</time>
          {" · "}
          {gig.venueId ? (
            <Link href={venuePath(gig.venueId)} className="underline decoration-border underline-offset-4 hover:text-primary">
              {gig.venueName}
            </Link>
          ) : (
            <span>{gig.venueName}</span>
          )}
        </p>
        {[gig.address, gig.town, gig.postcode].some(Boolean) ? (
          <p className="text-sm text-muted-foreground">{[gig.address, gig.town, gig.postcode].filter(Boolean).join(", ")}</p>
        ) : null}
        {gig.ticketUrl ? (
          <p className="text-sm">
            <a className="font-medium underline decoration-border underline-offset-4 hover:text-primary" href={gig.ticketUrl}>
              Tickets
            </a>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No ticket link on this listing.</p>
        )}
        <ul className="space-y-3">
          {names.map((name) => {
            const match = lookupLinks(links, name)
            return (
              <li key={`${gig.id}-${name}`}>
                {match ? (
                  <SpotifyLinks links={match} />
                ) : match === null ? (
                  <p className="text-sm text-muted-foreground">No exact Spotify name match for {name}.</p>
                ) : (
                  <p className="text-sm">{name}</p>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
