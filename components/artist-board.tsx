import Image from "next/image"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { areaPath } from "@/lib/catalogue"
import { claimLabel, metricText, safePreviewUrl, safeSpotifyImage, spotifyTrackUrl } from "@/lib/format"
import { formatGigWhen, gigsForArtist } from "@/lib/gigs/select"
import type { TaggedGig } from "@/lib/gigs/types"
import { venuePath } from "@/lib/venues"
import { eraText } from "@/lib/era"
import { summarize } from "@/lib/stats"
import type { MatchedArtist } from "@/lib/types"

export type BoardStatus = "loading" | "ready" | "unconfigured" | "error"

export function ArtistBoard({
  artists,
  status,
  message,
  emptyNote,
  gigs = [],
  total,
  showcase = [],
  pageNote,
}: {
  artists: MatchedArtist[]
  status: BoardStatus
  message?: string
  emptyNote?: string
  gigs?: TaggedGig[]
  total?: number
  showcase?: MatchedArtist[]
  pageNote?: string
}) {
  if (artists.length === 0 && showcase.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No artists in the catalogue</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <p>
            {emptyNote ||
              "Nobody in the committed catalogue is tied to this place yet. Discovery only keeps artists an editor has linked, and some of these districts have no MusicBrainz area."}
          </p>
        </CardContent>
      </Card>
    )
  }

  const summary = summarize(artists)
  const spotifyReady = status === "ready"

  return (
    <div className="space-y-8">
      {status === "unconfigured" ? (
        <Notice>
          Spotify is not configured, so followers, popularity, and tracks stay blank. Set SPOTIFY_CLIENT_ID and
          SPOTIFY_CLIENT_SECRET, then reload. The artists below are still from the local catalogue.
        </Notice>
      ) : null}
      {status === "error" ? (
        <Notice>{message || "Spotify could not be reached. The local catalogue is still listed below."}</Notice>
      ) : null}
      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">Looking up Spotify matches…</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Artists from here" value={String(total ?? summary.artistCount)} />
        <Stat
          label="Spotify matches on this page"
          value={spotifyReady ? String(summary.spotifyMatched) : status === "loading" ? "…" : "n/a"}
        />
        <Stat
          label="With popularity"
          value={spotifyReady ? String(summary.withPopularity) : status === "loading" ? "…" : "n/a"}
        />
        <Stat
          label="With followers"
          value={spotifyReady ? String(summary.withFollowers) : status === "loading" ? "…" : "n/a"}
        />
      </dl>

      {pageNote ? <p className="text-sm text-muted-foreground">{pageNote}</p> : null}
      {showcase.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">Legends and artists active now</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {showcase.map((artist) => (
              <li key={`show-${artist.mbid ?? artist.name}`} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                <p className="font-medium">{artist.name}</p>
                <p className="text-sm text-muted-foreground">{eraText(artist) ?? "Dates not recorded"}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {spotifyReady && summary.top.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">Top artists</h2>
          <p className="text-sm text-muted-foreground">
            Ranked by Spotify popularity, then followers, when the API sends those fields. Missing numbers stay n/a.
          </p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {summary.top.map((artist, index) => (
              <li key={`${artist.mbid ?? artist.name}-${index}`} className="rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                <p className="font-medium">
                  <span className="mr-2 text-muted-foreground">{index + 1}</span>
                  {artist.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Popularity {metricText(artist.spotify?.popularity)} · Followers {metricText(artist.spotify?.followers)}
                  {artist.spotify?.representative_track?.name
                    ? ` · ${artist.spotify.representative_track.name}`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Local artists</h2>
        <ul className="grid gap-3">
          {artists.map((artist) => (
            <li key={`${artist.mbid ?? "wd"}-${artist.wikidata_qid ?? artist.name}`}>
              <ArtistCard
                artist={artist}
                gigs={gigs}
                showSpotify={spotifyReady || status === "error" || status === "unconfigured"}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ArtistCard({ artist, showSpotify, gigs }: { artist: MatchedArtist; showSpotify: boolean; gigs: TaggedGig[] }) {
  const image = safeSpotifyImage(artist.spotify?.image)
  const track = artist.spotify?.representative_track
  const trackUrl = spotifyTrackUrl(track?.uri)
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4">
        {image ? (
          <Image src={image} alt="" width={56} height={56} className="size-14 rounded-md object-cover" />
        ) : (
          <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted font-heading text-lg text-primary">
            {artist.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <CardTitle>
            <h3 className="font-heading text-lg font-semibold">{artist.name}</h3>
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {artist.type ? <Badge variant="secondary">{artist.type}</Badge> : null}
            {artist.locality.map((place) => (
              <Badge key={place.place_id} variant="outline" render={<Link href={areaPath(place.place_id)} />}>
                {place.place_name}
                {place.postcodes.length > 0 ? ` ${place.postcodes.join(" ")}` : ""}
              </Badge>
            ))}
          </div>
          {eraText(artist) ? <p className="text-sm text-muted-foreground">{eraText(artist)}</p> : null}
          {artist.disambiguation ? <p className="text-sm text-muted-foreground">{artist.disambiguation}</p> : null}
        </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {artist.locality.flatMap((place) =>
            place.claims.map((claim, index) => (
              <li key={`${place.place_id}-${claim.source}-${claim.field}-${index}`} className="rounded-full bg-muted px-2 py-1">
                {claimLabel(claim)}
                {place.precision === "borough" ? " · borough" : ""}
              </li>
            )),
          )}
        </ul>
        {artist.mbid ? (
          <p className="text-sm">
            <a className="underline decoration-border underline-offset-4 hover:text-link-hover" href={`https://musicbrainz.org/artist/${artist.mbid}`}>
              MusicBrainz
            </a>
          </p>
        ) : null}
        {showSpotify ? <SpotifyLine artist={artist} trackUrl={trackUrl} /> : null}
        <ArtistGigs artistName={artist.name} gigs={gigs} />
      </CardContent>
    </Card>
  )
}

function ArtistGigs({ artistName, gigs }: { artistName: string; gigs: TaggedGig[] }) {
  const upcoming = gigsForArtist(artistName, gigs)
  if (upcoming.length === 0) return null
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">Upcoming here</p>
      <ul className="space-y-1 text-muted-foreground">
        {upcoming.map((gig) => (
          <li key={gig.id}>
            <time dateTime={gig.startsAt ?? gig.date ?? undefined}>{formatGigWhen(gig)}</time>
            {" · "}
            {gig.venueId ? (
              <Link href={venuePath(gig.venueId)} className="underline decoration-border underline-offset-4 hover:text-link-hover">
                {gig.venueName}
              </Link>
            ) : (
              gig.venueName
            )}
            {gig.ticketUrl ? (
              <>
                {" · "}
                <a
                  className="underline decoration-border underline-offset-4 hover:text-link-hover"
                  href={gig.ticketUrl}
                  data-analytics="gig-ticket"
                  data-artist={artistName}
                  data-venue={gig.venueName}
                  data-area={gig.postcode ?? ""}
                >
                  Tickets
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SpotifyLine({ artist, trackUrl }: { artist: MatchedArtist; trackUrl: string | null }) {
  if (artist.spotify_error) {
    return <p className="text-sm text-muted-foreground">Spotify lookup failed for this artist. The local record is unchanged.</p>
  }
  if (!artist.spotify) {
    return <p className="text-sm text-muted-foreground">No exact Spotify name match.</p>
  }
  const track = artist.spotify.representative_track
  const preview = safePreviewUrl(track?.preview_url)
  return (
    <div className="space-y-1 text-sm">
      <p>
        {artist.spotify.url ? (
          <a
            className="spotify-link"
            href={artist.spotify.url}
            data-analytics="spotify-open"
            data-artist={artist.spotify.name || artist.name}
            data-kind="artist"
          >
            {artist.spotify.name || artist.name} on Spotify
          </a>
        ) : (
          <span className="font-medium">{artist.spotify.name || artist.name} on Spotify</span>
        )}
      </p>
      <p className="text-muted-foreground">
        Followers {metricText(artist.spotify.followers)} · Popularity {metricText(artist.spotify.popularity)}
      </p>
      {track?.name ? (
        <p>
          Track:{" "}
          {trackUrl ? (
            <a
              className="spotify-link"
              href={trackUrl}
              data-analytics="spotify-open"
              data-artist={artist.name}
              data-kind="track"
            >
              {track.name}
            </a>
          ) : (
            track.name
          )}
          {track.album ? <span className="text-muted-foreground"> · {track.album}</span> : null}
        </p>
      ) : (
        <p className="text-muted-foreground">No representative track yet.</p>
      )}
      {preview ? (
        <audio controls preload="none" src={preview} className="w-full max-w-sm">
          Preview
        </audio>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-border">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-heading text-2xl font-semibold">{value}</dd>
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{children}</p>
}
