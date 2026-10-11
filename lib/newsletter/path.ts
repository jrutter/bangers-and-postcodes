/** Path defaults for the footer form. Kept free of the catalogue JSON so the client bundle stays small. */

export function areasFromPathname(pathname: string, areaPostcodes: Record<string, string[]>, allowed: string[]): string[] {
  const allowedSet = new Set(allowed.map((code) => code.toUpperCase()))
  const postcode = pathname.match(/^\/postcode\/([a-z0-9]+)\/?$/i)
  if (postcode) {
    const code = postcode[1].toUpperCase()
    return allowedSet.has(code) ? [code] : []
  }
  const area = pathname.match(/^\/area\/([a-z0-9-]+)\/?$/i)
  if (!area) return []
  return (areaPostcodes[area[1]] ?? []).filter((code) => allowedSet.has(code.toUpperCase()))
}
