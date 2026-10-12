import Link from "next/link"

import { regionPath, regions, type Region } from "@/lib/regions"

export function RegionPicker({ counts }: { counts: Record<string, { districts: number; artists: number; venues: number }> }) {
  const inner = regions().filter((region) => region.group === "inner")
  const outer = regions().filter((region) => region.group === "outer")
  return (
    <div className="space-y-8">
      <RegionGrid title="London" note="The compass postcodes, plus the City and the West End." regions={inner} counts={counts} />
      <RegionGrid
        title="Outer London"
        note="Districts that use EN, HA, UB, TW, KT, CR, SM, BR, DA, IG, and RM, grouped by direction."
        regions={outer}
        counts={counts}
      />
    </div>
  )
}

function RegionGrid({
  title,
  note,
  regions: list,
  counts,
}: {
  title: string
  note: string
  regions: Region[]
  counts: Record<string, { districts: number; artists: number; venues: number }>
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{note}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((region) => {
          const count = counts[region.id]
          return (
            <li key={region.id}>
              <Link href={regionPath(region.id)} className="block h-full">
                <article className="h-full space-y-2 rounded-xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-muted">
                  <h3 className="font-heading text-xl font-semibold tracking-tight">{region.name}</h3>
                  <p className="text-sm text-info">{region.areas.map((area) => area.code).join(", ")}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{region.knownFor}</p>
                  {count ? (
                    <p className="text-sm text-muted-foreground">
                      {count.districts} districts · {count.artists} artists · {count.venues} venues
                    </p>
                  ) : null}
                </article>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
