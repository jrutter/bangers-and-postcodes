"use server"

import { redirect } from "next/navigation"

import { artistsForScope, parseScope, scopeLabel, scopeValue } from "@/lib/catalogue"
import { playlistDescription, playlistName, trackUris } from "@/lib/playlist"
import { getUserToken } from "@/lib/session"
import { spotifyClient } from "@/lib/spotify"

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
  const artists = artistsForScope(scope)

  let created: { url: string | null; trackCount: number; name: string } | null = null
  let failure: "tracks" | "spotify" | null = null
  try {
    const matched = await client.matchCatalogue(artists)
    const uris = trackUris(matched)
    if (uris.length === 0) {
      failure = "tracks"
    } else {
      created = await client.createPlaylist(token, {
        name,
        description: playlistDescription(label),
        isPublic,
        uris,
      })
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

function withQuery(path: string, key: string, value: string): string {
  const join = path.includes("?") ? "&" : "?"
  return `${path}${join}${key}=${encodeURIComponent(value)}`
}
