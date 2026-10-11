import { connection } from "next/server"

import { ArtistBoard, type BoardStatus } from "@/components/artist-board"
import { GigSection } from "@/components/gig-section"
import type { Scope } from "@/lib/catalogue"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { selectGigs } from "@/lib/gigs/select"
import type { GigSelection } from "@/lib/gigs/types"
import { spotifyClient } from "@/lib/spotify"
import type { ArtistRecord, MatchedArtist } from "@/lib/types"

export async function LocalityBody({
  artists,
  emptyNote,
  gigs,
}: {
  artists: ArtistRecord[]
  emptyNote?: string
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
  let matched: MatchedArtist[] = artists
  let status: BoardStatus = client.configured() ? "ready" : "unconfigured"
  let message: string | undefined
  if (client.configured() && artists.length > 0) {
    try {
      matched = await client.matchCatalogue(artists)
    } catch (error) {
      status = "error"
      message = error instanceof Error ? error.message : "Spotify could not be reached."
    }
  }
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const localGigs = selectGigs(feed.gigs, gigs.selection, "upcoming", new Date())

  return (
    <div className="space-y-10">
      <ArtistBoard artists={matched} status={status} message={message} emptyNote={emptyNote} gigs={localGigs} />
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
