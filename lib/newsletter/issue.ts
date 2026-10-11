import { artists as catalogueArtists, playlistPath, postcodePath } from "@/lib/catalogue"
import { absoluteUrl } from "@/lib/newsletter/config"
import { areaLabel } from "@/lib/newsletter/areas"
import { addDays, londonDate } from "@/lib/geo"
import { formatGigWhen, selectGigs } from "@/lib/gigs/select"
import type { Gig, TaggedGig } from "@/lib/gigs/types"
import type { ArtistRecord } from "@/lib/types"
import { artistsForPostcode } from "@/lib/stats"
import { venueById, venuePath } from "@/lib/venues"

const GIG_CAP = 8
const SPOTLIGHT_CAP = 3
const LEGEND_BEFORE = 1990
const NEWER_FROM = 2005

export type NewsletterGigArtist = {
  name: string
  spotifyUrl: string
}

export type NewsletterGig = {
  id: string
  title: string
  when: string
  venueName: string
  venueUrl: string | null
  ticketUrl: string | null
  artists: NewsletterGigArtist[]
}

export type NewsletterSpotlight = {
  name: string
  kind: "legend" | "newer" | "local"
  spotifyUrl: string
}

export type NewsletterRoom = {
  name: string
  href: string | null
}

export type AreaSection = {
  code: string
  label: string
  gigs: NewsletterGig[]
  moreGigs: number
  spotlights: NewsletterSpotlight[]
  rooms: NewsletterRoom[]
  playlistUrl: string
  weekPlaylistUrl: string
  pageUrl: string
}

export type NewsletterIssue = {
  subject: string
  previewText: string
  weekKey: string
  fromLabel: string
  toLabel: string
  areas: AreaSection[]
  forYouUrl: string
  meaningful: boolean
}

export type PersonalNewsletter = NewsletterIssue & {
  unsubscribeUrl: string
  preferencesUrl: string
}

export function isoWeekKey(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, "0")}`
}

export function isThursdayMorningLondon(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const weekday = parts.find((part) => part.type === "weekday")?.value
  const hour = Number(parts.find((part) => part.type === "hour")?.value)
  return weekday === "Thu" && hour >= 7 && hour <= 10
}

export function issueSubject(codes: string[]): string {
  if (codes.length === 0) return "This week in southwest London"
  if (codes.length === 1) return `This week in ${codes[0]}`
  if (codes.length === 2) return `This week in ${codes[0]} and ${codes[1]}`
  return `This week in ${codes.slice(0, -1).join(", ")}, and ${codes[codes.length - 1]}`
}

export function openSpotifySearch(name: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(name)}`
}

export function buildIssue(input: {
  areas: string[]
  gigs: Gig[]
  now: Date
  siteUrl: string
  artists?: ArtistRecord[]
  /** Preview keeps a section when the week has no gigs. Sends omit those areas. */
  includeQuiet?: boolean
}): NewsletterIssue {
  const from = londonDate(input.now)
  const weekKey = isoWeekKey(from)
  const weekNumber = Number(weekKey.slice(weekKey.lastIndexOf("W") + 1)) || 0
  const artists = input.artists ?? catalogueArtists()
  const sections: AreaSection[] = []
  for (const code of input.areas) {
    const week = selectGigs(input.gigs, { kind: "postcode", postcode: code }, "week", input.now)
    if (week.length === 0 && !input.includeQuiet) continue
    sections.push(sectionFor(code, week, weekNumber, artists, input.siteUrl))
  }
  const codes = sections.filter((section) => section.gigs.length > 0).map((section) => section.code)
  const meaningful = codes.length > 0
  const subject = issueSubject(meaningful ? codes : input.areas.slice(0, 1))
  const firstGig = sections.find((section) => section.gigs.length > 0)?.gigs[0]
  return {
    subject,
    previewText: firstGig ? `${firstGig.title} at ${firstGig.venueName}` : "No gigs listed for the next 7 days.",
    weekKey,
    fromLabel: formatDay(from),
    toLabel: formatDay(addDays(from, 6)),
    areas: sections,
    forYouUrl: forYouUrl(input.siteUrl, codes.length === 1 ? codes[0] : null),
    meaningful,
  }
}

export function forYouUrl(site: string, postcode: string | null): string {
  if (postcode) return absoluteUrl(site, postcodePath(postcode))
  return absoluteUrl(site, "/gigs?sort=for-you")
}

