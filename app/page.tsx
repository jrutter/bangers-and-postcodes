import Link from "next/link"
import { Suspense } from "react"

import { ForYou } from "@/components/for-you"
import { GigSection } from "@/components/gig-section"
import { LondonMap } from "@/components/london-map"
import { NewsletterSignup } from "@/components/newsletter-signup"
import { LinkButton } from "@/components/link-button"
import { RegionPicker } from "@/components/region-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { areaPath, artists, catalogue, formatGeneratedAt, homePlaceCounts, homePrecision, playlistPath } from "@/lib/catalogue"
import { londonPostcodes } from "@/lib/districts"
import { TAGLINE } from "@/lib/format"
import { artistsInRegion, districtInRegion, regions } from "@/lib/regions"
import { curatedVenues, filterVenues, venuePath, venues } from "@/lib/venues"

export default function HomePage() {
  const precision = homePrecision()
  const boroughs = homePlaceCounts().filter((place) => place.precision === "borough")
  const counts = Object.fromEntries(
    regions().map((region) => [
      region.id,
      {
        districts: londonPostcodes().filter((code) => districtInRegion(code, region.id)).length,
        artists: artistsInRegion(artists(), region.id).length,
        venues: filterVenues(venues(), { area: region.id }).length,
      },
    ]),
  )

  return (
    <div className="space-y-14">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-medium tracking-[0.18em] text-info uppercase">London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-6xl">Bangers & Postcodes</h1>
        <p className="text-lg leading-8 text-foreground/90">{TAGLINE}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          Start with a region, then a postcode. Each page says what that part of town is known for, how to get there,
          and which venues you can visit. {precision.withPlace} artists are tied to a district. {precision.boroughOnly}{" "}
          more are linked only at borough level, so they stay off the postcode totals. Catalogue from{" "}
          {formatGeneratedAt(catalogue.generated_at)}, {catalogue.artist_count} artists.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/map">Open the map</LinkButton>
          <LinkButton href="/gigs" variant="outline">
            Gigs this week
          </LinkButton>
          <LinkButton href={playlistPath()} variant="outline">
            Make a playlist
          </LinkButton>
        </div>
      </section>

      <div id="regions">
        <RegionPicker counts={counts} />
      </div>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the map…</p>}>
        <LondonMap returnTo="/" />
      </Suspense>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking your Spotify taste…</p>}>
        <ForYou artists={artists()} selection={{ kind: "southwest" }} returnTo="/" />
      </Suspense>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking listings for this week…</p>}>
        <GigSection
          heading="Gigs you can catch this week"
          intro="The live search covers southwest London, about 8 miles around Putney, Richmond, Kingston, and Wimbledon, so these are bills a visitor can actually get to. Other regions list their venues even when the search has no date yet."
          selection={{ kind: "southwest" }}
          span="week"
          playlistScope={{ kind: "week", focus: "all" }}
          playlistLabel="This week's gigs playlist"
          emptyLabel="No gigs were listed for the next 7 days."
          limit={6}
        />
      </Suspense>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the weekly email signup…</p>}>
        <NewsletterSignup placement="panel" defaultAreas={[]} />
      </Suspense>

      <section id="venues" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Southwest rooms, checked by hand</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              These ten rooms keep their gig pages. The full London list, grouped by borough and postcode, is on the
              venues page.
            </p>
          </div>
          <Link href="/venues" className="text-sm font-medium text-info underline-offset-4 hover:text-link-hover hover:underline">
            All venues
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {curatedVenues().map((venue) => (
            <li key={venue.id}>
              <Link href={venuePath(venue.id)} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted">
                  <CardHeader>
                    <CardTitle>{venue.name}</CardTitle>
                    <CardDescription>{venue.postcode}</CardDescription>
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
          <h2 className="font-heading text-3xl font-semibold tracking-tight">Borough pages</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            All 32 London boroughs and the City of London. A borough credit is wider than a postcode, so those artists
            stay on the borough page.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {boroughs.map((place) => (
            <li key={place.placeId}>
              <Link href={areaPath(place.placeId)} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted">
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
