"use client"

import { useEffect, useRef, useState } from "react"
import type { Map as MapLibreMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { LinkButton } from "@/components/link-button"
import type { MapDistrict, MapModel, MapVenuePin } from "@/lib/map-model"
import { MAP_ATTRIBUTION, MAP_STYLE_URL } from "@/lib/map-model"
import boundaries from "@/data/postcode-districts.json"

type Selection = { kind: "district"; id: string } | { kind: "venue"; id: string }

type BoundaryCollection = {
  type: "FeatureCollection"
  features: {
    type: "Feature"
    id: string
    properties: { postcode: string }
    geometry: { type: "Polygon"; coordinates: number[][][] }
  }[]
}

export function SouthwestMap({ model }: { model: MapModel }) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mapProblem, setMapProblem] = useState<string | null>(null)
  const selectedDistrict = model.districts.find((district) => selection?.kind === "district" && district.postcode === selection.id)
  const selectedVenue = model.venues.find((venue) => selection?.kind === "venue" && venue.id === selection.id)

  useEffect(() => {
    const element = container.current
    if (!element) return
    let map: MapLibreMap | null = null
    let cancelled = false
    const markers: { remove: () => void }[] = []

    async function mount() {
      const maplibregl = await import("maplibre-gl")
      if (cancelled || !element) return
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs")
      let created: MapLibreMap
      try {
        created = new maplibregl.Map({
          container: element,
          style: MAP_STYLE_URL,
          center: [-0.25, 51.45],
          zoom: 11,
          attributionControl: { compact: true },
          cooperativeGestures: true,
        })
      } catch (error) {
        setMapProblem(mapFailure(error))
        return
      }
      map = created
      mapRef.current = created
      created.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
      created.on("load", () => {
        created.addSource("districts", { type: "geojson", data: districtCollection(model) })
        created.addLayer({
          id: "district-fill",
          type: "fill",
          source: "districts",
          paint: {
            "fill-color": ["case", ["==", ["get", "highlighted"], 1], "#c5362b", "#0e5c49"],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.62,
              ["==", ["get", "highlighted"], 1],
              0.4,
              0.22,
            ],
          },
        })
        created.addLayer({
          id: "district-line",
          type: "line",
          source: "districts",
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#1c1915",
              ["==", ["get", "highlighted"], 1],
              "#c5362b",
              "#0e5c49",
            ],
            "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 1.2],
          },
        })
        created.on("click", "district-fill", (event) => {
          const postcode = event.features?.[0]?.properties?.postcode
          if (typeof postcode === "string") setSelection({ kind: "district", id: postcode })
        })
        created.on("mouseenter", "district-fill", () => {
          created.getCanvas().style.setProperty("cursor", "pointer")
        })
        created.on("mouseleave", "district-fill", () => {
          created.getCanvas().style.setProperty("cursor", "")
        })
        for (const district of model.districts) {
          const label = document.createElement("span")
          label.textContent = district.postcode
          label.style.cssText =
            "font:600 11px/1 sans-serif;color:#1c1915;background:rgba(244,239,228,.92);padding:2px 4px;border-radius:4px;pointer-events:none;"
          markers.push(
            new maplibregl.Marker({ element: label, anchor: "center" })
              .setLngLat([district.longitude, district.latitude])
              .addTo(created),
          )
        }
        for (const venue of model.venues) {
          const pin = document.createElement("button")
          pin.type = "button"
          pin.setAttribute("aria-label", venue.name)
          pin.style.cssText = `width:${venue.highlighted ? 18 : 14}px;height:${venue.highlighted ? 18 : 14}px;border-radius:999px;border:2px solid #1c1915;background:${venue.highlighted ? "#c5362b" : "#f4efe4"};box-shadow:0 1px 2px rgba(0,0,0,.35);`
          pin.addEventListener("click", (event) => {
            event.stopPropagation()
            setSelection({ kind: "venue", id: venue.id })
          })
          markers.push(
            new maplibregl.Marker({ element: pin, anchor: "center" })
              .setLngLat([venue.longitude, venue.latitude])
              .addTo(created),
          )
        }
        const bounds = new maplibregl.LngLatBounds()
        for (const district of model.districts) bounds.extend([district.longitude, district.latitude])
        created.fitBounds(bounds, { padding: 36, maxZoom: 13, duration: 0 })
        setMapProblem(null)
      })
      created.on("error", (event) => {
        if (created.isStyleLoaded()) return
        setMapProblem(mapFailure(event.error))
      })
    }

    void mount()
    return () => {
      cancelled = true
      for (const marker of markers) marker.remove()
      map?.remove()
      mapRef.current = null
    }
  }, [model])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource("districts")) return
    for (const district of model.districts) {
      map.setFeatureState(
        { source: "districts", id: district.postcode },
        { selected: selection?.kind === "district" && selection.id === district.postcode },
      )
    }
  }, [selection, model.districts])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-3">
        <div ref={container} className="h-[58vh] min-h-72 w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 sm:h-[68vh]" />
        {mapProblem ? (
          <p className="text-sm text-muted-foreground">
            {mapProblem} The district and venue buttons still open the same details. No tile key is required.
          </p>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">{MAP_ATTRIBUTION}</p>
        <div className="space-y-2">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {model.districts.map((district) => (
              <button
                key={district.postcode}
                type="button"
                onClick={() => setSelection({ kind: "district", id: district.postcode })}
                className={chipClass(selection?.kind === "district" && selection.id === district.postcode, district.highlighted)}
              >
                {district.postcode}
                {district.highlighted ? " · for you" : ""}
              </button>
            ))}
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {model.venues.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => setSelection({ kind: "venue", id: venue.id })}
                className={chipClass(selection?.kind === "venue" && selection.id === venue.id, venue.highlighted)}
              >
                {venue.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <aside className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
        {selectedDistrict ? (
          <DistrictDetail district={selectedDistrict} listingsConfigured={model.listingsConfigured} />
        ) : selectedVenue ? (
          <VenueDetail venue={selectedVenue} listingsConfigured={model.listingsConfigured} />
        ) : (
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Choose a place</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Tap a postcode district or a venue pin. Each district opens its artist count, local artists, upcoming
              gigs, and a playlist.
              {model.personalised ? " Red districts and pins match your Spotify taste." : ""}
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

function DistrictDetail({ district, listingsConfigured }: { district: MapDistrict; listingsConfigured: boolean }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-[0.16em] text-primary uppercase">{district.postcode}</p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{district.label}</h2>
        {district.highlightReason ? <p className="text-sm font-medium text-primary">{district.highlightReason}</p> : null}
        <p className="text-sm text-muted-foreground">
          {district.artistCount} {district.artistCount === 1 ? "artist" : "artists"} in the catalogue
        </p>
      </div>
      <ArtistList artists={district.artists} />
      <GigList gigs={district.gigs} listingsConfigured={listingsConfigured} empty="No upcoming gigs were listed in this district." />
      <div className="flex flex-wrap gap-3">
        {district.playlistHref ? (
          <LinkButton href={district.playlistHref}>{"Make this area's playlist"}</LinkButton>
        ) : (
          <p className="text-sm text-muted-foreground">
            This district is on the map for its venues. It is outside the artist-catalogue postcodes, so there is no area
            playlist.
          </p>
        )}
      </div>
      {district.pageHref ? (
        <a className="text-sm font-medium underline decoration-border underline-offset-4" href={district.pageHref}>
          Open the area page
        </a>
      ) : null}
    </div>
  )
}

function VenueDetail({ venue, listingsConfigured }: { venue: MapVenuePin; listingsConfigured: boolean }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium tracking-[0.16em] text-primary uppercase">Venue</p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{venue.name}</h2>
        {venue.highlightReason ? <p className="text-sm font-medium text-primary">{venue.highlightReason}</p> : null}
        <p className="text-sm leading-6 text-muted-foreground">{venue.address}</p>
      </div>
      <GigList gigs={venue.gigs} listingsConfigured={listingsConfigured} empty="No upcoming gigs were listed at this venue." />
      <LinkButton href={venue.playlistHref}>{"Playlist of who's playing here"}</LinkButton>
      <a className="block text-sm font-medium underline decoration-border underline-offset-4" href={venue.pageHref}>
        Open the venue page
      </a>
    </div>
  )
}

function ArtistList({ artists }: { artists: MapDistrict["artists"] }) {
  if (artists.length === 0) {
    return <p className="text-sm text-muted-foreground">No catalogue artists are tied to this district.</p>
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Local artists</h3>
      <ul className="space-y-1 text-sm">
        {artists.map((artist) => (
          <li key={artist.name}>
            {artist.name}
            {artist.reason ? <span className="text-muted-foreground"> · {artist.reason}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function GigList({
  gigs,
  listingsConfigured,
  empty,
}: {
  gigs: MapDistrict["gigs"]
  listingsConfigured: boolean
  empty: string
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Upcoming gigs</h3>
      {!listingsConfigured ? (
        <p className="text-sm text-muted-foreground">
          No gig provider is configured, so this list stays empty. Sample gigs are not shown.
        </p>
      ) : gigs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {gigs.map((gig) => (
            <li key={gig.id}>
              <p className="font-medium">{gig.title}</p>
              <p className="text-muted-foreground">
                {gig.when} · {gig.venueName}
                {gig.ticketUrl ? (
                  <>
                    {" · "}
                    <a className="underline decoration-border underline-offset-4" href={gig.ticketUrl}>
                      Tickets
                    </a>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function mapFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (/webgl/i.test(message)) return "This browser cannot draw the map."
  if (/worker/i.test(message)) return "The map could not be drawn."
  if (/fail|tile|style|network|fetch/i.test(message)) return "Map tiles could not be loaded."
  return "The map could not be drawn."
}

function chipClass(selected: boolean, highlighted: boolean): string {
  const base = "shrink-0 rounded-full px-3 py-1 text-sm ring-1 ring-foreground/15"
  if (selected) return `${base} bg-foreground text-background`
  if (highlighted) return `${base} bg-primary/15 text-foreground`
  return `${base} bg-card text-foreground`
}

function districtCollection(model: MapModel): BoundaryCollection {
  const source = boundaries as BoundaryCollection
  const highlighted = new Set(model.districts.filter((district) => district.highlighted).map((district) => district.postcode))
  return {
    type: "FeatureCollection",
    features: source.features.map((feature) => ({
      type: "Feature",
      id: feature.id,
      properties: {
        postcode: feature.properties.postcode,
        highlighted: highlighted.has(feature.properties.postcode) ? 1 : 0,
      },
      geometry: feature.geometry,
    })),
  }
}
