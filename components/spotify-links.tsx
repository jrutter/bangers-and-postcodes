import type { SpotifyLinks as SpotifyLinkSet } from "@/lib/gigs/spotify"

export function SpotifyLinks({ links }: { links: SpotifyLinkSet }) {
  return (
    <div className="space-y-1 text-sm">
      {links.artistUrl ? (
        <p>
          <a
            className="spotify-link"
            href={links.artistUrl}
            data-analytics="spotify-open"
            data-artist={links.artistLabel}
            data-kind="artist"
          >
            Open {links.artistLabel} in Spotify
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground">{links.artistLabel} on Spotify</p>
      )}
      {links.trackUrl ? (
        <p>
          <a
            className="spotify-link"
            href={links.trackUrl}
            data-analytics="spotify-open"
            data-artist={links.artistLabel}
            data-kind="track"
          >
            Play {links.trackName || "top track"}
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground">No top track link yet.</p>
      )}
      {links.previewUrl ? (
        <audio controls preload="none" src={links.previewUrl} className="w-full max-w-sm">
          Preview
        </audio>
      ) : null}
    </div>
  )
}
