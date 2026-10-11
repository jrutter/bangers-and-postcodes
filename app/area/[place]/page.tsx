import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LocalityView, postcodeLinks } from "@/components/locality-view"
import { artistsInPlace, placeById, places } from "@/lib/catalogue"
import { parseEra } from "@/lib/era"
import { placeGigPostcodes } from "@/lib/gigs/select"
import { areaInfo, regionPath } from "@/lib/regions"
import { venues } from "@/lib/venues"

export const maxDuration = 60

export function generateStaticParams() {
  return places().map((place) => ({ place: place.id }))
}

export async function generateMetadata(props: PageProps<"/area/[place]">): Promise<Metadata> {
  const { place } = await props.params
  return { title: placeById(place)?.name ?? "Area" }
}

export default async function AreaPage(props: PageProps<"/area/[place]">) {
  const { place: placeId } = await props.params
  const place = placeById(placeId)
  if (!place) notFound()
  const query = await props.searchParams
  const artists = artistsInPlace(place.id)
  const page = Number(firstQuery(query.page) || "1")
  const codes = placeGigPostcodes(place.id)
  const codeLabel = codes.length > 0 ? codes.join(", ") : place.name
  const matched = [...new Set(place.postcodes.map((code) => areaInfo(code)?.region.id).filter(Boolean))]
  const region = matched.length === 1 ? areaInfo(place.postcodes[0] ?? "")?.region ?? null : null
  const rooms = venues().filter((venue) =>
    place.precision === "borough"
      ? venue.boroughId === place.id
      : venue.areaIds.includes(place.id) || venue.postcodes.some((code) => place.postcodes.includes(code)),
  )
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
      rooms={rooms}
      note={place.note}
      artists={artists}
      places={postcodeLinks(place.postcodes)}
      scope={{ kind: "area", placeId: place.id }}
      gigs={{
        heading: `Upcoming gigs around ${place.name}`,
        intro: `Shows listed for ${codeLabel}, including touring artists. Borough pages keep the wider postcodes separate from a single district.`,
        selection: { kind: "place", placeId: place.id },
        playlistScope: { kind: "week", focus: { placeId: place.id } },
        playlistLabel: "This week's gigs playlist",
        emptyLabel: `No upcoming gigs were listed around ${place.name}.`,
      }}
    />
  )
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