function sectionFor(
  code: string,
  week: TaggedGig[],
  weekNumber: number,
  artists: ArtistRecord[],
  site: string,
): AreaSection {
  const shown = week.slice(0, GIG_CAP)
  return {
    code,
    label: areaLabel(code),
    gigs: shown.map((gig) => presentGig(gig, site)),
    moreGigs: Math.max(0, week.length - shown.length),
    spotlights: spotlightArtists(code, weekNumber, artists),
    rooms: roomsFor(shown, site),
    playlistUrl: absoluteUrl(site, playlistPath({ kind: "postcode", postcode: code })),
    weekPlaylistUrl: absoluteUrl(site, playlistPath({ kind: "week", focus: { postcode: code } })),
    pageUrl: absoluteUrl(site, postcodePath(code)),
  }
}

function presentGig(gig: TaggedGig, site: string): NewsletterGig {
  const names = gig.artistNames.filter(Boolean).slice(0, 4)
  const title = names.length > 0 ? names.join(", ") : gig.title
  const venue = gig.venueId ? venueById(gig.venueId) : null
  return {
    id: gig.id,
    title,
    when: formatGigWhen(gig),
    venueName: venue?.name ?? gig.venueName,
    venueUrl: venue ? absoluteUrl(site, venuePath(venue.id)) : null,
    ticketUrl: httpsUrl(gig.ticketUrl),
    artists: (names.length > 0 ? names : [gig.title]).filter(Boolean).map((name) => ({
      name,
      spotifyUrl: openSpotifySearch(name),
    })),
  }
}

function roomsFor(gigs: TaggedGig[], site: string): NewsletterRoom[] {
  const seen = new Set<string>()
  const rooms: NewsletterRoom[] = []
  for (const gig of gigs) {
    const venue = gig.venueId ? venueById(gig.venueId) : null
    const name = venue?.name ?? gig.venueName
    const key = name.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    rooms.push({ name, href: venue ? absoluteUrl(site, venuePath(venue.id)) : null })
  }
  return rooms.slice(0, 6)
}

export function spotlightArtists(code: string, weekNumber: number, artists: ArtistRecord[]): NewsletterSpotlight[] {
  const local = artistsForPostcode(artists, code).slice().sort((left, right) => left.name.localeCompare(right.name, "en"))
  const legends = local.filter(isLegend)
  const newer = local.filter(isNewer)
  const rest = local.filter((artist) => !isLegend(artist) && !isNewer(artist))
  const legendCount = weekNumber % 2 === 0 ? 1 : 2
  const newerCount = SPOTLIGHT_CAP - legendCount
  const used = new Set<string>()
  const picked = [
    ...takeRotated(legends, weekNumber, legendCount, used),
    ...takeRotated(newer, weekNumber + 1, newerCount, used),
  ]
  if (picked.length < SPOTLIGHT_CAP) picked.push(...takeRotated(legends, weekNumber + picked.length, SPOTLIGHT_CAP - picked.length, used))
  if (picked.length < SPOTLIGHT_CAP) picked.push(...takeRotated(newer, weekNumber + picked.length, SPOTLIGHT_CAP - picked.length, used))
  if (picked.length < SPOTLIGHT_CAP) picked.push(...takeRotated(rest, weekNumber, SPOTLIGHT_CAP - picked.length, used))
  return picked.map((artist) => ({
    name: artist.name,
    kind: isLegend(artist) ? "legend" : isNewer(artist) ? "newer" : "local",
    spotifyUrl: openSpotifySearch(artist.name),
  }))
}

function takeRotated(pool: ArtistRecord[], offset: number, count: number, used: Set<string>): ArtistRecord[] {
  if (count <= 0 || pool.length === 0) return []
  const out: ArtistRecord[] = []
  for (let index = 0; index < pool.length && out.length < count; index += 1) {
    const artist = pool[(offset + index) % pool.length]
    if (used.has(artist.name)) continue
    used.add(artist.name)
    out.push(artist)
  }
  return out
}

function isLegend(artist: ArtistRecord): boolean {
  if (artist.life_span?.ended) return true
  const year = beginYear(artist)
  return year !== null && year < LEGEND_BEFORE
}

function isNewer(artist: ArtistRecord): boolean {
  const year = beginYear(artist)
  return year !== null && year >= NEWER_FROM
}

function beginYear(artist: ArtistRecord): number | null {
  const begin = artist.life_span?.begin
  if (!begin) return null
  const year = Number(begin.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}
