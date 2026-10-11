import type { SpotifyLinks as SpotifyLinkSet } from "@/lib/gigs/spotify"

export function SpotifyLinks({ links }: { links: SpotifyLinkSet }) {
  return (
    <div className="space-y-1 text-sm">
      {links.artistUrl ? (
        <p>
          <a className="font-medium underline decoration-border underline-offset-4 hover:text-primary" href={links.artistUrl}>
            Open {links.artistLabel} in Spotify
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground">{links.artistLabel} on Spotify</p>
      )}
      {links.trackUrl ? (
        <p>
          <a className="underline decoration-border underline-offset-4 hover:text-primary" href={links.trackUrl}>
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
