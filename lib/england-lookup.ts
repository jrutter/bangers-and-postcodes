import {
  classifyChain,
  ENGLAND_QID,
  NORTHERN_IRELAND_QID,
  SCOTLAND_QID,
  UK_QID,
  WALES_QID,
  type AreaSignal,
  type OriginHit,
} from "@/lib/england"
import { namesMatch } from "@/lib/names"

export const LOOKUP_USER_AGENT = "BangersAndPostcodes/0.3 (https://github.com/jrutter/bangers-and-postcodes)"
const WIKIDATA = "https://query.wikidata.org/sparql"
const MUSICBRAINZ = "https://musicbrainz.org/ws/2"
const NATIONS = [ENGLAND_QID, SCOTLAND_QID, WALES_QID, NORTHERN_IRELAND_QID]

export type WikidataPlaceRow = {
  spotifyId: string | null
  name: string | null
  itemQid: string | null
  placeQid: string | null
  placeLabel: string | null
  kind: "birth" | "formation" | "origin" | null
  nationQid: string | null
  countryQid: string | null
}

export type LookupDeps = {
  fetch: typeof fetch
  limit: <T>(task: () => Promise<T>) => Promise<T>
}

type MbArea = {
  id?: string
  name?: string
  type?: string
  "iso-3166-1-codes"?: string[]
  "iso-3166-2-codes"?: string[]
}

type MbArtist = {
  id?: string
  name?: string
  score?: number
  country?: string
  area?: MbArea
  "begin-area"?: MbArea
}

/** Spaces MusicBrainz calls. The first call does not wait. */
export function createRateLimiter(intervalMs: number, deps?: { now?: () => number; sleep?: (ms: number) => Promise<void> }) {
  const now = deps?.now ?? (() => Date.now())
  const sleep = deps?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let nextAt = 0
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    const start = now()
    const wait = Math.max(0, nextAt - start)
    nextAt = Math.max(nextAt, start) + intervalMs
    if (wait > 0) await sleep(wait)
    return task()
  }
}

export function parseWikidataRows(payload: unknown): WikidataPlaceRow[] {
  const bindings = bindingsOf(payload)
  return bindings.map((row) => ({
    spotifyId: text(row.spotify),
    name: text(row.name),
    itemQid: qid(text(row.item)),
    placeQid: qid(text(row.place)),
    placeLabel: text(row.placeLabel),
    kind: kindOf(text(row.kind)),
    nationQid: qid(text(row.nation)),
    countryQid: qid(text(row.country)),
  }))
}

/** A definitive England or elsewhere hit, or null when the rows are not enough and another source should run. */
export function decideWikidata(rows: WikidataPlaceRow[]): OriginHit | null {
  if (rows.length === 0) return null
  const ranked = rows
    .map((row) => ({ row, status: classifyChain(signalsFromRow(row)) }))
    .sort((left, right) => specificity(right.row) - specificity(left.row))
  const england = ranked.find((entry) => entry.status === "england")
  if (england) return hitFromRow(england.row, "england")
  const elsewhere = ranked.find((entry) => entry.status === "elsewhere")
  if (elsewhere) return hitFromRow(elsewhere.row, "elsewhere")
  return null
}

export function decideNameRows(rows: WikidataPlaceRow[]): OriginHit | "continue" {
  const items = new Set(rows.map((row) => row.itemQid).filter((qid): qid is string => Boolean(qid)))
  if (items.size > 1) {
    return {
      status: "unknown",
      place: null,
      source: "Wikidata name match",
      qid: null,
      areaMbid: null,
    }
  }
  return decideWikidata(rows) ?? "continue"
}

/**
 * MusicBrainz URL relationship first, then a Wikidata place for that area, then a name search.
 * Country code GB on its own stays unknown.
 */
