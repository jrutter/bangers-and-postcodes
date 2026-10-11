import Link from "next/link"

import type { MapModel } from "@/lib/map-model"

export function MapIndex({ model }: { model: MapModel }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Districts</h2>
        <ul className="space-y-2 text-sm">
          {model.districts.map((district) => (
            <li key={district.postcode}>
              {district.pageHref ? (
                <Link href={district.pageHref} className="font-medium underline decoration-border underline-offset-4">
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
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Venues</h2>
        <ul className="space-y-2 text-sm">
          {model.venues.map((venue) => (
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
      </section>
    </div>
  )
}
