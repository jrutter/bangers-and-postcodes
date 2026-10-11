import { Suspense } from "react"

import { PlaylistPanel } from "@/components/playlist-panel"
import { TAGLINE } from "@/lib/format"

export const maxDuration = 60

export default function PlaylistPage(props: PageProps<"/playlist">) {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-primary uppercase">Spotify</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Make a playlist</h1>
        <p className="text-base leading-7 text-muted-foreground">{TAGLINE}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          Log in with Spotify to create the playlist in your account. It is private unless you tick public. One track
          per Spotify artist, aliases collapsed. The same login can rank For you from your top artists, recent
          tracks, and follows. That taste stays in the session and is not saved on the server.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking your Spotify login…</p>}>
        <PlaylistPanel searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}
