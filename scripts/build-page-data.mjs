import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "data", "pages")

const REGION_AREAS = [
  ["central", "Central London", ["EC", "WC"]],
  ["north", "North London", ["N"]],
  ["northwest", "Northwest London", ["NW"]],
  ["west", "West London", ["W"]],
  ["southwest", "Southwest London", ["SW"]],
  ["southeast", "Southeast London", ["SE"]],
  ["east", "East London", ["E"]],
  ["outer-north", "Outer North", ["EN"]],
  ["outer-northwest", "Outer Northwest", ["HA"]],
  ["outer-west", "Outer West", ["UB"]],
  ["outer-southwest", "Outer Southwest", ["TW", "KT"]],
  ["outer-south", "Outer South", ["CR", "SM"]],
  ["outer-southeast", "Outer Southeast", ["BR", "DA"]],
  ["outer-east", "Outer East", ["IG", "RM"]],
]

const BOROUGH_POSTCODES = {
  "richmond-borough": ["SW13", "SW14", "TW9", "TW10", "TW1"],
  "wandsworth-borough": ["SW15", "SW18", "SW12"],
  "kingston-borough": ["KT1", "KT2"],
}

const AREA_TO_REGION = new Map(REGION_AREAS.flatMap(([id, name, codes]) => codes.map((code) => [code, { id, name }])))

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function postcodeArea(code) {
  return /^[A-Z]+/.exec(String(code).toUpperCase())?.[0] ?? String(code).toUpperCase()
}

function regionFor(code) {
  return AREA_TO_REGION.get(postcodeArea(code)) ?? null
}

function inRegion(code, regionId) {
  return regionFor(code)?.id === regionId
}

function slugify(name) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return base || "artist"
}

