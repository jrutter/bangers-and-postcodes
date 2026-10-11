import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"

import { MapCanvas } from "@/components/map-canvas"
import { MapIndex } from "@/components/map-index"
import { TastePrompt } from "@/components/taste-prompt"
import { artists, places } from "@/lib/catalogue"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { buildMapModel } from "@/lib/map-model"
import { loadTasteSession } from "@/lib/taste-session"
import { venues } from "@/lib/venues"

export const metadata: Metadata = {
  title: "Map",
  description: "A map of southwest London postcode districts and music venues.",
}

export const maxDuration = 60

export default function MapPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">Southwest London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Map</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Postcode districts from Barnes to Wimbledon, plus Twickenham and Balham where the venue list reaches. Tap a
          district for its artists and gigs, or a pin for a room.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the map…</p>}>
        <MapBody />
      </Suspense>
    </div>
  )
}

async function MapBody() {
  await connection()
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const taste = await loadTasteSession("/map")
  const profile = taste.status === "ready" ? taste.profile : null
  const model = buildMapModel({
    artists: artists(),
    places: places(),
    venues: venues(),
    gigs: feed.gigs,
    now: new Date(),
    profile,
    listingsConfigured: feed.providers.some((provider) => provider.configured),
  })
  return (
    <div className="space-y-8">
      {taste.status === "anonymous" ? <TastePrompt returnTo="/map" mode="anonymous" /> : null}
      {taste.status === "needs-scope" ? <TastePrompt returnTo="/map" mode="needs-scope" /> : null}
      {taste.status === "error" ? <p className="text-sm text-muted-foreground">{taste.message}</p> : null}
      <MapCanvas model={model} />
      <MapIndex model={model} />
    </div>
  )
}
