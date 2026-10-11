import Link from "next/link"

import { playlistPath } from "@/lib/catalogue"

export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top_left,rgba(197,54,43,0.14),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(14,92,73,0.14),transparent_50%)]"
      />
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="relative border-b border-border/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Bangers <span className="text-primary">&</span> Postcodes
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
            <Link href="/gigs" className="text-muted-foreground hover:text-foreground">
              Gigs
            </Link>
            <Link href="/venues" className="text-muted-foreground hover:text-foreground">
              Venues
            </Link>
            <Link href="/#areas" className="text-muted-foreground hover:text-foreground">
              Areas
            </Link>
            <Link href={playlistPath()} className="font-medium text-foreground hover:text-primary">
              Playlist
            </Link>
          </nav>
        </div>
      </header>
      <main id="content" className="relative mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      <footer className="relative mt-auto border-t border-border/80">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          Locality comes from MusicBrainz and Wikidata, not from Spotify. A Spotify match is a name match. Borough
          links stay off the postcode counts. Gig listings come from Skiddle and Ticketmaster when those keys are set,
          and stay empty when they are not.
        </p>
      </footer>
    </div>
  )
}
