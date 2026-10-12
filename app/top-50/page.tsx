import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"

import { GOOGLE_RATINGS_ATTRIBUTION } from "@/lib/venues/places"
import { googlePlacesConfigured, loadVenueRankings, type PublicRanking } from "@/lib/venues/rankings"
import { venuePath } from "@/lib/paths"
import { regionById, regionPath, regions } from "@/lib/regions"

export const metadata: Metadata = {
  title: "Top 50",
  description: "The highest rated music venues in London, weighted so a handful of reviews cannot jump the queue.",
}

export default function Top50Page(props: PageProps<"/top-50">) {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">London</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Top 50 venues</h1>
        <p className="text-base leading-7 text-muted-foreground">
          A weekly ranking of music venues in this guide. The order is a Bayesian average: a room with a few glowing
          reviews stays near the city average until more people have weighed in. {GOOGLE_RATINGS_ATTRIBUTION}.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading venue ratings…</p>}>
        <Top50Body searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function Top50Body({ searchParams }: { searchParams: PageProps<"/top-50">["searchParams"] }) {
  if (!googlePlacesConfigured()) {
    return (
      <p className="text-sm text-muted-foreground">
        Google ratings are not switched on. The list stays empty until a Places API key is set.
      </p>
    )
  }
  await connection()
  const query = await searchParams
  const regionId = first(query.region)
  const region = regionId ? regionById(regionId) : null
  const loaded = await loadVenueRankings()
  const pool = region ? loaded.rows.filter((row) => row.regionId === region.id) : loaded.rows
  const shown = pool.slice(0, 50)
  return (
    <div className="space-y-6">
      <nav aria-label="Filter by region" className="flex flex-wrap gap-2">
        <FilterChip href="/top-50" active={!region}>
          All London
        </FilterChip>
        {regions().map((item) => (
          <FilterChip key={item.id} href={`/top-50?region=${item.id}`} active={region?.id === item.id}>
            {item.name}
          </FilterChip>
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Google ratings are stored yet. The weekly refresh fills this list.
        </p>
      ) : (
        <ol className="space-y-3">
          {shown.map((row) => (
            <RankingRow key={row.venueId} row={row} />
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">{GOOGLE_RATINGS_ATTRIBUTION}</p>
    </div>
  )
}

function RankingRow({ row }: { row: PublicRanking }) {
  const region = row.regionId ? regionById(row.regionId) : null
  return (
    <li className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-heading text-lg font-semibold">
          <span className="mr-2 text-primary">#{row.rank}</span>
          <Link href={venuePath(row.venueId)} className="underline-offset-4 hover:text-link-hover hover:underline">
            {row.name}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          {row.rating.toFixed(1)} · {row.userRatingCount.toLocaleString("en-GB")} reviews
        </p>
      </div>
      {region ? (
        <p className="mt-1 text-sm">
          <Link href={regionPath(region.id)} className="text-info underline-offset-4 hover:underline">
            {region.name}
          </Link>
          <span className="text-muted-foreground"> · #{row.rank} in London</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">#{row.rank} in London</p>
      )}
    </li>
  )
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground"
          : "rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:text-link-hover"
      }
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  )
}

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() ?? ""
}
