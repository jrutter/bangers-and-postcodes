import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LocalityView, placeLinks } from "@/components/locality-view"
import { areasInPostcode, artistsInPostcode, knownPostcode, postcodes } from "@/lib/catalogue"
import { parseEra } from "@/lib/era"

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
  if (!knownPostcode(code)) notFound()
  const query = await props.searchParams
  const areas = areasInPostcode(code)
  const artists = artistsInPostcode(code)
  const names = areas.map((place) => place.name).join(", ")
  const page = Number(firstQuery(query.page) || "1")
  return (
    <LocalityView
      era={parseEra(firstQuery(query.era))}
      page={Number.isFinite(page) ? page : 1}
      kicker="Postcode"
      title={code}
      note={
        names
          ? `${names}. Artist counts on this page use place-level links whose postcodes include ${code}. Borough-only artists are listed on their borough page instead.`
          : `No neighbourhood in the catalogue is tied to ${code} yet. Borough-level artists stay on their borough page.`
      }
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

function firstQuery(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
