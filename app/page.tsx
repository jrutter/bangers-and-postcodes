import Link from "next/link"
import { Suspense } from "react"

import { ForYou } from "@/components/for-you"
import { GigSection } from "@/components/gig-section"
import { NewsletterSignup } from "@/components/newsletter-signup"
import { LinkButton } from "@/components/link-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  areaPath,
  artists,
  catalogue,
  formatGeneratedAt,
  artistsInPostcode,
  homePlaceCounts,
  homePrecision,
  postcodes,
  playlistPath,
  postcodePath,
} from "@/lib/catalogue"
import { postcodeArea } from "@/lib/districts"
import { TAGLINE } from "@/lib/format"
import { venuePath, curatedVenues } from "@/lib/venues"

export default function HomePage() {
  const postcodeCounts = postcodes().map((postcode) => ({
    postcode,
    artistCount: artistsInPostcode(postcode).length,
  }))
  const placeCounts = homePlaceCounts()
  const precision = homePrecision()
  const districts = placeCounts.filter((place) => place.precision === "place")
  const boroughs = placeCounts.filter((place) => place.precision === "borough")

  return (
    <div className="space-y-14">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-medium tracking-[0.18em] text-info uppercase">London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-6xl">Bangers & Postcodes</h1>
        <p className="text-lg leading-8 text-foreground/90">{TAGLINE}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          {precision.withPlace} artists are tied to a postcode district. {precision.boroughOnly} more are linked only at
          borough level, which is wider than these postcodes, so they stay off the postcode totals. Catalogue from{" "}
          {formatGeneratedAt(catalogue.generated_at)}, {catalogue.artist_count} artists.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={playlistPath()}>Make a London playlist</LinkButton>
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

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the weekly email signup…</p>}>
        <NewsletterSignup placement="panel" defaultAreas={[]} />
      </Suspense>

      <section id="postcodes" className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">Postcodes</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Every Greater London district. Counts use place-level links only, so a borough-wide credit does not land in
            one postcode. Open the map to see the shapes.
          </p>
        </div>
        <div className="space-y-4">
          {groupPostcodes(postcodeCounts).map((group) => (
            <details key={group.area} open={group.area === "SW"} className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium">
                {group.area} · {group.rows.length} districts
              </summary>
              <ul className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3 lg:grid-cols-5">
                {group.rows.map((row) => (
                  <li key={row.postcode}>
                    <Link href={postcodePath(row.postcode)} className="block h-full">
                      <Card className="h-full transition-colors hover:bg-muted">
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
            </details>
          ))}
        </div>
      </section>

      <section id="areas" className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">Areas</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Neighbourhoods linked from MusicBrainz or Wikidata. Each one keeps the source of the claim. Postcode pages
            are the district totals.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {districts.map((place) => (
            <li key={place.placeId}>
              <Link href={areaPath(place.placeId)} className="text-sm underline decoration-border underline-offset-4">
                {place.placeName}
              </Link>{" "}
              <span className="text-sm text-muted-foreground">
                {place.postcodes.join(", ") || "no postcode"} · {place.artistCount}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="venues" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Venues</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Rooms in southwest London that were checked by hand. The full London list, grouped by borough and postcode,
            is on the venues page. Pryzm Kingston closed in July 2025, so it is not listed. Upcoming shows come from the
            gig feeds, not a sample list.
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
            All 32 London boroughs and the City of London. People tagged only at borough level might live in any district
            inside it, so they are not forced into one postcode.
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

function groupPostcodes(rows: { postcode: string; artistCount: number }[]) {
  const groups = new Map<string, { postcode: string; artistCount: number }[]>()
  for (const row of rows) {
    const area = postcodeArea(row.postcode)
    const list = groups.get(area) ?? []
    list.push(row)
    groups.set(area, list)
  }
  return [...groups.entries()].map(([area, groupRows]) => ({ area, rows: groupRows }))
}
