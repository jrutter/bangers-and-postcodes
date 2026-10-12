import Link from "next/link"
import { Suspense } from "react"
import { cacheLife, cacheTag } from "next/cache"

import { EnglishFavourites } from "@/components/english-favourites"
import { ForYou } from "@/components/for-you"
import { GigSection } from "@/components/gig-section"
import { NewsletterSignup } from "@/components/newsletter-signup"
import { LinkButton } from "@/components/link-button"
import { RegionPicker } from "@/components/region-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GIG_REVALIDATE_SECONDS } from "@/lib/gigs/constants"
import { readHome } from "@/lib/page-data"
import { areaPath, formatGeneratedAt, playlistPath, venuePath } from "@/lib/paths"
import { TAGLINE } from "@/lib/format"

export const maxDuration = 120

export default function HomePage() {
  return (
    <div className="space-y-14">
      <HomeCatalogue />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking your Spotify taste…</p>}>
        <ForYou selection={{ kind: "london" }} returnTo="/" />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking which of your artists are from England…</p>}>
        <EnglishFavourites variant="teaser" returnTo="/" />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the weekly email signup…</p>}>
        <NewsletterSignup placement="panel" defaultAreas={[]} />
      </Suspense>
    </div>
  )
}

async function HomeCatalogue() {
  "use cache"
  cacheLife({ stale: 60 * 60, revalidate: GIG_REVALIDATE_SECONDS, expire: 60 * 60 * 24 })
  cacheTag("gigs", "pages")
  const home = readHome()
  const precision = home.precision
  const counts = Object.fromEntries(
    home.regions.map((region) => [
      region.id,
      { districts: region.districts, artists: region.artists, venues: region.venues },
    ]),
  )

  return (
    <>
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-medium tracking-[0.18em] text-info uppercase">London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-6xl">Bangers & Postcodes</h1>
        <p className="text-lg leading-8 text-foreground/90">{TAGLINE}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          Start with a region, then a postcode. Each page says what that part of town is known for, how to get there,
          and which venues you can visit. {precision.withPlace} artists are tied to a district. {precision.boroughOnly}{" "}
          more are linked only at borough level, so they stay off the postcode totals. Catalogue from{" "}
          {formatGeneratedAt(home.generated_at)}, {home.artist_count} artists. The map is a separate page so this one
          stays a list of regions.
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

      <GigSection
        heading="Gigs you can catch this week"
        intro="Live and club listings across Greater London for the next 7 days. Each region and area page shows the bills in that part of town."
        selection={{ kind: "london" }}
        span="week"
        playlistScope={{ kind: "week", focus: "all" }}
        playlistLabel="This week's gigs playlist"
        emptyLabel="No gigs were listed for the next 7 days."
        limit={6}
      />

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
          {home.curatedVenues.map((venue) => (
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
          {home.boroughs.map((place) => (
            <li key={place.id}>
              <Link href={areaPath(place.id)} className="block h-full">
                <Card className="h-full transition-colors hover:bg-muted">
                  <CardHeader>
                    <CardTitle>{place.name}</CardTitle>
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
    </>
  )
}
