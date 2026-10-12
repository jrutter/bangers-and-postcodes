import { GigList } from "@/components/gig-list"
import { LinkButton } from "@/components/link-button"
import { isGigScope, playlistPath, type Scope } from "@/lib/paths"
import { cachedClock, loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { artistRecordsForGigs, selectGigs, selectionForScope } from "@/lib/gigs/select"
import { linksForGigArtists } from "@/lib/gigs/spotify"
import type { GigFeed, GigSelection, TaggedGig } from "@/lib/gigs/types"
import { indexTags, matchGig, orderByTaste, type TasteProfile } from "@/lib/taste"
import type { MatchedArtist } from "@/lib/types"

export async function GigSection({
  heading,
  intro,
  selection,
  span,
  playlistScope,
  playlistLabel,
  limit,
  feed,
  knownArtists = [],
  showSpotifyNotice = true,
  emptyLabel,
  sortTaste = null,
}: {
  heading: string
  intro: string
  selection: GigSelection
  span: "upcoming" | "week" | "later"
  playlistScope?: Scope
  playlistLabel?: string
  limit?: number
  feed?: GigFeed
  knownArtists?: MatchedArtist[]
  showSpotifyNotice?: boolean
  emptyLabel: string
  sortTaste?: TasteProfile | null
}) {
  const resolved = await resolveFeed(feed)
  const now = new Date(await cachedClock())
  const selected = selectGigs(resolved.gigs, selection, span, now)
  const tags = sortTaste ? indexTags((await import("@/lib/catalogue")).artists()) : undefined
  const ranked = sortTaste ? orderByTaste(selected, (gig) => matchGig(sortTaste, gig, tags)) : null
  const gigs = ranked ? ranked.map((row) => row.item) : selected
  const reasons = ranked
    ? Object.fromEntries(ranked.flatMap((row) => (row.taste ? [[row.item.id, row.taste.reason]] : [])))
    : undefined
  const shown = typeof limit === "number" ? gigs.slice(0, limit) : gigs
  const spotify = await linksForGigArtists(shown, knownArtists)
  const playlistGigs = playlistGigsFor(resolved, playlistScope, now)

  return (
    <section id={span === "week" ? "this-week" : undefined} className="space-y-4">
      <div className="max-w-3xl space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{heading}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{intro}</p>
        <GigStatus feed={resolved} empty={shown.length === 0} emptyLabel={emptyLabel} />
      </div>
      {playlistScope && playlistLabel && playlistGigs.length > 0 ? (
        <LinkButton href={playlistPath(playlistScope)} variant="outline">
          {playlistLabel}
        </LinkButton>
      ) : null}
      {playlistScope && isGigScope(playlistScope) && playlistGigs.length === 0 && shown.length > 0 ? (
        <p className="text-sm text-muted-foreground">Nobody is listed for that playlist yet.</p>
      ) : null}
      {shown.length > 0 ? <GigList gigs={shown} links={spotify.links} reasons={reasons} /> : null}
      {typeof limit === "number" && gigs.length > shown.length ? (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {gigs.length}.
        </p>
      ) : null}
      {showSpotifyNotice && spotify.status === "unconfigured" && shown.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Spotify links need SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. Ticket links above still work.
        </p>
      ) : null}
      {spotify.status === "error" && shown.length > 0 ? (
        <p className="text-sm text-muted-foreground">{spotify.message || "Spotify links could not be loaded."}</p>
      ) : null}
    </section>
  )
}

function playlistGigsFor(feed: GigFeed, scope: Scope | undefined, now: Date): TaggedGig[] {
  if (!scope || !isGigScope(scope)) return []
  const chosen = selectionForScope(scope)
  const gigs = selectGigs(feed.gigs, chosen.selection, chosen.span, now)
  return artistRecordsForGigs(gigs).length > 0 ? gigs : []
}

async function resolveFeed(feed: GigFeed | undefined): Promise<GigFeed> {
  if (feed) return feed
  return loadRegionalGigs(gigProviderFingerprint())
}

function GigStatus({ feed, empty, emptyLabel }: { feed: GigFeed; empty: boolean; emptyLabel: string }) {
  const configured = feed.providers.filter((provider) => provider.configured)
  const missing = feed.providers.filter((provider) => !provider.configured)
  const failed = configured.filter((provider) => provider.error)
  if (configured.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        No gig provider is configured, so this list stays empty. Set SKIDDLE_API_KEY, TICKETMASTER_API_KEY, or
        BANDSINTOWN_APP_ID. Sample gigs are not shown.
      </p>
    )
  }
  const loaded = configured.filter((provider) => !provider.error).map((provider) => provider.label)
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        {loaded.length > 0 ? `Listings from ${loaded.join(" and ")}` : "No listings were loaded"}
        {missing.length > 0 ? `. ${missing.map((provider) => provider.label).join(" and ")} ${missing.length === 1 ? "is" : "are"} not configured` : ""}
        . Cached for about six hours, from {formatDay(feed.from)} to {formatDay(feed.to)}.
        {feed.truncated ? " Some later pages were left for the next refresh so the search stays inside the provider limits." : ""}
      </p>
      {failed.map((provider) => (
        <p key={provider.id}>
          {provider.label} could not be loaded{provider.error ? ` (${provider.error})` : ""}.
          {loaded.length > 0 ? " The other listings are still shown." : " Nothing is shown in its place."}
        </p>
      ))}
      {empty && failed.length < configured.length ? <p>{emptyLabel}</p> : null}
    </div>
  )
}

function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  if (!year || !month || !day) return isoDate
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}
