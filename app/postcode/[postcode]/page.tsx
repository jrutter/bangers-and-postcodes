import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LocalityView, placeLinks } from "@/components/locality-view"
import { areasInPostcode, artistsInPostcode, knownPostcode, postcodes } from "@/lib/catalogue"

export const maxDuration = 60

export function generateStaticParams() {
  return postcodes().map((postcode) => ({ postcode: postcode.toLowerCase() }))
}

export async function generateMetadata(props: PageProps<"/postcode/[postcode]">): Promise<Metadata> {
  const { postcode } = await props.params
  const code = postcode.toUpperCase()
  if (!knownPostcode(code)) return { title: "Postcode" }
  return { title: code }
}

export default async function PostcodePage(props: PageProps<"/postcode/[postcode]">) {
  const { postcode } = await props.params
  const code = postcode.toUpperCase()
  const areas = areasInPostcode(code)
  if (!knownPostcode(code) || areas.length === 0) notFound()
  const artists = artistsInPostcode(code)
  const names = areas.map((place) => place.name).join(", ")
  return (
    <LocalityView
      kicker="Postcode"
      title={code}
      note={`${names}. Artist counts on this page use place-level links whose postcodes include ${code}. Borough-only artists are listed on their borough page instead.`}
      artists={artists}
      places={placeLinks(areas)}
      scope={{ kind: "postcode", postcode: code }}
      gigs={{
        heading: `Local gigs near ${code}`,
        intro: `Shows listed around ${code}, including touring artists at local venues. This is not limited to the catalogue above.`,
        selection: { kind: "postcode", postcode: code },
        playlistScope: { kind: "week", focus: { postcode: code } },
        playlistLabel: "This week's gigs playlist",
        emptyLabel: `No upcoming gigs were listed near ${code}.`,
      }}
    />
  )
}
