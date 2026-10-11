import districtRows from "@/data/london-districts.json"

export type DistrictPoint = {
  postcode: string
  latitude: number
  longitude: number
}

export const LONDON_DISTRICTS = districtRows as DistrictPoint[]

const BY_CODE = new Map(LONDON_DISTRICTS.map((district) => [district.postcode, district]))

export function londonPostcodes(): string[] {
  return LONDON_DISTRICTS.map((district) => district.postcode)
}

export function districtPoint(postcode: string): DistrictPoint | null {
  return BY_CODE.get(postcode.toUpperCase()) ?? null
}

export function postcodeArea(postcode: string): string {
  const match = /^[A-Z]+/.exec(postcode.toUpperCase())
  return match?.[0] ?? postcode
}