function artistSlug(artist, used) {
  const base = artist.mbid || (artist.wikidata_qid ? artist.wikidata_qid.toLowerCase() : slugify(artist.name))
  let slug = base
  let n = 2
  while (used.has(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  used.add(slug)
  return slug
}

function placePostcodes(place) {
  if (BOROUGH_POSTCODES[place.id]) return BOROUGH_POSTCODES[place.id]
  return place.postcodes ?? []
}

function artistInRegion(artist, regionId) {
  return artist.locality.some(
    (place) => place.precision === "place" && place.postcodes.some((code) => inRegion(code, regionId)),
  )
}

function hasPostcode(artist, code) {
  return artist.locality.some((place) => place.precision === "place" && place.postcodes.includes(code))
}

function byName(left, right) {
  return left.name.localeCompare(right.name, "en")
}

function roomOf(venue) {
  return {
    id: venue.id,
    name: venue.name,
    type: venue.type,
    postcode: venue.postcode,
    postcodeDistrict: venue.postcodeDistrict ?? null,
  }
}

function venueInRegion(venue, regionId) {
  if (venue.postcodeDistrict && inRegion(venue.postcodeDistrict, regionId)) return true
  return (venue.postcodes ?? []).some((code) => inRegion(code, regionId))
}

function write(relative, value) {
  const file = join(outDir, relative)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}

const catalogue = readJson(join(root, "data", "artists.json"))
const venueFile = readJson(join(root, "data", "venues.json"))
const districts = readJson(join(root, "data", "london-districts.json")).map((row) => row.postcode)
const places = catalogue.places
const artists = catalogue.artists
const venues = venueFile.venues

const usedSlugs = new Set()
const slugByKey = new Map()
for (const artist of artists) {
  const key = artist.mbid || artist.wikidata_qid || artist.name
  slugByKey.set(artist, artistSlug(artist, usedSlugs))
  if (!slugByKey.get(key)) slugByKey.set(key, slugByKey.get(artist))
}

function slugFor(artist) {
  return slugByKey.get(artist)
}

function withSlug(artist) {
  return { ...artist, slug: slugFor(artist) }
}

const postcodeSet = [...districts]
for (const place of places) {
  for (const code of place.postcodes ?? []) {
    if (!postcodeSet.includes(code)) postcodeSet.push(code)
  }
}

let withPlace = 0
let boroughOnly = 0
for (const artist of artists) {
  const place = artist.locality.some((item) => item.precision === "place")
  const borough = artist.locality.some((item) => item.precision === "borough")
  if (place) withPlace += 1
  else if (borough) boroughOnly += 1
}

const regionSummaries = REGION_AREAS.map(([id, name]) => {
  const codes = districts.filter((code) => inRegion(code, id))
  return {
    id,
    name,
    districts: codes.length,
    artists: artists.filter((artist) => artistInRegion(artist, id)).length,
    venues: venues.filter((venue) => venueInRegion(venue, id)).length,
  }
})

const boroughs = places
  .filter((place) => place.precision === "borough")
  .map((place) => ({
    id: place.id,
    name: place.name,
    artistCount: artists.filter((artist) => artist.locality.some((item) => item.place_id === place.id)).length,
  }))

const curatedVenues = venues
  .filter((venue) => venue.curated)
  .map((venue) => ({ id: venue.id, name: venue.name, postcode: venue.postcode, note: venue.note }))

const placePostcodeMap = {}
for (const place of places) {
  const allowed = new Set(postcodeSet)
  placePostcodeMap[place.id] = placePostcodes(place).filter((code) => allowed.has(code))
}

const newsletterAreas = postcodeSet.map((code) => {
  const region = regionFor(code)
  const names = places
    .filter((place) => place.precision === "place" && place.postcodes.includes(code))
    .map((place) => place.name)
  return {
    code,
    label: names.length > 0 ? names.join(" & ") : code,
    regionId: region?.id ?? "london",
    regionName: region?.name ?? "London",
  }
})

const tasteIndex = artists.map((artist) => ({
  slug: slugFor(artist),
  name: artist.name,
  tags: artist.tags.slice(0, 8),
  postcodes: [
    ...new Set(artist.locality.filter((item) => item.precision === "place").flatMap((item) => item.postcodes)),
  ],
  placeIds: [...new Set(artist.locality.map((item) => item.place_id))],
}))

const venueMatch = venues.map((venue) => ({
  id: venue.id,
  name: venue.name,
  aliases: venue.aliases ?? [],
  postcode: venue.postcode,
  postcodeDistrict: venue.postcodeDistrict ?? null,
  latitude: venue.latitude,
  longitude: venue.longitude,
  postcodes: venue.postcodes ?? [],
  areaIds: venue.areaIds ?? [],
}))

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

write("home.json", {
  generated_at: catalogue.generated_at,
  artist_count: catalogue.artist_count,
  precision: { withPlace, boroughOnly },
  regions: regionSummaries,
  boroughs,
  curatedVenues,
})
write("manifest.json", {
  regions: REGION_AREAS.map(([id]) => id),
  areas: places.map((place) => place.id),
  postcodes: postcodeSet.map((code) => code.toLowerCase()),
  venues: venues.map((venue) => venue.id),
  artistCount: artists.length,
})
write("artist-index.json", artists.map((artist) => ({ slug: slugFor(artist), name: artist.name })))
write("taste-index.json", tasteIndex)
write("place-postcodes.json", Object.fromEntries(places.map((place) => [place.id, place.postcodes ?? []])))
write("venue-match.json", venueMatch)
write("newsletter.json", { postcodes: postcodeSet, areas: newsletterAreas, placePostcodes: placePostcodeMap })

for (const [id] of REGION_AREAS) {
  const local = artists.filter((artist) => artistInRegion(artist, id)).sort(byName)
  const codes = districts.filter((code) => inRegion(code, id))
  write(`regions/${id}.json`, {
    id,
    artistCount: local.length,
    districts: codes.map((code) => ({
      code,
      artistCount: local.filter((artist) => hasPostcode(artist, code)).length,
    })),
    artists: local.map((artist) => ({
      slug: slugFor(artist),
      name: artist.name,
      life_span: artist.life_span,
      postcodes: [
        ...new Set(artist.locality.filter((item) => item.precision === "place").flatMap((item) => item.postcodes)),
      ],
    })),
    venues: venues
      .filter((venue) => venueInRegion(venue, id))
      .slice(0, 12)
      .map(roomOf),
  })
}

for (const place of places) {
  const regionIds = [...new Set((place.postcodes ?? []).map((code) => regionFor(code)?.id).filter(Boolean))]
  const local = artists
    .filter((artist) => artist.locality.some((item) => item.place_id === place.id))
    .sort(byName)
    .map(withSlug)
  const rooms = venues.filter((venue) =>
    place.precision === "borough"
      ? venue.boroughId === place.id
      : (venue.areaIds ?? []).includes(place.id) || (venue.postcodes ?? []).some((code) => place.postcodes.includes(code)),
  )
  write(`areas/${place.id}.json`, {
    id: place.id,
    name: place.name,
    precision: place.precision,
    note: place.note,
    postcodes: place.postcodes ?? [],
    regionId: regionIds.length === 1 ? regionIds[0] : null,
    artists: local,
    rooms: rooms.slice(0, 12).map(roomOf),
  })
}

for (const code of postcodeSet) {
  const areas = places.filter((place) => (place.postcodes ?? []).includes(code))
  const local = artists.filter((artist) => hasPostcode(artist, code)).sort(byName).map(withSlug)
  const rooms = venues.filter(
    (venue) =>
      venue.postcodeDistrict === code ||
      venue.boroughId === code ||
      (venue.postcodes ?? []).includes(code) ||
      (venue.areaIds ?? []).includes(code),
  )
  write(`postcodes/${code.toLowerCase()}.json`, {
    code,
    regionId: regionFor(code)?.id ?? null,
    placeNames: areas.map((place) => place.name),
    places: areas.map((place) => ({
      href: `/area/${place.id}`,
      label: place.postcodes.length > 0 ? `${place.name} · ${place.postcodes.join(", ")}` : place.name,
    })),
    artists: local,
    rooms: rooms.slice(0, 12).map(roomOf),
  })
}

const placeName = new Map(places.map((place) => [place.id, place.name]))
for (const venue of venues) {
  const region = regionFor(venue.postcodeDistrict || venue.postcode)
  write(`venues/${venue.id}.json`, {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    postcode: venue.postcode,
    postcodeDistrict: venue.postcodeDistrict ?? null,
    borough: venue.borough ?? null,
    boroughId: venue.boroughId ?? null,
    type: venue.type,
    grassroots: Boolean(venue.grassroots),
    capacity: venue.capacity ?? null,
    note: venue.note,
    website: venue.website ?? null,
    regionId: region?.id ?? null,
    postcodeLinks: (venue.postcodes ?? []).map((code) => ({
      code,
      href: postcodeSet.includes(code) ? `/postcode/${code.toLowerCase()}` : null,
    })),
    areaLinks: (venue.areaIds ?? [])
      .filter((id) => placeName.has(id))
      .map((id) => ({ id, name: placeName.get(id) })),
  })
}

for (const artist of artists) {
  const slug = slugFor(artist)
  write(`artists/${slug}.json`, { slug, artist: withSlug(artist) })
}

console.log(
  `page data: ${artists.length} artists, ${places.length} areas, ${postcodeSet.length} postcodes, ${venues.length} venues`,
)
