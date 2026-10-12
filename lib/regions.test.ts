import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { postcodeArea } from "@/lib/districts"
import { artistInRegion, districtInRegion, postcodeAreas, regionById, regionForPostcode, regions } from "@/lib/regions"

describe("London regions", () => {
  it("assigns every Greater London district to one region", () => {
    const file = JSON.parse(readFileSync(new URL("../data/london-districts.json", import.meta.url), "utf8")) as {
      postcode: string
    }[]
    const seen = new Map<string, number>()
    for (const district of file) {
      const region = regionForPostcode(district.postcode)
      expect(region, district.postcode).not.toBeNull()
      seen.set(region!.id, (seen.get(region!.id) ?? 0) + 1)
    }
    expect(file.some((district) => postcodeArea(district.postcode) === "WD")).toBe(false)
    for (const region of regions()) expect(seen.get(region.id) ?? 0).toBeGreaterThan(0)
  })

  it("keeps postcode areas unambiguous", () => {
    const codes = postcodeAreas()
    expect(new Set(codes).size).toBe(codes.length)
    expect(regionForPostcode("SW15")?.id).toBe("southwest")
    expect(regionForPostcode("EC2")?.id).toBe("central")
    expect(regionForPostcode("KT1")?.id).toBe("outer-southwest")
    expect(regionById("east")?.areas.map((area) => area.code)).toEqual(["E"])
    expect(districtInRegion("N17", "north")).toBe(true)
    expect(districtInRegion("N17", "east")).toBe(false)
  })

  it("counts a place-level artist in the region and leaves a borough-only artist out", () => {
    const precise = {
      locality: [{ precision: "place", postcodes: ["SW15"] }],
    }
    const borough = {
      locality: [{ precision: "borough", postcodes: [] }],
    }
    expect(artistInRegion(precise as never, "southwest")).toBe(true)
    expect(artistInRegion(borough as never, "southwest")).toBe(false)
  })
})
