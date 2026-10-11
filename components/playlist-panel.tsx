import { connection } from "next/server"

import { createPlaylist } from "@/app/playlist/actions"
import { LinkButton } from "@/components/link-button"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  artistsForScope,
  parseScope,
  places,
  postcodes,
  scopeLabel,
  scopeValue,
} from "@/lib/catalogue"
import { openSpotifyPlaylist } from "@/lib/format"
import { hasSpotifySession } from "@/lib/session"
import { spotifyClient } from "@/lib/spotify"

const ERRORS: Record<string, string> = {
  credentials: "Spotify credentials are not set. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the environment.",
  denied: "Spotify login was cancelled.",
  state: "That login attempt expired. Use Log in with Spotify again.",
  auth: "Log in with Spotify before creating a playlist.",
  tracks: "None of these artists have a Spotify track to add yet.",
  spotify: "Spotify refused the playlist. Check the app redirect URI and try again.",
  scope: "That area is not in this catalogue.",
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
  const created = openSpotifyPlaylist(first(query.created))
  const tracks = first(query.tracks)
  const playlistTitle = first(query.name)
  const artistCount = artistsForScope(scope).length
  const returnTo = `/playlist?scope=${encodeURIComponent(scopeValue(scope))}`

  return (
    <div className="max-w-xl space-y-6">
      {errorCode && ERRORS[errorCode] ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">{ERRORS[errorCode]}</p>
      ) : null}
      {created ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          Created {playlistTitle || "the playlist"}
          {tracks ? ` with ${tracks} tracks` : ""}.{" "}
          <a className="font-medium underline decoration-border underline-offset-4" href={created}>
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

      <form action={createPlaylist} className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
        <div className="space-y-2">
          <label htmlFor="scope" className="text-sm font-medium">
            Playlist covers
          </label>
          <select
            id="scope"
            name="scope"
            defaultValue={scopeValue(scope)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="all">All of southwest London</option>
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
          </select>
          <p className="text-sm text-muted-foreground">
            {artistCount} {artistCount === 1 ? "artist" : "artists"} in the catalogue for {scopeLabel(scope)}. Spotify
            matching runs when you create the playlist.
          </p>
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
        <LinkButton href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>Log in with Spotify</LinkButton>
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
