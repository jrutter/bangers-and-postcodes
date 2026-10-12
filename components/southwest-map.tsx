"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { LinkButton } from "@/components/link-button"
import type { MapDistrict, MapModel, MapVenuePin } from "@/lib/map-model"
import { MAP_ATTRIBUTION, MAP_STYLE_URL } from "@/lib/map-style"
import { captureClient } from "@/lib/posthog-browser"
import { regionForPostcode, regions, regionPath } from "@/lib/regions"
import boundaries from "@/data/postcode-districts.json"

type Selection = { kind: "district"; id: string } | { kind: "venue"; id: string }

type BoundaryCollection = {
  type: "FeatureCollection"
  features: {
    type: "Feature"
    id: string
    properties: { postcode: string; highlighted?: number; inFocus?: number }
    geometry: { type: "Polygon"; coordinates: number[][][] }
  }[]
}

export function SouthwestMap({ model }: { model: MapModel }) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const modelRef = useRef(model)
  const venueSelection = useRef<string | null>(null)
  const focusRef = useRef(model.focusRegionId)
  const pathname = usePathname()
  const router = useRouter()
  modelRef.current = model
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mapProblem, setMapProblem] = useState<string | null>(null)
  const selectedDistrict = model.districts.find((district) => selection?.kind === "district" && district.postcode === selection.id)
  const selectedVenue = model.venues.find((venue) => selection?.kind === "venue" && venue.id === selection.id)

  function selectPlace(next: Selection) {
    setSelection(next)
    if (next.kind === "district") {
      captureClient("map_area_clicked", { kind: "district", postcode: next.id, area: next.id })
      return
    }
    const venue = model.venues.find((item) => item.id === next.id)
    captureClient("map_area_clicked", { kind: "venue", venue: next.id, area: venue?.postcode ?? "" })
  }

  useEffect(() => {
    const element = container.current
    if (!element) return
    let map: MapLibreMap | null = null
    let cancelled = false

    async function mount() {
      const maplibregl = await import("maplibre-gl")
      if (cancelled || !element) return
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs")
      let created: MapLibreMap
      try {
        created = new maplibregl.Map({
          container: element,
          style: MAP_STYLE_URL,
          center: [-0.1, 51.49],
          zoom: 9,
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
        const colors = mapColors()
        const current = modelRef.current
        created.addSource("districts", { type: "geojson", data: districtCollection(current) })
        created.addLayer({
          id: "district-fill",
          type: "fill",
          source: "districts",
          paint: {
            "fill-color": ["case", ["==", ["get", "highlighted"], 1], colors.highlight, colors.fill],
            "fill-opacity": [
              "case",
              ["==", ["get", "inFocus"], 0],
              0.04,
              ["boolean", ["feature-state", "selected"], false],
              0.5,
              ["==", ["get", "highlighted"], 1],
              0.38,
              0.2,
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
              colors.selectedLine,
              ["==", ["get", "highlighted"], 1],
              colors.highlightLine,
              colors.line,
            ],
            "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 1.2],
          },
        })
        created.addLayer({
          id: "district-label",
          type: "symbol",
          source: "districts",
          layout: {
            "text-field": ["get", "postcode"],
            "text-size": 11,
            "text-font": ["Noto Sans Bold"],
          },
          paint: {
            "text-color": colors.label,
            "text-halo-color": colors.labelBg,
            "text-halo-width": 1.2,
          },
        })
        created.on("mouseenter", "district-fill", () => {
          created.getCanvas().style.setProperty("cursor", "pointer")
        })
        created.on("mouseleave", "district-fill", () => {
          created.getCanvas().style.setProperty("cursor", "")
        })
        created.addSource("venues", {
          type: "geojson",
          data: venueCollection(current),
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 48,
          clusterProperties: {
            highlighted: ["+", ["get", "highlighted"]],
          },
          promoteId: "id",
        })
        created.addLayer({
          id: "venue-clusters",
          type: "circle",
          source: "venues",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["case", [">", ["get", "highlighted"], 0], colors.highlight, colors.cluster],
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 30, 22],
            "circle-stroke-width": 2,
            "circle-stroke-color": colors.labelBg,
          },
        })
        created.addLayer({
          id: "venue-cluster-count",
          type: "symbol",
          source: "venues",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 11,
            "text-font": ["Noto Sans Bold"],
          },
          paint: { "text-color": colors.labelBg },
        })
        created.addLayer({
          id: "venue-points",
          type: "circle",
          source: "venues",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["case", ["==", ["get", "highlighted"], 1], colors.pinHighlight, colors.pin],
            "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 6],
            "circle-stroke-width": 2,
            "circle-stroke-color": colors.pinBorder,
          },
        })
        created.on("click", "district-fill", (event) => {
          const onVenue = created.queryRenderedFeatures(event.point, { layers: ["venue-points", "venue-clusters"] })
          if (onVenue.length > 0) return
          const postcode = event.features?.[0]?.properties?.postcode
          if (typeof postcode !== "string") return
          const region = regionForPostcode(postcode)
          const focus = modelRef.current.focusRegionId
          if (!region || focus !== region.id) {
            if (region) {
              captureClient("map_area_clicked", { kind: "region", region: region.id, area: postcode })
              openRegion(region.id)
            }
            return
          }
          setSelection({ kind: "district", id: postcode })
          captureClient("map_area_clicked", { kind: "district", postcode, area: postcode })
        })
        created.on("click", "venue-clusters", (event) => {
          const feature = event.features?.[0]
          const clusterId = feature?.properties?.cluster_id
          const geometry = feature?.geometry
          if (typeof clusterId !== "number" || geometry?.type !== "Point") return
          const source = created.getSource("venues") as GeoJSONSource | undefined
          if (!source) return
          source.getClusterExpansionZoom(clusterId).then(
            (zoom) => {
              created.easeTo({ center: geometry.coordinates as [number, number], zoom })
            },
            () => undefined,
          )
        })
        created.on("click", "venue-points", (event) => {
          const id = event.features?.[0]?.properties?.id
          if (typeof id !== "string") return
          const venue = modelRef.current.venues.find((item) => item.id === id)
          setSelection({ kind: "venue", id })
          captureClient("map_area_clicked", { kind: "venue", venue: id, area: venue?.postcode ?? "" })
        })
        for (const layer of ["venue-clusters", "venue-points"]) {
          created.on("mouseenter", layer, () => {
            created.getCanvas().style.setProperty("cursor", "pointer")
          })
          created.on("mouseleave", layer, () => {
            created.getCanvas().style.setProperty("cursor", "")
          })
        }
        const bounds = new maplibregl.LngLatBounds()
        const focused = current.focusRegionId
          ? current.districts.filter((district) => regionForPostcode(district.postcode)?.id === current.focusRegionId)
          : current.districts
        for (const district of focused) bounds.extend([district.longitude, district.latitude])
        if (!bounds.isEmpty()) created.fitBounds(bounds, { padding: 36, maxZoom: 12, duration: 0 })
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
      map?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const districts = map?.getSource("districts") as GeoJSONSource | undefined
    const venues = map?.getSource("venues") as GeoJSONSource | undefined
    if (districts) districts.setData(districtCollection(model))
    if (venues) venues.setData(venueCollection(model))
    if (!map || !districts) return
    if (focusRef.current === model.focusRegionId) return
    focusRef.current = model.focusRegionId
    fitMap(map, model)
  }, [model])

  function openRegion(id: string) {
    if (pathname === "/map") {
      const params = new URLSearchParams(window.location.search)
      params.set("region", id)
      router.replace(`/map?${params.toString()}`)
      return
    }
    if (pathname.startsWith("/region/")) {
      router.push(regionPath(id))
      return
    }
    router.push(`/map?region=${id}`)
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource("districts")) return
    for (const district of model.districts) {
      map.setFeatureState(
        { source: "districts", id: district.postcode },
        { selected: selection?.kind === "district" && selection.id === district.postcode },
      )
    }
    if (!map.getSource("venues")) return
    const next = selection?.kind === "venue" ? selection.id : null
    if (venueSelection.current) {
      map.setFeatureState({ source: "venues", id: venueSelection.current }, { selected: false })
    }
    if (next) map.setFeatureState({ source: "venues", id: next }, { selected: true })
    venueSelection.current = next
  }, [selection, model.districts, model.venues])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(window.location.search)
              params.delete("region")
              const query = params.toString()
              router.replace(query ? `/map?${query}` : "/map")
            }}
            className={
              model.focusRegionId
                ? "shrink-0 rounded-full bg-card px-3 py-1 text-sm ring-1 ring-border"
                : "shrink-0 rounded-full bg-foreground px-3 py-1 text-sm text-background"
            }
          >
            All London
          </button>
          {regions().map((region) => (
            <button
              key={region.id}
              type="button"
              onClick={() => openRegion(region.id)}
              className={
                model.focusRegionId === region.id
                  ? "shrink-0 rounded-full bg-foreground px-3 py-1 text-sm text-background"
                  : "shrink-0 rounded-full bg-card px-3 py-1 text-sm ring-1 ring-border"
              }
            >
              {region.name.replace(" London", "")}
            </button>
          ))}
        </div>
        <div ref={container} className="h-[58vh] min-h-72 w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border sm:h-[68vh]" />
        {mapProblem ? (
          <p className="text-sm text-muted-foreground">
            {mapProblem} The district and venue buttons still open the same details. No tile key is required.
          </p>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">{MAP_ATTRIBUTION}</p>
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">District</span>
            <select
              className="w-full rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/15"
              value={selection?.kind === "district" ? selection.id : ""}
              onChange={(event) => {
                const postcode = event.target.value
                if (postcode) selectPlace({ kind: "district", id: postcode })
              }}
            >
              <option value="">Choose a postcode</option>
              {model.districts.map((district) => (
                <option key={district.postcode} value={district.postcode}>
                  {district.postcode}
                  {district.artistCount > 0 ? ` · ${district.artistCount}` : ""}
                  {district.highlighted ? " · for you" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Venue</span>
            <select
              className="w-full rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/15"
              value={selection?.kind === "venue" ? selection.id : ""}
              onChange={(event) => {
                const id = event.target.value
                if (id) selectPlace({ kind: "venue", id })
              }}
            >
              <option value="">Choose a venue</option>
              {model.venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                  {venue.postcode ? ` · ${venue.postcode}` : ""}
                  {venue.highlighted ? " · for you" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <aside className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
        {selectedDistrict ? (
          <DistrictDetail district={selectedDistrict} listingsConfigured={model.listingsConfigured} />
        ) : selectedVenue ? (
          <VenueDetail venue={selectedVenue} listingsConfigured={model.listingsConfigured} />
        ) : (
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Choose a place</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Tap a district to open its region, then tap a district again for artists, venues, and gigs.
              Pins group together until you zoom in.
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
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">{district.postcode}</p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{district.label}</h2>
        {district.highlightReason ? <p className="text-sm font-medium text-accent">{district.highlightReason}</p> : null}
        <p className="text-sm text-muted-foreground">
          {district.artistCount} {district.artistCount === 1 ? "artist" : "artists"} in the catalogue
        </p>
      </div>
      <ArtistList artists={district.artists} />
      <VenueList district={district} />
      <GigList
        gigs={district.gigs}
        listingsConfigured={listingsConfigured}
        empty="No upcoming gigs were listed in this district."
        area={district.postcode}
      />
      <div className="flex flex-wrap gap-3">
        {district.playlistHref ? (
          <LinkButton href={district.playlistHref}>{"Make this area's playlist"}</LinkButton>
        ) : (
          <p className="text-sm text-muted-foreground">No catalogue artists are tied to this district yet.</p>
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
        <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">Venue</p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{venue.name}</h2>
        {venue.highlightReason ? <p className="text-sm font-medium text-accent">{venue.highlightReason}</p> : null}
        <p className="text-sm leading-6 text-muted-foreground">{venue.address}</p>
      </div>
      <GigList
        gigs={venue.gigs}
        listingsConfigured={listingsConfigured}
        empty="No upcoming gigs were listed at this venue."
        area={venue.postcode}
        venue={venue.name}
      />
      <LinkButton href={venue.playlistHref}>{"Playlist of who's playing here"}</LinkButton>
      <a className="block text-sm font-medium underline decoration-border underline-offset-4" href={venue.pageHref}>
        Open the venue page
      </a>
    </div>
  )
}

function VenueList({ district }: { district: MapDistrict }) {
  if (district.venueCount === 0) {
    return <p className="text-sm text-muted-foreground">No music venues are mapped in this district.</p>
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        Venues · {district.venueCount}
      </h3>
      <ul className="space-y-1 text-sm">
        {district.venues.map((venue) => (
          <li key={venue.id}>
            <a className="underline decoration-border underline-offset-4" href={venue.pageHref}>
              {venue.name}
            </a>
          </li>
        ))}
      </ul>
      {district.venueCount > district.venues.length ? (
        <a
          className="text-sm font-medium underline decoration-border underline-offset-4"
          href={`/venues?area=${encodeURIComponent(district.postcode)}`}
        >
          All {district.venueCount} venues in {district.postcode}
        </a>
      ) : null}
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
  area,
  venue,
}: {
  gigs: MapDistrict["gigs"]
  listingsConfigured: boolean
  empty: string
  area: string
  venue?: string
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
                    <a
                      className="underline decoration-border underline-offset-4 hover:text-link-hover"
                      href={gig.ticketUrl}
                      data-analytics="gig-ticket"
                      data-artist={gig.title}
                      data-venue={venue || gig.venueName}
                      data-area={area}
                    >
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

function mapColors() {
  return {
    fill: readCssColor("--map-fill", "#0c6291"),
    highlight: readCssColor("--map-fill-highlight", "#a63446"),
    line: readCssColor("--map-line", "#0c6291"),
    highlightLine: readCssColor("--map-line-highlight", "#a63446"),
    selectedLine: readCssColor("--map-line-selected", "#000004"),
    label: readCssColor("--map-label", "#000004"),
    labelBg: readCssColor("--map-label-bg", "#fbfef9"),
    pin: readCssColor("--map-pin", "#fbfef9"),
    pinHighlight: readCssColor("--map-pin-highlight", "#a63446"),
    pinBorder: readCssColor("--map-pin-border", "#000004"),
    cluster: readCssColor("--ink", "#000004"),
  }
}

function readCssColor(variable: string, fallback: string): string {
  const probe = document.createElement("span")
  probe.style.color = "transparent"
  document.documentElement.appendChild(probe)
  probe.style.color = `var(${variable}, transparent)`
  const value = getComputedStyle(probe).color
  probe.remove()
  if (!value || value === "rgba(0, 0, 0, 0)") return fallback
  return value
}

function mapFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (/webgl/i.test(message)) return "This browser cannot draw the map."
  if (/worker/i.test(message)) return "The map could not be drawn."
  if (/fail|tile|style|network|fetch/i.test(message)) return "Map tiles could not be loaded."
  return "The map could not be drawn."
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
        inFocus: !model.focusRegionId || regionForPostcode(feature.properties.postcode)?.id === model.focusRegionId ? 1 : 0,
      },
      geometry: feature.geometry,
    })),
  }
}

function fitMap(map: MapLibreMap, model: MapModel) {
  const focused = model.focusRegionId
    ? model.districts.filter((district) => regionForPostcode(district.postcode)?.id === model.focusRegionId)
    : model.districts
  if (focused.length === 0) return
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const district of focused) {
    west = Math.min(west, district.longitude)
    east = Math.max(east, district.longitude)
    south = Math.min(south, district.latitude)
    north = Math.max(north, district.latitude)
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 36, maxZoom: 12, duration: 400 },
  )
}

function venueCollection(model: MapModel) {
  return {
    type: "FeatureCollection" as const,
    features: model.venues.map((venue) => ({
      type: "Feature" as const,
      id: venue.id,
      properties: {
        id: venue.id,
        name: venue.name,
        highlighted: venue.highlighted ? 1 : 0,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [venue.longitude, venue.latitude] as [number, number],
      },
    })),
  }
}
