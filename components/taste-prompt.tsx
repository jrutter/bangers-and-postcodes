import Link from "next/link"

import { loginPath } from "@/lib/oauth"

export function TastePrompt({ returnTo, mode }: { returnTo: string; mode: "anonymous" | "needs-scope" | "error" }) {
  const href = loginPath(returnTo)
  const copy =
    mode === "needs-scope"
      ? "Log in again to rank this by your Spotify taste. This session can still save playlists, and it does not include your top artists."
      : mode === "error"
        ? "Spotify taste could not be loaded. Log in again, or keep browsing the usual lists."
        : "Log in with Spotify to rank local artists and gigs by what you play."
  return (
    <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
      {copy}{" "}
      <Link href={href} className="font-medium text-foreground underline decoration-border underline-offset-4">
        Log in with Spotify
      </Link>
    </p>
  )
}
