import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { LocalityView } from "@/components/locality-view"
import { postcodeArea } from "@/lib/districts"
import { parseEra } from "@/lib/era"
import { readManifest, readPostcode } from "@/lib/page-data"
import { regionById, regionPath } from "@/lib/regions"

export const maxDuration = 120

export async function generateStaticParams() {
  return readManifest().postcodes.map((postcode) => ({ postcode }))
}

export async function generateMetadata(props: PageProps<"/postcode/[postcode]">): Promise<Metadata> {
  const { postcode } = await props.params
  const page = readPostcode(postcode)
  return { title: page?.code ?? "Postcode" }
}

export default async function PostcodePage(props: PageProps<"/postcode/[postcode]">) {
  const { postcode } = await props.params
  const page = readPostcode(postcode)
  if (!page) notFound()
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading {page.code}…</p>}>
      <PostcodeBody code={page.code} searchParams={props.searchParams} />
    </Suspense>
  )
}

async function PostcodeBody({
  code,
  searchParams,
}: {
  code: string
  searchParams: PageProps<"/postcode/[postcode]">["searchParams"]
}) {
  const page = readPostcode(code)
  if (!page) notFound()
  const query = await searchParams
  const names = page.placeNames.join(", ")
  const pageNumber = Number(firstQuery(query.page) || "1")
  const region = page.regionId ? regionById(page.regionId) : null
  const info = region?.areas.find((area) => area.code === postcodeArea(code))
  return (
    <LocalityView
      era={parseEra(firstQuery(query.era))}
      page={Number.isFinite(pageNumber) ? pageNumber : 1}
      crumbs={[
        { href: "/", label: "London" },
        ...(region ? [{ href: regionPath(region.id), label: region.name }] : []),
        { label: code },
      ]}
      visitor={
        info
          ? {
              knownFor: `${region?.knownFor ?? ""} ${info.knownFor}`.trim(),
              gettingThere: info.gettingThere,
            }
          : undefined
      }
      rooms={page.rooms}
      kicker={region?.name ?? "Postcode"}
      title={code}
      note={
        names
          ? `${names}. Artist counts on this page use place-level links whose postcodes include ${code}. Borough-only artists are listed on their borough page instead.`
          : `No neighbourhood in the catalogue is tied to ${code} yet. Borough-level artists stay on their borough page.`
      }
      artists={page.artists}
      places={page.places}
      scope={{ kind: "postcode", postcode: code }}
      gigs={{
        heading: "What's on this week",
        intro: `Shows listed around ${code} in the next 7 days, including touring artists at local venues. This is not limited to the catalogue above.`,
        selection: { kind: "postcode", postcode: code },
        playlistScope: { kind: "week", focus: { postcode: code } },
        playlistLabel: "This week's gigs playlist",
        emptyLabel: `Nothing is listed near ${code} this week.`,
      }}
    />
  )
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
