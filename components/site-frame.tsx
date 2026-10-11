import Link from "next/link"
import { Suspense } from "react"

import { NewsletterSignup } from "@/components/newsletter-signup"
import { playlistPath } from "@/lib/catalogue"

export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div
        aria-hidden
        className="site-wash pointer-events-none absolute inset-x-0 top-0 h-72"
      />
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-foreground focus:outline-2 focus:outline-offset-3 focus:outline-ring"
      >
        Skip to content
      </a>
      <header className="relative border-b border-border/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="font-heading text-xl font-semibold tracking-tight text-foreground hover:text-foreground">
            Bangers <span className="text-primary">&</span> Postcodes
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
            <Link href="/map" className="text-info underline-offset-4 hover:text-link-hover hover:underline">
              Map
            </Link>
            <Link href="/gigs" className="text-info underline-offset-4 hover:text-link-hover hover:underline">
              Gigs
            </Link>
            <Link href="/venues" className="text-info underline-offset-4 hover:text-link-hover hover:underline">
              Venues
            </Link>
            <Link href="/#areas" className="text-info underline-offset-4 hover:text-link-hover hover:underline">
              Areas
            </Link>
            <Link href={playlistPath()} className="font-medium text-primary underline-offset-4 hover:text-link-hover hover:underline">
              Playlist
            </Link>
          </nav>
        </div>
      </header>
      <main id="content" className="relative mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      <footer className="relative mt-auto border-t border-border/80">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Weekly email signup</p>}>
            <NewsletterSignup placement="footer" inferPath />
          </Suspense>
          <p className="text-sm text-muted-foreground">
            Locality comes from MusicBrainz and Wikidata, not from Spotify. A Spotify match is a name match. Borough
            links stay off the postcode counts. Gig listings come from Skiddle and Ticketmaster when those keys are set,
            and stay empty when they are not. A Spotify login can rank For you from that session. Taste is not stored
            on the server.
          </p>
        </div>
      </footer>
    </div>
  )
}