export async function lookupArtistOrigin(
  artist: { id: string; name: string },
  deps: LookupDeps,
): Promise<OriginHit> {
  const byUrl = await musicBrainzArtists(deps, `url:"https://open.spotify.com/artist/${artist.id}"`)
  const linked = byUrl.find((candidate) => candidate.id) ?? null
  if (linked) {
    const resolved = await resolveMbArtist(linked, deps, "id")
    if (resolved) return resolved
  }
  const byName = await musicBrainzArtists(deps, `artist:"${escapeQuery(artist.name)}"`)
  const exact = byName.filter((candidate) => candidate.name && namesMatch(candidate.name, artist.name))
  if (exact.length > 1) {
    return { status: "unknown", place: null, source: "MusicBrainz name match", qid: null, areaMbid: null }
  }
  if (exact.length === 1) {
    const resolved = await resolveMbArtist(exact[0], deps, "name")
    if (resolved) return resolved
  }
  return { status: "unknown", place: null, source: linked ? "MusicBrainz area" : null, qid: null, areaMbid: null }
}

export async function fetchWikidataBySpotifyIds(fetchImpl: typeof fetch, ids: string[]): Promise<Map<string, WikidataPlaceRow[]>> {
  const safe = ids.filter(spotifyIdOk)
  const grouped = new Map<string, WikidataPlaceRow[]>()
  for (const chunk of chunks(safe, 40)) {
    const values = chunk.map((id) => `"${id}"`).join(" ")
    const query = `SELECT ?spotify ?place ?placeLabel ?kind ?nation ?country WHERE {
      VALUES ?spotify { ${values} }
      ?item wdt:P1902 ?spotify .
      OPTIONAL {
        { ?item wdt:P19 ?place . BIND("birth" AS ?kind) }
        UNION { ?item wdt:P740 ?place . BIND("formation" AS ?kind) }
        UNION { ?item wdt:P495 ?place . FILTER(?place = wd:Q21) BIND("origin" AS ?kind) }
      }
      OPTIONAL { ?place wdt:P17 ?country }
      OPTIONAL { ?place wdt:P131* ?nation . FILTER(?nation IN (${NATIONS.map((qid) => `wd:${qid}`).join(", ")})) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }`
    const rows = parseWikidataRows(await sparql(fetchImpl, query))
    for (const row of rows) {
      if (!row.spotifyId) continue
      const list = grouped.get(row.spotifyId) ?? []
      list.push(row)
      grouped.set(row.spotifyId, list)
    }
    for (const id of chunk) if (!grouped.has(id)) grouped.set(id, [])
  }
  return grouped
}

