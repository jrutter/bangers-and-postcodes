import { describe, expect, it } from "vitest"

import {
  activeNow,
  filterArtists,
  matchesEra,
  pageArtists,
  parseEra,
  playlistCandidates,
  showcaseArtists,
  eraScope,
} from "@/lib/era"
import type { ArtistRecord } from "@/lib/types"

const NOW = new Date("2026-10-11T00:00:00Z")

function artist(name: string, begin: string | null, end: string | null, ended: boolean | null = null): ArtistRecord {
  return {
    mbid: name,
    wikidata_qid: null,
    name,
    sort_name: name,
    type: "Group",
    disambiguation: null,
    country: "GB",
    life_span: { begin, end, ended },
    tags: [],
    locality: [],
  }
}

describe("era filter", () => {
  const sixties = artist("Dusty", "1963", "1999", true)
  const stillGoing = artist("Now Band", "1968", null, false)
  const current = artist("New Band", "2021", null, false)
  const unknown = artist("Unknown", null, null, null)

  it("parses decade and active-now values", () => {
    expect(parseEra("1970")).toBe(1970)
    expect(parseEra("now")).toBe("now")
    expect(parseEra("nope")).toBeNull()
    expect(eraScope(1960)).toBe("in the 60s")
    expect(eraScope("now")).toBe("active now")
    expect(eraScope("earlier")).toBe("from before the 1950s")
  })

  it("treats an open span as still active and a closed span as its years", () => {
    expect(matchesEra(sixties, 1960, NOW)).toBe(true)
    expect(matchesEra(sixties, 2020, NOW)).toBe(false)
    expect(matchesEra(stillGoing, 2020, NOW)).toBe(true)
    expect(activeNow(stillGoing, NOW)).toBe(true)
    expect(activeNow(sixties, NOW)).toBe(false)
    expect(activeNow(unknown, NOW)).toBe(false)
    expect(filterArtists([sixties, stillGoing, current, unknown], "now", NOW).map((item) => item.name)).toEqual([
      "Now Band",
      "New Band",
    ])
  })

  it("mixes early and current artists and caps playlist candidates across decades", () => {
    const list = [sixties, stillGoing, current, unknown]
    const shown = showcaseArtists(list, 4, NOW).map((item) => item.name)
    expect(shown[0]).toBe("Dusty")
    expect(shown).toContain("New Band")
    const many = Array.from({ length: 80 }, (_, index) => artist(`A${index}`, index < 40 ? "1962" : "2019", null, false))
    const sample = playlistCandidates(many, 10)
    expect(sample).toHaveLength(10)
    expect(sample.some((item) => item.life_span?.begin === "1962")).toBe(true)
    expect(sample.some((item) => item.life_span?.begin === "2019")).toBe(true)
    expect(pageArtists(many, 2, 24).items).toHaveLength(24)
    expect(pageArtists(many, 99, 24).page).toBe(4)
  })
})
