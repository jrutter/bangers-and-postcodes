import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { LocalityView, postcodeLinks } from "@/components/locality-view"
import { parseEra } from "@/lib/era"
import { placeGigPostcodes } from "@/lib/gigs/select"
import { readArea, readManifest } from "@/lib/page-data"
import { regionById, regionPath } from "@/lib/regions"

export const maxDuration = 120

export async function generateStaticParams() {
  return readManifest().areas.map((place) => ({ place }))
}

export async function generateMetadata(props: PageProps<"/area/[place]">): Promise<Metadata> {
  const { place } = await props.params
  return { title: readArea(place)?.name ?? "Area" }
}

export default async function AreaPage(props: PageProps<"/area/[place]">) {
  const { place: placeId } = await props.params
  const place = readArea(placeId)
  if (!place) notFound()
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading {place.name}…</p>}>
      <AreaBody placeId={place.id} searchParams={props.searchParams} />
    </Suspense>
  )
}

async function AreaBody({
  placeId,
  searchParams,
}: {
  placeId: string
  searchParams: PageProps<"/area/[place]">["searchParams"]
}) {
  const place = readArea(placeId)
  if (!place) notFound()
  const query = await searchParams
  const page = Number(firstQuery(query.page) || "1")
  const codes = placeGigPostcodes(place.id)
  const codeLabel = codes.length > 0 ? codes.join(", ") : place.name
  const region = place.regionId ? regionById(place.regionId) : null
  return (
    <LocalityView
      kicker={place.precision === "borough" ? "Borough" : region?.name ?? "Area"}
      title={place.name}
      era={parseEra(firstQuery(query.era))}
      page={Number.isFinite(page) ? page : 1}
      crumbs={[
        { href: "/", label: "London" },
        ...(region ? [{ href: regionPath(region.id), label: region.name }] : []),
        { label: place.name },
      ]}
      visitor={
        region
          ? {
              knownFor: `${region.knownFor} ${region.areas.map((area) => area.knownFor).join(" ")}`,
              gettingThere: region.areas.map((area) => area.gettingThere).join(" "),
            }
          : undefined
      }
      rooms={place.rooms}
      note={place.note}
      artists={place.artists}
      places={postcodeLinks(place.postcodes)}
      scope={{ kind: "area", placeId: place.id }}
      gigs={{
        heading: "What's on this week",
        intro: `Shows listed for ${codeLabel} in the next 7 days, including touring artists. Borough pages keep the wider postcodes separate from a single district.`,
        selection: { kind: "place", placeId: place.id },
        playlistScope: { kind: "week", focus: { placeId: place.id } },
        playlistLabel: "This week's gigs playlist",
        emptyLabel: `Nothing is listed around ${place.name} this week.`,
      }}
    />
  )
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
