import Link from "next/link"
import { connection } from "next/server"

import { ForYouShown } from "@/components/for-you-shown"
import { GigList } from "@/components/gig-list"
import { TastePrompt } from "@/components/taste-prompt"
import { areaPath, artists as catalogueArtists, postcodePath } from "@/lib/catalogue"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { selectGigs } from "@/lib/gigs/select"
import { linksForGigArtists } from "@/lib/gigs/spotify"
import type { GigSelection, TaggedGig } from "@/lib/gigs/types"
import { indexTags, matchCandidate, matchGig, orderByTaste } from "@/lib/taste"
import { loadTasteSession } from "@/lib/taste-session"
import type { ArtistRecord } from "@/lib/types"

export async function ForYou({
  artists,
  selection,
  returnTo,
  limitArtists = 6,
  limitGigs = 4,
}: {
  artists: ArtistRecord[]
  selection: GigSelection
  returnTo: string
  limitArtists?: number
  limitGigs?: number
}) {
  await connection()
  const taste = await loadTasteSession(returnTo)
  if (taste.status === "anonymous") return <ForYouShell view={{ status: "anonymous", artistCount: 0, gigCount: 0 }}><TastePrompt returnTo={returnTo} mode="anonymous" /></ForYouShell>
  if (taste.status === "needs-scope") return <ForYouShell view={{ status: "needs-scope", artistCount: 0, gigCount: 0 }}><TastePrompt returnTo={returnTo} mode="needs-scope" /></ForYouShell>
  if (taste.status === "error") {
    return (
      <ForYouShell view={{ status: "error", artistCount: 0, gigCount: 0 }}>
        <TastePrompt returnTo={returnTo} mode="error" />
      </ForYouShell>
    )
  }
  if (taste.status === "empty") {
    return (
      <ForYouShell view={{ status: "empty", artistCount: 0, gigCount: 0 }}>
        <p className="text-sm leading-6 text-muted-foreground">
          Spotify did not return top artists, tracks, or follows for this account, so nothing is ranked yet.
        </p>
      </ForYouShell>
    )
  }

  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const gigs = selectGigs(feed.gigs, selection, "upcoming", new Date())
  const tags = indexTags(catalogueArtists())
  const rankedArtists = orderByTaste(artists, (artist) => matchCandidate(taste.profile, artist))
    .filter((row) => row.taste)
    .slice(0, limitArtists)
  const rankedGigs = orderByTaste(gigs, (gig) => matchGig(taste.profile, gig, tags))
    .filter((row): row is { item: TaggedGig; taste: NonNullable<typeof row.taste> } => row.taste !== null)
    .slice(0, limitGigs)
  const reasons = Object.fromEntries(rankedGigs.map((row) => [row.item.id, row.taste.reason]))
  const spotify = rankedGigs.length > 0 ? await linksForGigArtists(rankedGigs.map((row) => row.item), []) : { links: {}, status: "ready" as const }

  return (
    <ForYouShell view={{ status: "ready", artistCount: rankedArtists.length, gigCount: rankedGigs.length }}>
      <p className="text-sm leading-6 text-muted-foreground">
        From your Spotify top artists and tracks over the last month and the last six months, plus artists you follow.
        Genres and related artists are used when Spotify sends them.
      </p>
      {rankedArtists.length === 0 && rankedGigs.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          None of these local artists or upcoming gigs line up with that taste yet.
        </p>
      ) : null}
      {rankedArtists.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium tracking-[0.14em] text-primary uppercase">Artists</h3>
          <ol className="grid gap-2 sm:grid-cols-2">
            {rankedArtists.map((row, index) => {
              const href = artistHref(row.item)
              return (
                <li key={`${row.item.mbid ?? row.item.name}-${index}`} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                  <p className="font-medium">
                    <span className="mr-2 text-muted-foreground">{index + 1}</span>
                    {href ? (
                      <Link href={href} className="underline decoration-border underline-offset-4 hover:text-primary">
                        {row.item.name}
                      </Link>
                    ) : (
                      row.item.name
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{row.taste?.reason}</p>
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}
      {rankedGigs.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium tracking-[0.14em] text-primary uppercase">Gigs</h3>
          <GigList gigs={rankedGigs.map((row) => row.item)} links={spotify.links} reasons={reasons} />
        </div>
      ) : null}
    </ForYouShell>
  )
}

function ForYouShell({
  children,
  view,
}: {
  children: React.ReactNode
  view: { status: string; artistCount: number; gigCount: number }
}) {
  return (
    <section id="for-you" className="space-y-4">
      <h2 className="font-heading text-3xl font-semibold tracking-tight">For you</h2>
      <ForYouShown status={view.status} artistCount={view.artistCount} gigCount={view.gigCount} />
      {children}
    </section>
  )
}

function artistHref(artist: ArtistRecord): string | null {
  const place = artist.locality.find((locality) => locality.precision === "place" && locality.postcodes.length > 0)
  if (place?.postcodes[0]) return postcodePath(place.postcodes[0])
  const any = artist.locality[0]
  return any ? areaPath(any.place_id) : null
}
