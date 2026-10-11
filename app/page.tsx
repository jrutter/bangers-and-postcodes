import Link from "next/link"
import { Suspense } from "react"

import { ForYou } from "@/components/for-you"
import { GigSection } from "@/components/gig-section"
import { LinkButton } from "@/components/link-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  areaPath,
  artists,
  catalogue,
  formatGeneratedAt,
  homePlaceCounts,
  homePostcodeCounts,
  homePrecision,
  playlistPath,
  postcodePath,
} from "@/lib/catalogue"
import { TAGLINE } from "@/lib/format"
import { venuePath, venues } from "@/lib/venues"

export default function HomePage() {
  const postcodeCounts = homePostcodeCounts()
  const placeCounts = homePlaceCounts()
  const precision = homePrecision()
  const districts = placeCounts.filter((place) => place.precision === "place")
  const boroughs = placeCounts.filter((place) => place.precision === "borough")

  return (
    <div className="space-y-14">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Southwest London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-6xl">Bangers & Postcodes</h1>
        <p className="text-lg leading-8 text-foreground/90">{TAGLINE}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          {precision.withPlace} artists are tied to a postcode district. {precision.boroughOnly} more are linked only at
          borough level, which is wider than these postcodes, so they stay off the postcode totals. Catalogue from{" "}
          {formatGeneratedAt(catalogue.generated_at)}, {catalogue.artist_count} artists.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={playlistPath()}>Make an SW London playlist</LinkButton>
          <LinkButton href="/gigs" variant="outline">
            Gigs this week
          </LinkButton>
          <LinkButton href="/map" variant="outline">
            Map
          </LinkButton>
        </div>
      </section>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking your Spotify taste…</p>}>
        <ForYou artists={artists()} selection={{ kind: "southwest" }} returnTo="/" />
      </Suspense>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking listings for this week…</p>}>
        <GigSection
          heading="This week in southwest London"
          intro="Artists with a gig in the next 7 days around these postcodes, including people who are touring through rather than from here."
          selection={{ kind: "southwest" }}
          span="week"
          playlistScope={{ kind: "week", focus: "all" }}
          playlistLabel="This week's gigs playlist"
          emptyLabel="No gigs were listed for the next 7 days."
          limit={6}
        />
      </Suspense>

      <section id="postcodes" className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">Postcodes</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Counts use district-level links only. Richmond spans TW9 and TW10, so those artists appear under both.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {postcodeCounts.map((row) => (
            <li key={row.postcode}>
              <Link href={postcodePath(row.postcode)} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted/60">
                  <CardHeader>
                    <CardTitle>
                      <span className="font-heading text-2xl font-semibold">{row.postcode}</span>
                    </CardTitle>
                    <CardDescription>
                      {row.artistCount} {row.artistCount === 1 ? "artist" : "artists"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="areas" className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">Areas</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            From Barnes to Wimbledon. An empty count means the committed catalogue has no artist linked to that
            district.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {districts.map((place) => (
            <li key={place.placeId}>
              <Link href={areaPath(place.placeId)} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted/60">
                  <CardHeader>
                    <CardTitle>{place.placeName}</CardTitle>
                    <CardDescription>
                      {place.postcodes.join(", ") || "No postcode"} · {place.artistCount}{" "}
                      {place.artistCount === 1 ? "artist" : "artists"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">{place.note}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="venues" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Venues</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Rooms in southwest London that actually put music on. Pryzm Kingston closed in July 2025, so it is not
              listed. Upcoming shows on each page come from the gig feeds, not from a sample list.
            </p>
          </div>
          <Link href="/venues" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            All venues
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {venues().map((venue) => (
            <li key={venue.id}>
              <Link href={venuePath(venue.id)} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted/60">
                  <CardHeader>
                    <CardTitle>{venue.name}</CardTitle>
                    <CardDescription>
                      {venue.postcode}
                      {venue.postcodes.length > 0 ? ` · ${venue.postcodes.join(", ")}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">{venue.note}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">Borough-level links</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Wandsworth, Kingston upon Thames, and Richmond upon Thames are whole boroughs. People tagged there might be
            from Battersea, Surbiton, or Twickenham, so they are not forced into SW18, KT1, or TW9.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {boroughs.map((place) => (
            <li key={place.placeId}>
              <Link href={areaPath(place.placeId)} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted/60">
                  <CardHeader>
                    <CardTitle>{place.placeName}</CardTitle>
                    <CardDescription>
                      {place.artistCount} {place.artistCount === 1 ? "artist" : "artists"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
