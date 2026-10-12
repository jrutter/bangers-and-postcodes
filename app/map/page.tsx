import type { Metadata } from "next"
import { Suspense } from "react"

import { Breadcrumbs } from "@/components/breadcrumbs"
import { EraFilter } from "@/components/era-filter"
import { LondonMap } from "@/components/london-map"
import { parseEra, withEra } from "@/lib/era"
import { regionById, regionPath } from "@/lib/regions"

export const metadata: Metadata = {
  title: "Map",
  description: "A map of Greater London postcode districts and music venues.",
}

export const maxDuration = 120

export default function MapPage(props: PageProps<"/map">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the map…</p>}>
      <MapBody searchParams={props.searchParams} />
    </Suspense>
  )
}

async function MapBody({ searchParams }: { searchParams: PageProps<"/map">["searchParams"] }) {
  const query = await searchParams
  const era = parseEra(firstQuery(query.era))
  const region = regionById(firstQuery(query.region))
  const returnTo = withEra(region ? `/map?region=${region.id}` : "/map", era)
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <Breadcrumbs
          items={
            region
              ? [
                  { href: "/", label: "London" },
                  { href: regionPath(region.id), label: region.name },
                  { label: "Map" },
                ]
              : [
                  { href: "/", label: "London" },
                  { label: "Map" },
                ]
          }
        />
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {region ? region.name : "Map"}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          {region
            ? `${region.intro} Tap a district for artists and venues. Pins group together until you zoom in.`
            : "Every postcode district inside Greater London. Tap a district to zoom into its region, then tap again for artists, venues, and a playlist. Gig listings cover the whole city."}
        </p>
        <EraFilter path={region ? `/map?region=${region.id}` : "/map"} era={era} />
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the map…</p>}>
        <LondonMap era={era} regionId={region?.id ?? null} showIndex returnTo={returnTo} />
      </Suspense>
    </div>
  )
}

function firstQuery(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}
