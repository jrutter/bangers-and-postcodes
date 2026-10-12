"use server"

import { redirect, unstable_rethrow } from "next/navigation"

import { playlistEventProperties } from "@/lib/analytics"
import { artistsForScope, gigScopePhrase, isGigScope, parseScope, scopeLabel, scopeValue, type Scope } from "@/lib/catalogue"
import { eraLabel, filterArtists, parseEra, PLAYLIST_TRACK_CAP, playlistCandidates, withEra } from "@/lib/era"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { artistRecordsForGigs, selectGigs, selectionForScope } from "@/lib/gigs/select"
import { gigPlaylistDescription, playlistDescription, playlistName, trackUris } from "@/lib/playlist"
import { captureServerIfAllowed } from "@/lib/posthog-server"
import { getUserToken } from "@/lib/session"
import { matchArtistsCached } from "@/lib/spotify-match"
import { SpotifyError, appendSpotifyFailure, spotifyClient } from "@/lib/spotify"
import type { ArtistRecord } from "@/lib/types"

export async function createPlaylist(formData: FormData) {
  const scope = parseScope(String(formData.get("scope") || "all"))
  const era = parseEra(String(formData.get("era") || ""))
  const back = withEra(scope ? `/playlist?scope=${encodeURIComponent(scopeValue(scope))}` : "/playlist", era)
  const isPublic = formData.get("public") === "1"
  if (!scope) {
    await reportPlaylist({ success: false, status: "scope", scopeKind: "unknown", scopeId: "unknown", isPublic, trackCount: 0 })
    redirect("/playlist?error=scope")
  }

  const client = spotifyClient()
  if (!client.configured()) {
    await reportPlaylist({ success: false, status: "credentials", scopeKind: scope.kind, scopeId: scopeKey(scope), isPublic, trackCount: 0 })
    redirect(withQuery(back, "error", "credentials"))
  }

  const token = await getUserToken()
  if (!token) {
    await reportPlaylist({ success: false, status: "auth", scopeKind: scope.kind, scopeId: scopeKey(scope), isPublic, trackCount: 0 })
    redirect(withQuery(back, "error", "auth"))
  }

  const label = scopeLabel(scope)
  const name = playlistName(label, String(formData.get("name") || ""))

  let created: { url: string | null; trackCount: number; name: string } | null = null
  let failure: "tracks" | "spotify" | "gigs" | "gig-keys" | "unknown" | null = null
  let spotifyFailure: SpotifyError | null = null
  try {
    const loaded = isGigScope(scope) ? await artistsFromGigs(scope) : { artists: artistsForScope(scope), failure: null }
    if (loaded.failure) {
      failure = loaded.failure
    } else {
      const eraArtists = isGigScope(scope) ? loaded.artists : filterArtists(loaded.artists, era)
      const matched = await matchArtistsCached(playlistCandidates(eraArtists))
      const uris = trackUris(matched).slice(0, PLAYLIST_TRACK_CAP)
      if (uris.length === 0) {
        failure = "tracks"
      } else {
        created = await client.createPlaylist(token, {
          name,
          description: isGigScope(scope)
            ? gigPlaylistDescription(gigScopePhrase(scope))
            : playlistDescription(era ? `${label} (${eraLabel(era)})` : label),
          isPublic,
          uris,
        })
      }
    }
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof SpotifyError) {
      spotifyFailure = error
    } else {
      console.error("[playlist] create failed", error instanceof Error ? error.message : "unknown")
      failure = "unknown"
    }
  }
  if (spotifyFailure) {
    await reportPlaylist({
      success: false,
      status: "spotify",
      scopeKind: scope.kind,
      scopeId: scopeKey(scope),
      isPublic,
      trackCount: 0,
      phase: spotifyFailure.phase,
      httpStatus: spotifyFailure.status,
    })
    redirect(appendSpotifyFailure(back, spotifyFailure))
  }
  if (failure || !created) {
    await reportPlaylist({
      success: false,
      status: failure ?? "spotify",
      scopeKind: scope.kind,
      scopeId: scopeKey(scope),
      isPublic,
      trackCount: 0,
    })
    redirect(withQuery(back, "error", failure ?? "spotify"))
  }

  await reportPlaylist({
    success: true,
    status: "created",
    scopeKind: scope.kind,
    scopeId: scopeKey(scope),
    isPublic,
    trackCount: created.trackCount,
  })

  const destination = new URL("http://local.invalid/playlist")
  destination.searchParams.set("scope", scopeValue(scope))
  if (era) destination.searchParams.set("era", String(era))
  if (created.url) destination.searchParams.set("created", created.url)
  destination.searchParams.set("tracks", String(created.trackCount))
  destination.searchParams.set("name", created.name)
  redirect(`${destination.pathname}${destination.search}`)
}

async function reportPlaylist(input: {
  success: boolean
  status: string
  scopeKind: string
  scopeId: string
  isPublic: boolean
  trackCount: number
  phase?: string | null
  httpStatus?: number | null
}) {
  try {
    await captureServerIfAllowed("playlist_created", playlistEventProperties(input))
  } catch {
    // Analytics must not block playlist creation.
  }
}

function scopeKey(scope: Scope): string {
  if (scope.kind === "all") return "all"
  if (scope.kind === "region") return scope.regionId
  if (scope.kind === "postcode") return scope.postcode
  if (scope.kind === "area") return scope.placeId
  if (scope.kind === "venue") return scope.venueId
  if (scope.focus === "all") return "all"
  if ("postcode" in scope.focus) return scope.focus.postcode
  return scope.focus.placeId
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
