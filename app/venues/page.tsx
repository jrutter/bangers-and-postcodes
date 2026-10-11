import type { Metadata } from "next"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { areaPath, knownPostcode, placeById, postcodePath } from "@/lib/catalogue"
import { venuePath, venues } from "@/lib/venues"

export const metadata: Metadata = {
  title: "Venues",
  description: "Music venues in southwest London, with upcoming gigs when a listings key is set.",
}

export default function VenuesPage() {
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
      <ul className="grid gap-3">
        {venues().map((venue) => (
          <li key={venue.id}>
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
          </li>
        ))}
      </ul>
    </div>
  )
}
