import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LocalityView, postcodeLinks } from "@/components/locality-view"
import { artistsInPlace, placeById, places } from "@/lib/catalogue"

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
  const artists = artistsInPlace(place.id)
  const kicker = place.precision === "borough" ? "Borough" : place.postcodes.join(" · ") || "Area"
  return (
    <LocalityView
      kicker={kicker}
      title={place.name}
      note={place.note}
      artists={artists}
      places={postcodeLinks(place.postcodes)}
      scope={{ kind: "area", placeId: place.id }}
    />
  )
}
