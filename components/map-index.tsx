import Link from "next/link"

import { postcodeArea } from "@/lib/districts"
import type { MapDistrict, MapModel, MapVenuePin } from "@/lib/map-model"

export function MapIndex({ model }: { model: MapModel }) {
  const groups = groupDistricts(model.districts)
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Districts</h2>
        <p className="text-sm text-muted-foreground">
          {model.districts.length} districts on the map. Counts follow the era filter.
        </p>
        <div className="space-y-2">
          {groups.map((group) => (
            <details key={group.area} open={group.area === "SW"} className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium">
                {group.area} · {group.rows.length} districts
              </summary>
              <ul className="space-y-2 pt-2 text-sm">
                {group.rows.map((district) => (
                  <li key={district.postcode}>
                    {district.pageHref ? (
                      <Link
                        href={district.pageHref}
                        className="font-medium underline decoration-border underline-offset-4"
                      >
                        {district.postcode}
                      </Link>
                    ) : (
                      <span className="font-medium">{district.postcode}</span>
                    )}{" "}
                    <span className="text-muted-foreground">
                      {district.label} · {district.artistCount} {district.artistCount === 1 ? "artist" : "artists"}
                      {district.highlighted ? ` · ${district.highlightReason}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Venues</h2>
        <p className="text-sm text-muted-foreground">
          {model.venues.length} rooms. Pins cluster until you zoom in.{" "}
          <Link href="/venues" className="underline decoration-border underline-offset-4">
            Browse the full list
          </Link>
          .
        </p>
        <div className="space-y-2">
          {groupVenuePins(model.venues).map((group) => (
            <details key={group.borough} className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium">
                {group.borough} · {group.venues.length}
              </summary>
              <ul className="space-y-2 pt-2 text-sm">
                {group.venues.map((venue) => (
                  <li key={venue.id}>
                    <Link href={venue.pageHref} className="font-medium underline decoration-border underline-offset-4">
                      {venue.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {venue.postcode}
                      {venue.highlighted ? ` · ${venue.highlightReason}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

function groupDistricts(districts: MapDistrict[]) {
  const groups = new Map<string, MapDistrict[]>()
  for (const district of districts) {
    const area = postcodeArea(district.postcode)
    const list = groups.get(area) ?? []
    list.push(district)
    groups.set(area, list)
  }
  return [...groups.entries()].map(([area, rows]) => ({ area, rows }))
}

function groupVenuePins(venues: MapVenuePin[]) {
  const groups = new Map<string, MapVenuePin[]>()
  for (const venue of venues) {
    const borough = venue.borough || "London"
    const list = groups.get(borough) ?? []
    list.push(venue)
    groups.set(borough, list)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([borough, rows]) => ({ borough, venues: rows }))
}
