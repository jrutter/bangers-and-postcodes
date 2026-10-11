import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LocalityView, postcodeLinks } from "@/components/locality-view"
import { artistsInPlace, placeById, places } from "@/lib/catalogue"
import { placeGigPostcodes } from "@/lib/gigs/select"

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
  const codes = placeGigPostcodes(place.id)
  const codeLabel = codes.length > 0 ? codes.join(", ") : place.name
  return (
    <LocalityView
      kicker={kicker}
      title={place.name}
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
