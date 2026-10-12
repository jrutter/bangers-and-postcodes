import { connection } from "next/server"

import { ArtistBoard, type BoardStatus } from "@/components/artist-board"
import { ForYou } from "@/components/for-you"
import { GigSection } from "@/components/gig-section"
import { areaPath, postcodePath, type Scope } from "@/lib/catalogue"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { selectGigs } from "@/lib/gigs/select"
import type { GigSelection } from "@/lib/gigs/types"
import { eraScope, pageArtists, showcaseArtists, withEra, type EraFilter } from "@/lib/era"
import { matchArtistsCached } from "@/lib/spotify-match"
import { spotifyClient } from "@/lib/spotify"
import type { ArtistRecord, MatchedArtist } from "@/lib/types"

export async function LocalityBody({
  artists,
  emptyNote,
  gigs,
  scope,
  era = null,
  page = 1,
  path,
}: {
  artists: ArtistRecord[]
  emptyNote?: string
  scope: Scope
  era?: EraFilter | null
  page?: number
  path: string
  gigs: {
    heading: string
    intro: string
    selection: GigSelection
    playlistScope: Scope
    playlistLabel: string
    emptyLabel: string
  }
}) {
  await connection()
  const client = spotifyClient()
  const paged = pageArtists(artists, page)
  const featured = era ? [] : showcaseArtists(artists, 6)
  const lookup = uniqueArtists([...featured, ...paged.items])
  let matched: MatchedArtist[] = lookup
  let status: BoardStatus = client.configured() ? "ready" : "unconfigured"
  let message: string | undefined
  if (client.configured() && lookup.length > 0) {
    try {
      matched = await matchArtistsCached(lookup)
    } catch (error) {
      status = "error"
      message = error instanceof Error ? error.message : "Spotify could not be reached."
      matched = lookup
    }
  }
  const byKey = new Map(matched.map((artist) => [artistKey(artist), artist]))
  const pageArtistsMatched = paged.items.map((artist) => byKey.get(artistKey(artist)) ?? artist)
  const showcase = featured.map((artist) => byKey.get(artistKey(artist)) ?? artist)
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const localGigs = selectGigs(feed.gigs, gigs.selection, "upcoming", new Date())

  return (
    <div className="space-y-10">
      <ForYou artists={artists} selection={gigs.selection} returnTo={returnToFor(scope)} />
      <ArtistBoard
        artists={pageArtistsMatched}
        status={status}
        message={message}
        emptyNote={emptyNote}
        gigs={localGigs}
        total={artists.length}
        showcase={showcase}
        pageNote={
          artists.length > 0
            ? `Showing ${(paged.page - 1) * paged.size + 1}–${(paged.page - 1) * paged.size + pageArtistsMatched.length} of ${artists.length}${era ? ` ${eraScope(era)}` : ""}. Spotify stats load for this page only.`
            : undefined
        }
      />
      {paged.pages > 1 ? (
        <p className="flex gap-3 text-sm">
          {paged.page > 1 ? (
            <a className="font-medium underline decoration-border underline-offset-4" href={pageHref(path, era, paged.page - 1)}>
              Previous
            </a>
          ) : null}
          <span className="text-muted-foreground">
            Page {paged.page} of {paged.pages}
          </span>
          {paged.page < paged.pages ? (
            <a className="font-medium underline decoration-border underline-offset-4" href={pageHref(path, era, paged.page + 1)}>
              Next
            </a>
          ) : null}
        </p>
      ) : null}
      <GigSection
        feed={feed}
        heading={gigs.heading}
        intro={gigs.intro}
        selection={gigs.selection}
        span="upcoming"
        playlistScope={gigs.playlistScope}
        playlistLabel={gigs.playlistLabel}
        emptyLabel={gigs.emptyLabel}
        knownArtists={status === "ready" ? matched : []}
        showSpotifyNotice={artists.length === 0 || status !== "unconfigured"}
      />
    </div>
  )
}

function pageHref(path: string, era: EraFilter | null, page: number): string {
  const href = withEra(path, era)
  if (page <= 1) return href
  return `${href}${href.includes("?") ? "&" : "?"}page=${page}`
}

function artistKey(artist: ArtistRecord): string {
  return artist.mbid || artist.wikidata_qid || artist.name
}

function uniqueArtists(artists: ArtistRecord[]): ArtistRecord[] {
  const seen = new Set<string>()
  const unique: ArtistRecord[] = []
  for (const artist of artists) {
    const key = artistKey(artist)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(artist)
  }
  return unique
}

function returnToFor(scope: Scope): string {
  if (scope.kind === "postcode") return postcodePath(scope.postcode)
  if (scope.kind === "area") return areaPath(scope.placeId)
  return "/"
}
