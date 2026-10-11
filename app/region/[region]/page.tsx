import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"

import { Breadcrumbs } from "@/components/breadcrumbs"
import { EraFilter } from "@/components/era-filter"
import { LinkButton } from "@/components/link-button"
import { LondonMap } from "@/components/london-map"
import { artists, artistsInPostcode, playlistPath, postcodePath } from "@/lib/catalogue"
import { londonPostcodes } from "@/lib/districts"
import { filterArtists, parseEra, showcaseArtists, withEra } from "@/lib/era"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { formatGigWhen, selectGigs } from "@/lib/gigs/select"
import { outwardCode } from "@/lib/geo"
import { artistsInRegion, districtInRegion, regionById, regionPath, regions } from "@/lib/regions"
import { filterVenues, venuePath, venueTypeLabel, venues } from "@/lib/venues"

export const maxDuration = 60

export function generateStaticParams() {
  return regions().map((region) => ({ region: region.id }))
}

export async function generateMetadata(props: PageProps<"/region/[region]">): Promise<Metadata> {
  const { region: regionId } = await props.params
  const region = regionById(regionId)
  return {
    title: region?.name ?? "Region",
    description: region ? `${region.intro} ${region.knownFor}` : "A London region.",
  }
}

export default async function RegionPage(props: PageProps<"/region/[region]">) {
  const { region: regionId } = await props.params
  const region = regionById(regionId)
  if (!region) notFound()
  const query = await props.searchParams
  const era = parseEra(firstQuery(query.era))
  const localArtists = filterArtists(artistsInRegion(artists(), region.id), era)
  const shown = showcaseArtists(localArtists, 8)
  const districts = londonPostcodes().filter((code) => districtInRegion(code, region.id))
  const rooms = filterVenues(venues(), { area: region.id }).slice(0, 12)
  return (
    <article className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <Breadcrumbs items={[{ href: "/", label: "London" }, { label: region.name }]} />
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">
          {region.areas.map((area) => area.code).join(" · ")}
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{region.name}</h1>
        <p className="text-base leading-7 text-muted-foreground">{region.intro}</p>
        <p className="text-base leading-7 text-muted-foreground">
          <span className="font-medium text-foreground">Known for. </span>
          {region.knownFor}
        </p>
        <div className="space-y-3">
          {region.areas.map((area) => (
            <p key={area.code} className="text-sm leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">
                {area.code} · {area.name}.{" "}
              </span>
              {area.knownFor} Getting there: {area.gettingThere}
            </p>
          ))}
        </div>
        <EraFilter path={regionPath(region.id)} era={era} />
        <p className="text-sm text-muted-foreground">
          {localArtists.length} artists tied to these postcodes. Borough-only credits stay on the borough pages.
        </p>
        <LinkButton href={withEra(playlistPath({ kind: "region", regionId: region.id }), era)}>
          Make this region's playlist
        </LinkButton>
      </header>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the map…</p>}>
        <LondonMap era={era} regionId={region.id} returnTo={withEra(regionPath(region.id), era)} />
      </Suspense>

      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Districts</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {districts.map((code) => {
            const count = filterArtists(artistsInPostcode(code), era).length
            return (
              <li key={code}>
                <Link href={postcodePath(code)} className="block rounded-lg bg-card px-3 py-2 ring-1 ring-border">
                  <span className="font-heading text-lg font-semibold">{code}</span>
                  <span className="block text-sm text-muted-foreground">
                    {count} {count === 1 ? "artist" : "artists"}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Artists, old and new</h2>
        <ul className="space-y-1 text-sm">
          {shown.map((artist) => (
            <li key={artist.mbid ?? artist.name}>
              <span className="font-medium">{artist.name}</span>
              {artist.life_span?.begin ? <span className="text-muted-foreground"> · from {artist.life_span.begin.slice(0, 4)}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Venues</h2>
        <ul className="space-y-1 text-sm">
          {rooms.map((venue) => (
            <li key={venue.id}>
              <Link href={venuePath(venue.id)} className="font-medium underline decoration-border underline-offset-4">
                {venue.name}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                · {venueTypeLabel(venue.type)}
                {venue.postcodeDistrict ? ` · ${venue.postcodeDistrict}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/venues?area=${region.id}`} className="text-sm font-medium underline decoration-border underline-offset-4">
          All venues in {region.name}
        </Link>
      </section>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking this week's gigs…</p>}>
        <RegionGigs regionId={region.id} />
      </Suspense>
    </article>
  )
}

async function RegionGigs({ regionId }: { regionId: string }) {
  await connection()
  const region = regionById(regionId)
  if (!region) return null
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const configured = feed.providers.some((provider) => provider.configured)
  const week = selectGigs(feed.gigs, { kind: "southwest" }, "week", new Date()).filter((gig) => {
    const code = outwardCode(gig.postcode)
    return Boolean(code && districtInRegion(code, regionId))
  })
  if (!configured || week.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Gigs this week</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {configured
            ? `No listings in ${region.name} turned up in this week's search. The live search is an 8 mile sweep of southwest London, so a room here still has its own page when you want the address.`
            : "No gig provider is configured, so this week's bills are empty. Venue pages are still here."}
        </p>
      </section>
    )
  }
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">Gigs this week</h2>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Shows in the next 7 days whose venue postcode is in {region.name}. The search itself stays centred on southwest London.
      </p>
      <ul className="space-y-2 text-sm">
        {week.slice(0, 8).map((gig) => (
          <li key={gig.id}>
            <p className="font-medium">{gig.title}</p>
            <p className="text-muted-foreground">
              {formatGigWhen(gig)} · {gig.venueName}
              {gig.postcode ? ` · ${gig.postcode}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <Link href="/gigs" className="text-sm font-medium underline decoration-border underline-offset-4">
        All southwest listings
      </Link>
    </section>
  )
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
