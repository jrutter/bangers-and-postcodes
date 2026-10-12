import type { Metadata } from "next"
import Link from "next/link"
import { cacheLife, cacheTag } from "next/cache"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { Breadcrumbs } from "@/components/breadcrumbs"
import { EraFilter } from "@/components/era-filter"
import { GigSection } from "@/components/gig-section"
import { LinkButton } from "@/components/link-button"
import { filterArtists, parseEra, showcaseArtists, withEra } from "@/lib/era"
import { GIG_REVALIDATE_SECONDS } from "@/lib/gigs/constants"
import { cachedClock, loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { listingVenues, selectGigs } from "@/lib/gigs/select"
import { readManifest, readRegion, type RegionPageData } from "@/lib/page-data"
import { artistPath, playlistPath, postcodePath, venuePath, venueTypeLabel } from "@/lib/paths"
import { regionById, regionPath } from "@/lib/regions"
import type { ArtistRecord } from "@/lib/types"

export const maxDuration = 120

export async function generateStaticParams() {
  return readManifest().regions.map((region) => ({ region }))
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
  const slice = readRegion(regionId)
  if (!region || !slice) notFound()
  const now = new Date(await cachedClock())
  return (
    <article className="space-y-10">
      <RegionIntro regionId={region.id} />
      <Suspense fallback={<RegionLists slice={slice} era={null} now={now} />}>
        <RegionEra regionId={region.id} slice={slice} now={now} searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking this week's gigs…</p>}>
        <RegionGigs regionId={region.id} />
      </Suspense>
    </article>
  )
}

async function RegionIntro({ regionId }: { regionId: string }) {
  "use cache"
  cacheLife({ stale: 60 * 60 * 24, revalidate: 60 * 60 * 24, expire: 60 * 60 * 24 * 7 })
  cacheTag("artists")
  const region = regionById(regionId)
  if (!region) return null
  return (
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
      <LinkButton href={`/map?region=${region.id}`}>Open this region on the map</LinkButton>
    </header>
  )
}

async function RegionEra({
  regionId,
  slice,
  now,
  searchParams,
}: {
  regionId: string
  slice: RegionPageData
  now: Date
  searchParams: PageProps<"/region/[region]">["searchParams"]
}) {
  const query = await searchParams
  const era = parseEra(firstQuery(query.era))
  return <RegionLists slice={slice} era={era} regionId={regionId} now={now} />
}

function RegionLists({
  slice,
  era,
  now,
  regionId,
}: {
  slice: RegionPageData
  era: ReturnType<typeof parseEra>
  now: Date
  regionId?: string
}) {
  const id = regionId ?? slice.id
  const records = slice.artists.map(asArtist)
  const localArtists = filterArtists(records, era, now)
  const shown = showcaseArtists(localArtists, 8, now)
  const bySlug = new Map(slice.artists.map((artist) => [artist.slug, artist]))
  return (
    <>
      <div className="max-w-3xl space-y-4">
        <EraFilter path={regionPath(id)} era={era} />
        <p className="text-sm text-muted-foreground">
          {localArtists.length} artists tied to these postcodes. Borough-only credits stay on the borough pages.
        </p>
        <LinkButton href={withEra(playlistPath({ kind: "region", regionId: id }), era)}>
          Make this region's playlist
        </LinkButton>
      </div>
      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Districts</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {slice.districts.map((district) => {
            const count = era
              ? slice.artists.filter((artist) => artist.postcodes.includes(district.code) && matches(artist, era, now)).length
              : district.artistCount
            return (
              <li key={district.code}>
                <Link href={postcodePath(district.code)} className="block rounded-lg bg-card px-3 py-2 ring-1 ring-border">
                  <span className="font-heading text-lg font-semibold">{district.code}</span>
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
          {shown.map((artist) => {
            const row = bySlug.get(artist.mbid ?? "")
            return (
              <li key={artist.mbid ?? artist.name}>
                {row ? (
                  <Link href={artistPath(row.slug)} className="font-medium underline decoration-border underline-offset-4">
                    {artist.name}
                  </Link>
                ) : (
                  <span className="font-medium">{artist.name}</span>
                )}
                {artist.life_span?.begin ? (
                  <span className="text-muted-foreground"> · from {artist.life_span.begin.slice(0, 4)}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Venues</h2>
        <ul className="space-y-1 text-sm">
          {slice.venues.map((venue) => (
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
        <Link href={`/venues?area=${id}`} className="text-sm font-medium underline decoration-border underline-offset-4">
          All venues in {regionById(id)?.name ?? "this region"}
        </Link>
      </section>
    </>
  )
}

async function RegionGigs({ regionId }: { regionId: string }) {
  "use cache"
  cacheLife({ stale: 60 * 60, revalidate: GIG_REVALIDATE_SECONDS, expire: 60 * 60 * 24 })
  cacheTag("gigs")
  const region = regionById(regionId)
  if (!region) return null
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const week = selectGigs(feed.gigs, { kind: "region", regionId }, "week", new Date(await cachedClock()))
  const extraRooms = listingVenues(week)
  return (
    <div className="space-y-8">
      <GigSection
        feed={feed}
        heading="What's on this week"
        intro={`Shows in the next 7 days whose venue sits in ${region.name}.`}
        selection={{ kind: "region", regionId }}
        span="week"
        emptyLabel={`No listings in ${region.name} turned up this week.`}
        limit={8}
      />
      {extraRooms.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">Rooms from this week's listings</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            These venues are on a bill in {region.name} and did not match the venue guide, so they stay with the gig
            instead of being added to the curated list.
          </p>
          <ul className="space-y-1 text-sm">
            {extraRooms.map((room) => (
              <li key={room.id}>
                <span className="font-medium">{room.name}</span>
                {room.district ? <span className="text-muted-foreground"> · {room.district}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link href="/gigs" className="text-sm font-medium underline decoration-border underline-offset-4">
        All London listings
      </Link>
    </div>
  )
}

function asArtist(row: RegionPageData["artists"][number]): ArtistRecord {
  return {
    mbid: row.slug,
    wikidata_qid: null,
    name: row.name,
    sort_name: row.name,
    type: null,
    disambiguation: null,
    country: null,
    life_span: row.life_span,
    tags: [],
    locality: [],
  }
}

function matches(row: RegionPageData["artists"][number], era: NonNullable<ReturnType<typeof parseEra>>, now: Date): boolean {
  return filterArtists([asArtist(row)], era, now).length === 1
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
