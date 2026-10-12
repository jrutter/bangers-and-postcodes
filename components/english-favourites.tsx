import Link from "next/link"
import { connection } from "next/server"

import { LinkButton } from "@/components/link-button"
import { playlistPath } from "@/lib/catalogue"
import type { FavouriteView } from "@/lib/england"
import { loadFavouriteSession } from "@/lib/favourites-session"
import { loginPath } from "@/lib/oauth"

export async function EnglishFavourites({
  variant,
  returnTo,
}: {
  variant: "page" | "teaser"
  returnTo: string
}) {
  await connection()
  const session = await loadFavouriteSession(returnTo, variant === "teaser" ? 8_000 : 12_000)
  return (
    <section className="space-y-4" aria-labelledby="english-favourites-heading">
      <div className="space-y-2">
        <h2 id="english-favourites-heading" className="font-heading text-3xl font-semibold tracking-tight">
          Your English favourites
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Spotify top artists from the last 4 weeks, the last 6 months, and several years, plus artists you follow.
          Spotify has no home town, so a place counts when Wikidata or MusicBrainz puts it in England. Country code GB
          is not enough, because that is also Scotland, Wales, and Northern Ireland.
        </p>
      </div>
      {session.status === "anonymous" ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
          Log in with Spotify to see which of your top artists and follows are from England.{" "}
          <Link href={loginPath(returnTo)} className="spotify-link">
            Log in with Spotify
          </Link>
        </p>
      ) : null}
      {session.status === "needs-scope" ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
          Log in again so Spotify can share your top artists and the artists you follow.{" "}
          <Link href={loginPath(returnTo)} className="spotify-link">
            Log in with Spotify
          </Link>
        </p>
      ) : null}
      {session.status === "error" ? <p className="text-sm leading-6 text-muted-foreground">{session.message}</p> : null}
      {session.status === "empty" ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Spotify did not return top artists or follows for this account.
        </p>
      ) : null}
      {session.status === "ready" ? <FavouriteLists view={session.view} variant={variant} /> : null}
    </section>
  )
}

function FavouriteLists({ view, variant }: { view: FavouriteView; variant: "page" | "teaser" }) {
  const shown = variant === "teaser" ? view.english.slice(0, 4) : view.english
  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-muted-foreground">
        {view.english.length === 0
          ? "None of the artists checked so far are from England."
          : `${view.english.length} ${view.english.length === 1 ? "artist is" : "artists are"} from England.`}
        {view.elsewhereCount > 0
          ? ` ${view.elsewhereCount} ${view.elsewhereCount === 1 ? "is" : "are"} from somewhere else and left off this list.`
          : ""}
      </p>
      {shown.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((artist) => (
            <li key={artist.id} className="flex gap-3 rounded-xl bg-card p-3 ring-1 ring-border">
              {artist.image ? (
                // Spotify CDN images. A plain img avoids a remote-image allowlist.
                <img src={artist.image} alt="" className="size-14 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="size-14 shrink-0 rounded-md bg-muted" />
              )}
              <div className="min-w-0 space-y-1">
                <p className="font-heading text-lg font-semibold tracking-tight">{artist.name}</p>
                <p className="text-sm text-foreground">{artist.place}</p>
                <p className="text-sm text-accent">{artist.why}</p>
                {artist.source ? <p className="text-sm text-muted-foreground">Source: {artist.source}</p> : null}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {artist.links.map((link) => (
                    <Link key={link.href} href={link.href} className="underline decoration-border underline-offset-4">
                      {link.label}
                    </Link>
                  ))}
                  <a className="spotify-link" href={artist.spotifyUrl}>
                    Open in Spotify
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <LinkButton href={playlistPath({ kind: "english" })}>Make a playlist of my English favourites</LinkButton>
        {variant === "teaser" ? (
          <LinkButton href="/favourites" variant="outline">
            See all
          </LinkButton>
        ) : null}
      </div>
      {variant === "page" && view.unknown.length > 0 ? (
        <details className="rounded-xl bg-card p-4 ring-1 ring-border">
          <summary className="cursor-pointer text-sm font-medium">Origin unknown · {view.unknown.length}</summary>
          <ul className="space-y-2 pt-3 text-sm">
            {view.unknown.map((artist) => (
              <li key={artist.id}>
                <span className="font-medium">{artist.name}</span>
                <span className="text-muted-foreground"> · {artist.why}</span>
                {artist.source ? <span className="text-muted-foreground"> · {artist.source}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {variant === "page" && view.unchecked.length > 0 ? (
        <details className="rounded-xl bg-card p-4 ring-1 ring-border">
          <summary className="cursor-pointer text-sm font-medium">Not checked yet · {view.unchecked.length}</summary>
          <p className="pt-3 text-sm leading-6 text-muted-foreground">
            MusicBrainz allows about one request a second. This visit checked a first batch. Refresh the page to
            continue, and the ones already checked stay cached.
          </p>
        </details>
      ) : null}
    </div>
  )
}
