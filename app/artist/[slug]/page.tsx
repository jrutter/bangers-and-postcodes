import type { Metadata } from "next"
import Link from "next/link"
import { cacheLife, cacheTag } from "next/cache"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { Breadcrumbs } from "@/components/breadcrumbs"
import { GigList } from "@/components/gig-list"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { gigsForArtist, selectGigs } from "@/lib/gigs/select"
import { linksForGigArtists } from "@/lib/gigs/spotify"
import { readArtist, readArtistIndex, type ArtistPageData } from "@/lib/page-data"
import { areaPath, postcodePath } from "@/lib/paths"
import { eraText } from "@/lib/era"
import { matchArtistsCached } from "@/lib/spotify-match"
import { spotifyClient } from "@/lib/spotify"

export const maxDuration = 120

export async function generateStaticParams() {
  return readArtistIndex().map((artist) => ({ slug: artist.slug }))
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params
  const page = readArtist(slug)
  return {
    title: page?.artist.name ?? "Artist",
    description: page ? `${page.artist.name} in the London catalogue.` : "A catalogue artist.",
  }
}

export default async function ArtistPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const page = readArtist(slug)
  if (!page) notFound()
  return (
    <article className="space-y-10">
      <ArtistArticle slug={slug} />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking listings…</p>}>
        <ArtistGigs name={page.artist.name} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking Spotify…</p>}>
        <ArtistSpotify page={page} />
      </Suspense>
    </article>
  )
}

async function ArtistArticle({ slug }: { slug: string }) {
  "use cache"
  cacheLife({ stale: 60 * 60 * 24, revalidate: 60 * 60 * 24, expire: 60 * 60 * 24 * 7 })
  cacheTag("artists")
  const page = readArtist(slug)
  if (!page) return null
  const artist = page.artist
  const place = artist.locality.find((item) => item.postcodes.length > 0) ?? artist.locality[0]
  return (
    <header className="max-w-3xl space-y-4">
      <Breadcrumbs
        items={[
          { href: "/", label: "London" },
          ...(place ? [{ href: areaPath(place.place_id), label: place.place_name }] : []),
          { label: artist.name },
        ]}
      />
      <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">{artist.type ?? "Artist"}</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{artist.name}</h1>
      {artist.disambiguation ? <p className="text-base leading-7 text-muted-foreground">{artist.disambiguation}</p> : null}
      {eraText(artist) ? <p className="text-sm text-muted-foreground">{eraText(artist)}</p> : null}
      {artist.tags.length > 0 ? (
        <p className="text-sm text-muted-foreground">{artist.tags.slice(0, 8).join(" · ")}</p>
      ) : null}
      <div className="flex flex-wrap gap-3 text-sm">
        {artist.locality.map((item) => (
          <Link key={item.place_id} href={areaPath(item.place_id)} className="underline decoration-border underline-offset-4">
            {item.place_name}
          </Link>
        ))}
        {artist.locality.flatMap((item) =>
          item.postcodes.map((code) => (
            <Link key={code} href={postcodePath(code)} className="underline decoration-border underline-offset-4">
              {code}
            </Link>
          )),
        )}
        {artist.mbid ? (
          <a className="underline decoration-border underline-offset-4" href={`https://musicbrainz.org/artist/${artist.mbid}`}>
            MusicBrainz
          </a>
        ) : null}
      </div>
    </header>
  )
}

async function ArtistGigs({ name }: { name: string }) {
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const upcoming = gigsForArtist(name, selectGigs(feed.gigs, { kind: "london" }, "upcoming", new Date()))
  if (upcoming.length === 0) return null
  const spotify = await linksForGigArtists(upcoming, [])
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">On a bill</h2>
      <GigList gigs={upcoming} links={spotify.links} />
    </section>
  )
}

async function ArtistSpotify({ page }: { page: ArtistPageData }) {
  await connection()
  const client = spotifyClient()
  if (!client.configured()) {
    return <p className="text-sm text-muted-foreground">Spotify is not configured, so followers and a track stay blank.</p>
  }
  try {
    const [matched] = await matchArtistsCached([page.artist])
    if (!matched?.spotify) return <p className="text-sm text-muted-foreground">No exact Spotify name match.</p>
    return (
      <p className="text-sm text-muted-foreground">
        {matched.spotify.url ? (
          <a className="spotify-link" href={matched.spotify.url}>
            {matched.spotify.name || page.artist.name} on Spotify
          </a>
        ) : (
          <span>{page.artist.name} on Spotify</span>
        )}
        {typeof matched.spotify.followers === "number" ? ` · ${matched.spotify.followers.toLocaleString("en-GB")} followers` : ""}
      </p>
    )
  } catch {
    return <p className="text-sm text-muted-foreground">Spotify lookup failed for this artist. The local record is unchanged.</p>
  }
}
