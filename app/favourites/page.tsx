import type { Metadata } from "next"
import { Suspense } from "react"

import { EnglishFavourites } from "@/components/english-favourites"

export const metadata: Metadata = {
  title: "Your English favourites",
  description:
    "Spotify top artists and follows who are from England, with the town and a playlist. Origin comes from Wikidata and MusicBrainz.",
}

export const maxDuration = 60

export default function FavouritesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking which of your artists are from England…</p>}>
      <EnglishFavourites variant="page" returnTo="/favourites" />
    </Suspense>
  )
}
