import { connection } from "next/server"

import { ArtistBoard } from "@/components/artist-board"
import { spotifyClient } from "@/lib/spotify"
import type { ArtistRecord } from "@/lib/types"

export async function MatchedArtists({ artists }: { artists: ArtistRecord[] }) {
  await connection()
  const client = spotifyClient()
  if (!client.configured()) {
    return <ArtistBoard artists={artists} status="unconfigured" />
  }
  let matched = artists
  let message: string | undefined
  try {
    matched = await client.matchCatalogue(artists)
  } catch (error) {
    message = error instanceof Error ? error.message : "Spotify could not be reached."
  }
  if (message) return <ArtistBoard artists={artists} status="error" message={message} />
  return <ArtistBoard artists={matched} status="ready" />
}
