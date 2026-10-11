"use server"

import { redirect } from "next/navigation"

import { artistsForScope, gigScopePhrase, isGigScope, parseScope, scopeLabel, scopeValue } from "@/lib/catalogue"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { artistRecordsForGigs, selectGigs, selectionForScope } from "@/lib/gigs/select"
import { gigPlaylistDescription, playlistDescription, playlistName, trackUris } from "@/lib/playlist"
import { getUserToken } from "@/lib/session"
import { spotifyClient } from "@/lib/spotify"
import type { ArtistRecord } from "@/lib/types"

export async function createPlaylist(formData: FormData) {
  const scope = parseScope(String(formData.get("scope") || "all"))
  const back = scope ? `/playlist?scope=${encodeURIComponent(scopeValue(scope))}` : "/playlist"
  if (!scope) redirect("/playlist?error=scope")

  const client = spotifyClient()
  if (!client.configured()) redirect(withQuery(back, "error", "credentials"))

  const token = await getUserToken()
  if (!token) redirect(withQuery(back, "error", "auth"))

  const label = scopeLabel(scope)
  const name = playlistName(label, String(formData.get("name") || ""))
  const isPublic = formData.get("public") === "1"

  let created: { url: string | null; trackCount: number; name: string } | null = null
  let failure: "tracks" | "spotify" | "gigs" | "gig-keys" | null = null
  try {
    const loaded = isGigScope(scope) ? await artistsFromGigs(scope) : { artists: artistsForScope(scope), failure: null }
    if (loaded.failure) {
      failure = loaded.failure
    } else {
      const matched = await client.matchCatalogue(loaded.artists)
      const uris = trackUris(matched)
      if (uris.length === 0) {
        failure = "tracks"
      } else {
        created = await client.createPlaylist(token, {
          name,
          description: isGigScope(scope) ? gigPlaylistDescription(gigScopePhrase(scope)) : playlistDescription(label),
          isPublic,
          uris,
        })
      }
    }
  } catch {
    failure = "spotify"
  }
  if (failure || !created) redirect(withQuery(back, "error", failure ?? "spotify"))

  const destination = new URL("http://local.invalid/playlist")
  destination.searchParams.set("scope", scopeValue(scope))
  if (created.url) destination.searchParams.set("created", created.url)
  destination.searchParams.set("tracks", String(created.trackCount))
  destination.searchParams.set("name", created.name)
  redirect(`${destination.pathname}${destination.search}`)
}

async function artistsFromGigs(scope: Parameters<typeof selectionForScope>[0]): Promise<{
  artists: ArtistRecord[]
  failure: "gigs" | "gig-keys" | null
}> {
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  if (!feed.providers.some((provider) => provider.configured)) {
    return { artists: [], failure: "gig-keys" }
  }
  const chosen = selectionForScope(scope)
  const gigs = selectGigs(feed.gigs, chosen.selection, chosen.span, new Date())
  const artists = artistRecordsForGigs(gigs)
  if (artists.length === 0) return { artists: [], failure: "gigs" }
  return { artists, failure: null }
}

function withQuery(path: string, key: string, value: string): string {
  const join = path.includes("?") ? "&" : "?"
  return `${path}${join}${key}=${encodeURIComponent(value)}`
}
