import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
const login = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8")

const palette = {
  raspberry: "#a63446",
  paper: "#fbfef9",
  blue: "#0c6291",
  ink: "#000004",
  plum: "#7e1946",
} as const

describe("Jake's palette", () => {
  it("defines each brand colour once and maps the semantic roles", () => {
    for (const hex of Object.values(palette)) {
      expect(css.toLowerCase().match(new RegExp(hex, "g"))).toHaveLength(1)
      expect(login.toLowerCase()).toContain(hex)
    }
    expect(css).toContain("--primary: var(--raspberry)")
    expect(css).toContain("--background: var(--paper)")
    expect(css).toContain("--foreground: var(--ink)")
    expect(css).toContain("--info: var(--blue)")
    expect(css).toContain("--accent: var(--plum)")
    expect(css).toContain("--link-hover: var(--plum)")
    expect(css).toContain("--ring: var(--blue)")
    expect(css).not.toMatch(/#1db954|#1ed760/i)
    expect(css).toContain("--spotify-black: #191414")
    expect(css).toContain("--spotify-white: #ffffff")
  })

  it("keeps text and controls at WCAG AA on the light theme", () => {
    expect(contrast(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.raspberry, palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.paper, palette.raspberry)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.blue, palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.plum, palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.paper, palette.plum)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.blue, palette.paper)).toBeGreaterThanOrEqual(3)
    const muted = mix(palette.ink, palette.paper, 0.38)
    const border = mix(palette.ink, palette.paper, 0.55)
    expect(contrast(muted, palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(border, palette.paper)).toBeGreaterThanOrEqual(3)
  })

  it("lifts dark-theme mixes only as far as AA needs", () => {
    const primary = mix(palette.raspberry, palette.paper, 0.16)
    const accentText = mix(palette.plum, palette.paper, 0.45)
    const accentFill = mix(palette.plum, palette.paper, 0.3)
    const info = mix(palette.blue, palette.paper, 0.35)
    const destructive = mix(palette.raspberry, palette.paper, 0.24)
    const muted = mix(palette.paper, palette.ink, 0.32)
    const border = mix(palette.paper, palette.ink, 0.6)
    expect(contrast(palette.paper, primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(primary, palette.ink)).toBeGreaterThanOrEqual(3)
    expect(contrast(accentText, palette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.paper, accentFill)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(accentFill, palette.ink)).toBeGreaterThanOrEqual(3)
    expect(contrast(info, palette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(destructive, palette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(muted, palette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(border, palette.ink)).toBeGreaterThanOrEqual(3)
    expect(contrast("#ffffff", "#191414")).toBeGreaterThanOrEqual(4.5)
  })
})

function mix(a: string, b: string, paperWeight: number): string {
  const left = rgb(a)
  const right = rgb(b)
  const channel = (index: number) => Math.round(left[index] * (1 - paperWeight) + right[index] * paperWeight)
  return `#${[channel(0), channel(1), channel(2)].map((value) => value.toString(16).padStart(2, "0")).join("")}`
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "")
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((left, right) => right - left)
  return (hi + 0.05) / (lo + 0.05)
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
