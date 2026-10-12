import { connection } from "next/server"

import { createPlaylist } from "@/app/playlist/actions"
import { LinkButton } from "@/components/link-button"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  artistsForScope,
  gigScopePhrase,
  isGigScope,
  parseScope,
  places,
  postcodes,
  scopeLabel,
  scopeValue,
} from "@/lib/catalogue"
import { eraLabel, filterArtists, parseEra, PLAYLIST_TRACK_CAP, withEra } from "@/lib/era"
import { cataloguePostcodes, coveredPostcodes } from "@/lib/geo"
import { regions } from "@/lib/regions"
import { groupVenues, venues } from "@/lib/venues"
import { openSpotifyPlaylist } from "@/lib/format"
import { hasSpotifySession } from "@/lib/session"
import { describeSpotifyFailure, spotifyClient } from "@/lib/spotify"

const ERRORS: Record<string, string> = {
  credentials: "Spotify credentials are not set. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the environment.",
  denied: "Spotify login was cancelled.",
  state: "That login attempt expired. Use Log in with Spotify again.",
  auth: "Log in with Spotify before creating a playlist.",
  tracks: "None of these artists have a Spotify track to add yet.",
  taste: "Log in again so Spotify can share your top artists and the artists you follow.",
  unknown: "The playlist could not be created. Try again.",
  scope: "That area is not in this catalogue.",
  gigs: "No artists were listed for that gig playlist, so nothing was created.",
  "gig-keys":
    "Add SKIDDLE_API_KEY, TICKETMASTER_API_KEY, or BANDSINTOWN_APP_ID before building a gig playlist. Sample artists are not used.",
}

export async function PlaylistPanel({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  const query = await searchParams
  const requested = first(query.scope)
  const scope = parseScope(requested) ?? { kind: "all" as const }
  const loggedIn = await hasSpotifySession()
  const configured = spotifyClient().configured()
  const errorCode = first(query.error)
  const errorText =
    errorCode === "spotify"
      ? describeSpotifyFailure({
          status: first(query.spotifyStatus),
          detail: first(query.spotifyDetail),
          phase: first(query.spotifyPhase),
        })
      : errorCode
        ? ERRORS[errorCode]
        : undefined
  const failedPlaylist =
    errorCode === "spotify" && first(query.spotifyPhase) === "items"
      ? openSpotifyPlaylist(first(query.spotifyPlaylist))
      : null
  const created = openSpotifyPlaylist(first(query.created))
  const tracks = first(query.tracks)
  const playlistTitle = first(query.name)
  const era = parseEra(first(query.era))
  const gigScope = isGigScope(scope)
  const englishScope = scope.kind === "english"
  const artistCount = gigScope || englishScope ? 0 : filterArtists(artistsForScope(scope), era).length
  const returnTo = withEra(`/playlist?scope=${encodeURIComponent(scopeValue(scope))}`, era)

  return (
    <div className="max-w-xl space-y-6">
      {errorText ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          {errorText}
          {failedPlaylist ? (
            <>
              {" "}
              <a className="spotify-link" href={failedPlaylist}>
                Open the playlist on Spotify
              </a>
              .
            </>
          ) : null}
        </p>
      ) : null}
      {created ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          Created {playlistTitle || "the playlist"}
          {tracks ? ` with ${tracks} tracks` : ""}.{" "}
          <a className="spotify-link" href={created} data-analytics="spotify-open" data-kind="playlist">
            Open it on Spotify
          </a>
          .
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before logging in. The redirect URI in SPOTIFY_REDIRECT_URI
          has to match the Spotify dashboard, including the production https address when this is deployed.
        </p>
      ) : null}

      <form action={createPlaylist} className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border sm:p-6">
        <div className="space-y-2">
          <label htmlFor="scope" className="text-sm font-medium">
            Playlist covers
          </label>
          <select
            id="scope"
            name="scope"
            defaultValue={scopeValue(scope)}
            data-analytics-filter="playlist_scope"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="all">All of London</option>
            <option value="english">Your English favourites</option>
            <optgroup label="Regions">
              {regions().map((region) => (
                <option key={region.id} value={`region:${region.id}`}>
                  {region.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Postcodes">
              {postcodes().map((postcode) => (
                <option key={postcode} value={`postcode:${postcode}`}>
                  {postcode}
                </option>
              ))}
            </optgroup>
            <optgroup label="Areas">
              {places().map((place) => (
                <option key={place.id} value={`area:${place.id}`}>
                  {place.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="This week's gigs">
              <option value="week:all">This week across London</option>
              {cataloguePostcodes().map((postcode) => (
                <option key={`week-${postcode}`} value={`week:${postcode}`}>
                  This week near {postcode}
                </option>
              ))}
              {places()
                .filter(
                  (place) =>
                    place.postcodes.some((code) => coveredPostcodes().includes(code)) ||
                    place.id === "richmond-borough" ||
                    place.id === "wandsworth-borough" ||
                    place.id === "kingston-borough",
                )
                .map((place) => (
                <option key={`week-${place.id}`} value={`week:${place.id}`}>
                  This week around {place.name}
                </option>
              ))}
            </optgroup>
            {groupVenues(venues()).map((group) => (
              <optgroup key={group.borough} label={`Venues · ${group.borough}`}>
                {group.districts.flatMap((district) => district.venues).map((venue) => (
                  <option key={venue.id} value={`venue:${venue.id}`}>
                    Who is playing at {venue.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            {englishScope
              ? "Artists from England among your Spotify top artists and follows. The check runs when you create the playlist, using Wikidata and MusicBrainz."
              : gigScope
                ? `Artists are whoever is billed ${gigScopePhrase(scope)}. Spotify matching runs when you create the playlist, up to ${PLAYLIST_TRACK_CAP} tracks.`
                : `${artistCount} ${artistCount === 1 ? "artist" : "artists"} in the catalogue for ${scopeLabel(scope)}${era ? ` (${eraLabel(era)})` : ""}. The playlist keeps the top ${PLAYLIST_TRACK_CAP} tracks after a capped Spotify lookup.`}
          </p>
          {era ? <input type="hidden" name="era" value={era} /> : null}
        </div>
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <Input id="name" name="name" placeholder={`Bangers & Postcodes — ${scopeLabel(scope)}`} maxLength={100} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="public" value="1" className="mt-1 size-4 accent-primary" />
          <span>Public playlist. Leave this off and it stays private.</span>
        </label>
        {loggedIn && configured ? <SubmitButton>Create playlist</SubmitButton> : null}
      </form>
      {loggedIn && configured ? null : (
        <LinkButton href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`} variant="spotify">
          Log in with Spotify
        </LinkButton>
      )}
      {loggedIn ? (
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline" className="h-10 px-4">
            Log out of Spotify
          </Button>
        </form>
      ) : null}
    </div>
  )
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