export async function fetchWikidataByNames(fetchImpl: typeof fetch, names: string[]): Promise<Map<string, WikidataPlaceRow[]>> {
  const safe = [...new Set(names.map((name) => name.trim()).filter((name) => name.length > 0 && name.length <= 80 && !/["\\]/.test(name)))]
  const grouped = new Map<string, WikidataPlaceRow[]>()
  for (const chunk of chunks(safe, 20)) {
    const values = chunk.map((name) => `"${name}"`).join(" ")
    const query = `SELECT ?name ?item ?place ?placeLabel ?kind ?nation ?country WHERE {
      VALUES ?name { ${values} }
      ?item rdfs:label ?name . FILTER(lang(?name) = "en")
      ?item wdt:P31 ?class .
      ?class wdt:P279* ?root . FILTER(?root IN (wd:Q5, wd:Q215380))
      OPTIONAL {
        { ?item wdt:P19 ?place . BIND("birth" AS ?kind) }
        UNION { ?item wdt:P740 ?place . BIND("formation" AS ?kind) }
        UNION { ?item wdt:P495 ?place . FILTER(?place = wd:Q21) BIND("origin" AS ?kind) }
      }
      OPTIONAL { ?place wdt:P17 ?country }
      OPTIONAL { ?place wdt:P131* ?nation . FILTER(?nation IN (${NATIONS.map((qid) => `wd:${qid}`).join(", ")})) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }`
    const rows = parseWikidataRows(await sparql(fetchImpl, query))
    for (const row of rows) {
      const key = row.name?.trim().toLowerCase()
      if (!key) continue
      const list = grouped.get(key) ?? []
      list.push(row)
      grouped.set(key, list)
    }
  }
  return grouped
}

export function signalsFromRow(row: WikidataPlaceRow): AreaSignal[] {
  const signals: AreaSignal[] = []
  if (row.placeQid || row.placeLabel) {
    signals.push({ qid: row.placeQid, name: row.placeLabel, type: row.placeQid === ENGLAND_QID ? "Subdivision" : null })
  }
  if (row.nationQid) signals.push({ qid: row.nationQid, type: "Subdivision" })
  if (row.countryQid === UK_QID) signals.push({ qid: UK_QID, name: "United Kingdom", type: "Country", iso31661: ["GB"] })
  else if (row.countryQid && !NATIONS.includes(row.countryQid)) signals.push({ qid: row.countryQid, foreign: true, type: "Country" })
  else if (row.countryQid) signals.push({ qid: row.countryQid, type: "Subdivision" })
  return signals
}

function hitFromRow(row: WikidataPlaceRow, status: "england" | "elsewhere"): OriginHit {
  const specific = row.placeLabel && row.placeLabel.toLowerCase() !== "england" ? row.placeLabel : null
  return {
    status,
    place: status === "england" ? specific || "England" : specific || row.placeLabel,
    source: sourceForKind(row.kind),
    qid: row.placeQid,
    areaMbid: null,
  }
}

function sourceForKind(kind: WikidataPlaceRow["kind"]): string {
  if (kind === "birth") return "Wikidata place of birth"
  if (kind === "formation") return "Wikidata location of formation"
  if (kind === "origin") return "Wikidata country of origin"
  return "Wikidata"
}

function specificity(row: WikidataPlaceRow): number {
  const label = row.placeLabel?.toLowerCase()
  if (label && label !== "england" && label !== "united kingdom") return 2
  return 1
}

async function resolveMbArtist(artist: MbArtist, deps: LookupDeps, via: "id" | "name"): Promise<OriginHit | null> {
  const areas = [artist["begin-area"], artist.area].filter((area): area is MbArea => Boolean(area?.id || area?.name))
  const chain: AreaSignal[] = []
  for (const area of areas) {
    chain.push(signalFromMb(area))
    if (area.id) chain.push(...(await parentsFor(area.id, deps)))
  }
  if (artist.country && artist.country !== "GB") chain.push({ iso31661: [artist.country], foreign: true, type: "Country" })
  if (artist.country === "GB") chain.push({ iso31661: ["GB"], name: "United Kingdom", type: "Country" })
  const status = classifyChain(chain)
  if (status === "unknown" && chain.length === 0) return null
  const placeArea = areas.find((area) => area.name && !/^(england|united kingdom)$/i.test(area.name))
  const source =
    via === "name"
      ? "MusicBrainz name match"
      : artist["begin-area"]?.name
        ? "MusicBrainz begin area"
        : "MusicBrainz area"
  if (status === "unknown") {
    return { status: "unknown", place: placeArea?.name ?? null, source, qid: null, areaMbid: placeArea?.id ?? artist.area?.id ?? null }
  }
  return {
    status,
    place: status === "england" ? placeArea?.name || "England" : placeArea?.name ?? artist.area?.name ?? null,
    source,
    qid: null,
    areaMbid: placeArea?.id ?? artist.area?.id ?? null,
  }
}

async function parentsFor(areaId: string, deps: LookupDeps): Promise<AreaSignal[]> {
  const wiki = await wikidataArea(deps.fetch, areaId)
  if (wiki.length > 0) return wiki
  const chain: AreaSignal[] = []
  let current = areaId
  const seen = new Set<string>([areaId])
  for (let hop = 0; hop < 4; hop += 1) {
    const area = await deps.limit(() => musicBrainzArea(deps.fetch, current))
    const parent = parentId(area)
    const parentIdValue = parent?.id
    if (!parent || !parentIdValue || seen.has(parentIdValue)) break
    seen.add(parentIdValue)
    chain.push(signalFromMb(parent))
    if (nationReady(chain)) break
    current = parentIdValue
  }
  return chain
}

function nationReady(chain: AreaSignal[]): boolean {
  return classifyChain(chain) !== "unknown"
}

async function wikidataArea(fetchImpl: typeof fetch, areaId: string): Promise<AreaSignal[]> {
  if (!/^[0-9a-f-]{36}$/i.test(areaId)) return []
  const query = `SELECT ?nation WHERE {
    ?place wdt:P982 "${areaId}" .
    ?place wdt:P131* ?nation .
    FILTER(?nation IN (${NATIONS.map((qid) => `wd:${qid}`).join(", ")}))
  }`
  try {
    const rows = parseWikidataRows(await sparql(fetchImpl, query))
    return rows
      .map((row) => row.nationQid)
      .filter((qid): qid is string => Boolean(qid))
      .map((qid) => ({ qid, type: "Subdivision" }))
  } catch {
    return []
  }
}

async function musicBrainzArtists(deps: LookupDeps, query: string): Promise<MbArtist[]> {
  const payload = await deps.limit(() =>
    getJson(deps.fetch, `${MUSICBRAINZ}/artist?query=${encodeURIComponent(query)}&fmt=json&limit=5`),
  )
  const artists = payload && typeof payload === "object" ? (payload as { artists?: unknown }).artists : null
  return Array.isArray(artists) ? (artists as MbArtist[]) : []
}

async function musicBrainzArea(fetchImpl: typeof fetch, id: string): Promise<MbArea & { relations?: { type?: string; direction?: string; area?: MbArea }[] }> {
  const payload = await getJson(fetchImpl, `${MUSICBRAINZ}/area/${encodeURIComponent(id)}?inc=area-rels&fmt=json`)
  return (payload && typeof payload === "object" ? payload : {}) as MbArea & {
    relations?: { type?: string; direction?: string; area?: MbArea }[]
  }
}

function parentId(area: { relations?: { type?: string; direction?: string; area?: MbArea }[] }): MbArea | null {
  const relations = Array.isArray(area.relations) ? area.relations : []
  const parent = relations.find((relation) => relation.type === "part of" && relation.direction === "backward" && relation.area?.id)
  return parent?.area ?? null
}

function signalFromMb(area: MbArea): AreaSignal {
  return {
    id: area.id ?? null,
    name: area.name ?? null,
    type: area.type ?? null,
    iso31661: area["iso-3166-1-codes"] ?? null,
    iso31662: area["iso-3166-2-codes"] ?? null,
  }
}

async function sparql(fetchImpl: typeof fetch, query: string): Promise<unknown> {
  const response = await fetchImpl(WIKIDATA, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/sparql-query",
      "User-Agent": LOOKUP_USER_AGENT,
    },
    body: query,
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Wikidata lookup failed (${response.status}).`)
  return response.json()
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": LOOKUP_USER_AGENT },
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`MusicBrainz lookup failed (${response.status}).`)
  return response.json()
}

function bindingsOf(payload: unknown): Record<string, { value?: string }>[] {
  if (!payload || typeof payload !== "object") return []
  const results = (payload as { results?: { bindings?: unknown } }).results
  const bindings = results?.bindings
  if (!Array.isArray(bindings)) return []
  return bindings.filter((row): row is Record<string, { value?: string }> => Boolean(row) && typeof row === "object")
}

function text(value: { value?: string } | undefined): string | null {
  return value && typeof value.value === "string" && value.value.trim() ? value.value.trim() : null
}

function qid(value: string | null): string | null {
  if (!value) return null
  const match = /Q\d+$/.exec(value)
  return match?.[0] ?? null
}

function kindOf(value: string | null): WikidataPlaceRow["kind"] {
  if (value === "birth" || value === "formation" || value === "origin") return value
  return null
}

function escapeQuery(value: string): string {
  return value.replace(/[\\"]/g, " ").replace(/\s+/g, " ").trim()
}

function spotifyIdOk(id: string): boolean {
  return /^[A-Za-z0-9]{10,40}$/.test(id)
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}
