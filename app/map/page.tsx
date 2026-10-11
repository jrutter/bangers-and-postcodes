import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"

import { EraFilter } from "@/components/era-filter"
import { MapCanvas } from "@/components/map-canvas"
import { MapIndex } from "@/components/map-index"
import { TastePrompt } from "@/components/taste-prompt"
import { artists, places } from "@/lib/catalogue"
import { parseEra, withEra, type EraFilter as Era } from "@/lib/era"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { buildMapModel } from "@/lib/map-model"
import { loadTasteSession } from "@/lib/taste-session"
import { venues } from "@/lib/venues"

export const metadata: Metadata = {
  title: "Map",
  description: "A map of Greater London postcode districts and music venues.",
}

export const maxDuration = 60

export default async function MapPage(props: PageProps<"/map">) {
  const query = await props.searchParams
  const era = parseEra(firstQuery(query.era))
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Map</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Every postcode district inside Greater London, and a pin for every music venue. Pins group together until
          you zoom in. Tap a shape for its artists, venues, and a playlist. Filter the artists by decade. Gig listings
          stay on the southwest search.
        </p>
        <EraFilter path="/map" era={era} />
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the map…</p>}>
        <MapBody era={era} />
      </Suspense>
    </div>
  )
}

async function MapBody({ era }: { era: Era | null }) {
  await connection()
  const returnTo = withEra("/map", era)
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const taste = await loadTasteSession(returnTo)
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
  })
  return (
    <div className="space-y-8">
      {taste.status === "anonymous" ? <TastePrompt returnTo={returnTo} mode="anonymous" /> : null}
      {taste.status === "needs-scope" ? <TastePrompt returnTo={returnTo} mode="needs-scope" /> : null}
      {taste.status === "error" ? <p className="text-sm text-muted-foreground">{taste.message}</p> : null}
      <MapCanvas model={model} />
      <MapIndex model={model} />
    </div>
  )
}

function firstQuery(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}
