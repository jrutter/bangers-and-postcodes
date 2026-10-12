import { connection } from "next/server"

import { MapCanvas } from "@/components/map-canvas"
import { MapIndex } from "@/components/map-index"
import { TastePrompt } from "@/components/taste-prompt"
import { artists, places } from "@/lib/catalogue"
import { withEra, type EraFilter } from "@/lib/era"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { buildMapModel } from "@/lib/map-model"
import { regionById } from "@/lib/regions"
import { loadTasteSession } from "@/lib/taste-session"
import { venues } from "@/lib/venues"

export async function LondonMap({
  era = null,
  regionId = null,
  showIndex = false,
  returnTo = "/map",
}: {
  era?: EraFilter | null
  regionId?: string | null
  showIndex?: boolean
  returnTo?: string
}) {
  await connection()
  const focus = regionId && regionById(regionId) ? regionId : null
  const taste = await loadTasteSession(withEra(returnTo, era))
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const profile = taste.status === "ready" ? taste.profile : null
  const model = buildMapModel({
    artists: artists(),
    places: places(),
    venues: venues(),
    gigs: feed.gigs,
    now: new Date(),
    profile,
    listingsConfigured: feed.providers.some((provider) => provider.configured),
    era,
    focusRegionId: focus,
  })
  return (
    <div className="space-y-8">
      {taste.status === "anonymous" ? <TastePrompt returnTo={withEra(returnTo, era)} mode="anonymous" /> : null}
      {taste.status === "needs-scope" ? <TastePrompt returnTo={withEra(returnTo, era)} mode="needs-scope" /> : null}
      {taste.status === "error" ? <p className="text-sm text-muted-foreground">{taste.message}</p> : null}
      <MapCanvas model={model} />
      {showIndex ? <MapIndex model={model} /> : null}
    </div>
  )
}
