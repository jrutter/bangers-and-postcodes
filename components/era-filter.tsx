import Link from "next/link"

import { DECADES, eraLabel, withEra, type EraFilter } from "@/lib/era"

export function EraFilter({
  path,
  era,
  query,
}: {
  path: string
  era: EraFilter | null
  query?: Record<string, string | undefined>
}) {
  const options: { value: EraFilter | null; label: string }[] = [
    { value: null, label: "All eras" },
    { value: "earlier", label: eraLabel("earlier") },
    ...DECADES.map((decade) => ({ value: decade as EraFilter, label: eraLabel(decade) })),
    { value: "now", label: "Active now" },
  ]
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => {
        const selected = option.value === era
        const href = hrefFor(path, option.value, query)
        return (
          <Link
            key={option.label}
            href={href}
            aria-current={selected ? "true" : undefined}
            className={
              selected
                ? "shrink-0 rounded-full bg-foreground px-3 py-1 text-sm text-background"
                : "shrink-0 rounded-full bg-card px-3 py-1 text-sm ring-1 ring-foreground/15"
            }
          >
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}

function hrefFor(path: string, era: EraFilter | null, query?: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value && key !== "era" && key !== "page") params.set(key, value)
  }
  const base = params.size > 0 ? `${path}?${params.toString()}` : path
  return withEra(base, era)
}
