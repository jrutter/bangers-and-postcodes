import { describe, expect, it } from "vitest"

import type { Gig } from "@/lib/gigs/types"
import { defaultAreasForScope } from "@/lib/newsletter/areas"
import { liveSendsAllowed, signupEnabled } from "@/lib/newsletter/config"
import { handleNewsletterCron } from "@/lib/newsletter/cron"
import { createEmailClient, recordingEmailClient } from "@/lib/newsletter/email"
import {
  confirmSubscription,
  requestSubscription,
  runWeeklySend,
  unsubscribeSubscriber,
  updateSubscriberAreas,
} from "@/lib/newsletter/flow"
import { buildIssue, isThursdayMorningLondon, isoWeekKey, spotlightArtists } from "@/lib/newsletter/issue"
import { areasFromPathname } from "@/lib/newsletter/path"
import { BRAND, renderWeekly } from "@/lib/newsletter/render"
import { SEND_TABLE_SQL, SUBSCRIBER_TABLE_SQL } from "@/lib/newsletter/schema"
import { memoryStore } from "@/lib/newsletter/store"
import { batchIdempotencyKey, preferenceToken, readPreferenceToken } from "@/lib/newsletter/tokens"
import type { ArtistRecord } from "@/lib/types"

const NOW = new Date("2026-10-15T08:00:00.000Z")
const SITE = "https://bangers-and-postcodes.vercel.app"
const SECRET = "token-secret"

function gig(overrides: Partial<Gig> & Pick<Gig, "id" | "date" | "postcode" | "artistNames">): Gig {
  return {
    provider: "skiddle",
    title: overrides.artistNames[0],
    venueName: "The Half Moon",
    address: "93 Lower Richmond Road",
    town: "London",
    latitude: 51.46726,
    longitude: -0.22007,
    startsAt: `${overrides.date}T18:00:00.000Z`,
    doorTime: null,
    ticketUrl: "https://www.skiddle.com/e/test",
    ...overrides,
  }
}

function person(name: string, begin: string | null, ended = false): ArtistRecord {
  return {
    mbid: null,
    wikidata_qid: null,
    name,
    sort_name: name,
    type: "Person",
    disambiguation: null,
    country: "GB",
    life_span: { begin, end: null, ended },
    tags: [],
    locality: [
      {
        place_id: "putney",
        place_name: "Putney",
        postcodes: ["SW15"],
        precision: "place",
        claims: [],
      },
    ],
  }
}

const ARTISTS = [
  person("Dusty Local", "1962"),
  person("Old Guard", "1978-04"),
  person("New Kid", "2016"),
  person("Newer Still", "2019-06"),
  person("Mystery Act", null),
]

function deps(store: ReturnType<typeof memoryStore>, deliver: boolean) {
  const email = recordingEmailClient()
  return {
    email,
    args: {
      store,
      email: deliver ? email : null,
      now: NOW,
      siteUrl: SITE,
      tokenSecret: SECRET,
      deliver,
    },
  }
}

describe("newsletter issue", () => {
  const listed = gig({
    id: "half-moon",
    date: "2026-10-16",
    postcode: "SW15 1EU",
    artistNames: ["Wet Leg"],
    ticketUrl: "https://www.skiddle.com/e/wet-leg",
  })

  it("builds a SW15 week with tickets, Spotify links, and a playlist", () => {
    const issue = buildIssue({
      areas: ["SW15", "SW19"],
      gigs: [listed, gig({ id: "later", date: "2026-11-20", postcode: "SW19 1QG", artistNames: ["Too Late"] })],
      now: NOW,
      siteUrl: SITE,
      artists: ARTISTS,
    })
    expect(issue.meaningful).toBe(true)
    expect(issue.subject).toBe("This week in SW15")
    expect(issue.areas.map((area) => area.code)).toEqual(["SW15"])
    expect(issue.areas[0].gigs[0].ticketUrl).toBe("https://www.skiddle.com/e/wet-leg")
    expect(issue.areas[0].gigs[0].artists[0].spotifyUrl).toContain("https://open.spotify.com/search/")
    expect(issue.areas[0].playlistUrl).toBe(`${SITE}/playlist?scope=postcode%3ASW15`)
    expect(issue.areas[0].rooms[0].name).toBe("The Half Moon")
    expect(issue.forYouUrl).toBe(`${SITE}/postcode/sw15`)
  })

  it("drops an insecure ticket link and skips a week with no gigs", () => {
    const quiet = buildIssue({
      areas: ["SW15"],
      gigs: [gig({ id: "http", date: "2026-10-16", postcode: "SW15 1EU", artistNames: ["Wet Leg"], ticketUrl: "http://insecure.example/t" })],
      now: NOW,
      siteUrl: SITE,
      artists: ARTISTS,
    })
    expect(quiet.areas[0].gigs[0].ticketUrl).toBeNull()
    const empty = buildIssue({ areas: ["SW15"], gigs: [], now: NOW, siteUrl: SITE, artists: ARTISTS })
    expect(empty.meaningful).toBe(false)
    expect(empty.areas).toEqual([])
  })

  it("rotates legends and newer acts by week", () => {
    const even = spotlightArtists("SW15", 2, ARTISTS).map((artist) => `${artist.kind}:${artist.name}`)
    const odd = spotlightArtists("SW15", 3, ARTISTS).map((artist) => `${artist.kind}:${artist.name}`)
    expect(even.filter((row) => row.startsWith("legend:"))).toHaveLength(1)
    expect(even.filter((row) => row.startsWith("newer:"))).toHaveLength(2)
    expect(odd.filter((row) => row.startsWith("legend:"))).toHaveLength(2)
    expect(odd.filter((row) => row.startsWith("newer:"))).toHaveLength(1)
    expect(even).not.toEqual(odd)
  })

  it("renders branded html and plain text", async () => {
    const issue = buildIssue({
      areas: ["SW15"],
      gigs: [listed],
      now: NOW,
      siteUrl: SITE,
      artists: ARTISTS,
    })
    const rendered = await renderWeekly({
      ...issue,
      unsubscribeUrl: `${SITE}/newsletter/unsubscribe?token=abc`,
      preferencesUrl: `${SITE}/newsletter/preferences?token=abc`,
    })
    const html = rendered.html.toLowerCase()
    expect(html).toContain(BRAND.red.toLowerCase())
    expect(html).toContain(BRAND.paper.toLowerCase())
    expect(html).toContain(BRAND.blue.toLowerCase())
    expect(html).toContain(BRAND.ink.toLowerCase())
    expect(html).toContain(BRAND.berry.toLowerCase())
    expect(rendered.html).toContain("https://www.skiddle.com/e/wet-leg")
    expect(rendered.html).toContain("Open Wet Leg in Spotify")
    expect(rendered.html).toContain("/newsletter/unsubscribe?token=abc")
    expect(rendered.text).toContain("Wet Leg")
    expect(rendered.text).toContain("https://www.skiddle.com/e/wet-leg")
    expect(rendered.text).toContain("Unsubscribe")
  })

  it("keys the send week from the London Thursday", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01")
    expect(isoWeekKey("2026-10-15")).toBe(isoWeekKey("2026-10-16"))
    expect(isoWeekKey("2026-10-15")).not.toBe(isoWeekKey("2026-10-19"))
    expect(isThursdayMorningLondon(NOW)).toBe(true)
    expect(isThursdayMorningLondon(new Date("2026-01-15T08:00:00.000Z"))).toBe(true)
    expect(isThursdayMorningLondon(new Date("2026-10-14T08:00:00.000Z"))).toBe(false)
    expect(isThursdayMorningLondon(new Date("2026-10-15T12:00:00.000Z"))).toBe(false)
  })
})

describe("newsletter signup", () => {
  it("confirms, then ignores a second confirm and a change from the public form", async () => {
    const store = memoryStore()
    const first = deps(store, false)
    const pending = await requestSubscription(
      { email: "Fan@Example.com ", areas: ["sw15", "SW15"], consent: true, company: "" },
      first.args,
    )
    expect(pending.status).toBe("check-email")
    if (pending.status !== "check-email") return
    const token = new URL(pending.confirmUrl || "").searchParams.get("token") || ""
    expect(await confirmSubscription(token, { store, now: NOW })).toBe("confirmed")
    expect(await confirmSubscription(token, { store, now: NOW })).toBe("invalid")
    expect(first.email.messages).toHaveLength(0)

    const again = await requestSubscription(
      { email: "fan@example.com", areas: ["SW19"], consent: true, company: "" },
      { ...first.args, email: first.email, deliver: true },
    )
    expect(again).toEqual({ status: "check-email" })
    expect((await store.findByEmail("fan@example.com"))?.areas).toEqual(["SW15"])
    expect(first.email.messages[0].subject).toMatch(/Manage/)
  })

  it("rejects bad input, honeypots, and expired links", async () => {
    const store = memoryStore()
    const { args } = deps(store, false)
    expect((await requestSubscription({ email: "nope", areas: ["SW15"], consent: true, company: "" }, args)).status).toBe("invalid")
    expect((await requestSubscription({ email: "a@b.co", areas: ["ZZ99"], consent: true, company: "" }, args)).status).toBe("invalid")
    expect((await requestSubscription({ email: "a@b.co", areas: ["SW15"], consent: false, company: "" }, args)).status).toBe("invalid")
    await requestSubscription({ email: "bot@example.com", areas: ["SW15"], consent: true, company: "acme" }, args)
    expect(await store.findByEmail("bot@example.com")).toBeNull()

    const pending = await requestSubscription({ email: "late@example.com", areas: ["SW15"], consent: true, company: "" }, args)
    if (pending.status !== "check-email") throw new Error("expected confirm link")
    const token = new URL(pending.confirmUrl || "").searchParams.get("token") || ""
    const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000)
    expect(await confirmSubscription(token, { store, now: later })).toBe("invalid")
  })

  it("updates areas from the preference token and unsubscribes", async () => {
    const store = memoryStore()
    const { args } = deps(store, false)
    const pending = await requestSubscription({ email: "fan@example.com", areas: ["SW15"], consent: true, company: "" }, args)
    if (pending.status !== "check-email") throw new Error("expected confirm link")
    const token = new URL(pending.confirmUrl || "").searchParams.get("token") || ""
    await confirmSubscription(token, { store, now: NOW })
    const row = await store.findByEmail("fan@example.com")
    const link = preferenceToken(row?.id || "", SECRET)
    expect(readPreferenceToken(link, SECRET)).toBe(row?.id)
    expect(readPreferenceToken(link, "other-secret")).toBeNull()
    expect(await updateSubscriberAreas(link, ["SW19", "KT1"], { store, now: NOW, tokenSecret: SECRET })).toBe("updated")
    expect((await store.findByEmail("fan@example.com"))?.areas).toEqual(["KT1", "SW19"])
    expect(await unsubscribeSubscriber(link, { store, now: NOW, tokenSecret: SECRET })).toBe("unsubscribed")
    expect(await unsubscribeSubscriber(link, { store, now: NOW, tokenSecret: SECRET })).toBe("unsubscribed")
    expect((await store.findByEmail("fan@example.com"))?.status).toBe("unsubscribed")
  })

  it("defaults the page the visitor is on", () => {
    expect(areasFromPathname("/postcode/sw15", {}, ["SW15", "SW19"])).toEqual(["SW15"])
    expect(areasFromPathname("/area/putney", { putney: ["SW15"] }, ["SW15"])).toEqual(["SW15"])
    expect(areasFromPathname("/", { putney: ["SW15"] }, ["SW15"])).toEqual([])
    expect(defaultAreasForScope({ kind: "postcode", postcode: "SW15" })).toEqual(["SW15"])
    expect(defaultAreasForScope({ kind: "area", placeId: "putney" })).toEqual(["SW15"])
  })
})

describe("weekly send", () => {
  const gigs = [
    gig({ id: "putney", date: "2026-10-16", postcode: "SW15 1EU", artistNames: ["Wet Leg"] }),
  ]

  async function seed(store: ReturnType<typeof memoryStore>, email: string, areas: string[]) {
    const pending = await requestSubscription(
      { email, areas, consent: true, company: "" },
      deps(store, false).args,
    )
    if (pending.status !== "check-email") throw new Error("seed failed")
    const token = new URL(pending.confirmUrl || "").searchParams.get("token") || ""
    expect(await confirmSubscription(token, { store, now: NOW })).toBe("confirmed")
  }

  it("sends once, skips an empty area, and retries a failed batch", async () => {
    const store = memoryStore()
    await seed(store, "putney@example.com", ["SW15"])
    await seed(store, "quiet@example.com", ["SW19"])
    const email = recordingEmailClient()
    const sleeps: number[] = []
    const first = await runWeeklySend({
      store,
      email,
      gigs,
      now: NOW,
      siteUrl: SITE,
      tokenSecret: SECRET,
      dryRun: false,
      force: false,
      batchSize: 1,
      batchDelayMs: 600,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      artists: ARTISTS,
    })
    expect(first.sent).toBe(1)
    expect(first.skipped).toBe(1)
    expect(first.batches).toBe(1)
    expect(sleeps).toEqual([])
    expect(email.messages).toHaveLength(1)
    expect(email.messages[0].to).toBe("putney@example.com")
    expect(email.messages[0].headers?.["List-Unsubscribe"]).toContain("/newsletter/unsubscribe?token=")
    expect(email.messages[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    expect(email.keys[0]).toBe(batchIdempotencyKey(first.weekKey, [(await store.findByEmail("putney@example.com"))?.id || ""]))

    const second = await runWeeklySend({
      store,
      email,
      gigs,
      now: NOW,
      siteUrl: SITE,
      tokenSecret: SECRET,
      dryRun: false,
      force: true,
      batchSize: 10,
      batchDelayMs: 0,
      artists: ARTISTS,
    })
    expect(second.sent).toBe(0)
    expect(second.already).toBe(2)
    expect(email.messages).toHaveLength(1)

    const flakyStore = memoryStore()
    await seed(flakyStore, "one@example.com", ["SW15"])
    await seed(flakyStore, "two@example.com", ["SW15"])
    let calls = 0
    const flaky = {
      async send() {
        calls += 1
        if (calls === 1) throw new Error("provider down")
      },
    }
    const failed = await runWeeklySend({
      store: flakyStore,
      email: flaky,
      gigs,
      now: NOW,
      siteUrl: SITE,
      tokenSecret: SECRET,
      dryRun: false,
      force: true,
      batchSize: 10,
      batchDelayMs: 0,
      artists: ARTISTS,
    })
    expect(failed.failed).toBe(2)
    const recovered = await runWeeklySend({
      store: flakyStore,
      email: flaky,
      gigs,
      now: NOW,
      siteUrl: SITE,
      tokenSecret: SECRET,
      dryRun: false,
      force: true,
      batchSize: 10,
      batchDelayMs: 0,
      artists: ARTISTS,
    })
    expect(recovered.sent).toBe(2)
    expect(recovered.failed).toBe(0)
  })

  it("dry-run and the Thursday window do not send", async () => {
    const store = memoryStore()
    await seed(store, "putney@example.com", ["SW15"])
    const email = recordingEmailClient()
    const dry = await runWeeklySend({
      store,
      email,
      gigs,
      now: new Date("2026-10-14T08:00:00.000Z"),
      siteUrl: SITE,
      tokenSecret: SECRET,
      dryRun: true,
      force: false,
      batchSize: 10,
      batchDelayMs: 0,
      artists: ARTISTS,
    })
    expect(dry.dryRun).toBe(true)
    expect(dry.sent).toBe(1)
    expect(email.messages).toHaveLength(0)

    const blocked = await runWeeklySend({
      store,
      email,
      gigs,
      now: new Date("2026-10-14T08:00:00.000Z"),
      siteUrl: SITE,
      tokenSecret: SECRET,
      dryRun: false,
      force: false,
      batchSize: 10,
      batchDelayMs: 0,
      artists: ARTISTS,
    })
    expect(blocked.skippedReason).toBe("outside-window")
    expect(blocked.sent).toBe(0)
    expect(email.messages).toHaveLength(0)

    const live = await runWeeklySend({
      store,
      email,
      gigs,
      now: NOW,
      siteUrl: SITE,
      tokenSecret: SECRET,
      dryRun: false,
      force: false,
      batchSize: 10,
      batchDelayMs: 0,
      artists: ARTISTS,
    })
    expect(live.sent).toBe(1)
  })
})

describe("newsletter guards", () => {
  it("stores only the subscriber fields the send needs", () => {
    const sql = `${SUBSCRIBER_TABLE_SQL}\n${SEND_TABLE_SQL}`
    expect(sql).toMatch(/email/)
    expect(sql).toMatch(/areas/)
    expect(sql).toMatch(/consent_at/)
    expect(sql).toMatch(/confirmed_at/)
    expect(sql).toMatch(/unsubscribed_at/)
    expect(sql).not.toMatch(/spotify|ip_address|user_agent|taste|password/i)
  })

  it("stays off without keys and refuses a live client in tests", async () => {
    expect(signupEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(liveSendsAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false)
    expect(liveSendsAllowed({ NODE_ENV: "production", VERCEL_ENV: "preview" } as NodeJS.ProcessEnv)).toBe(false)
    expect(liveSendsAllowed({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false)
    expect(liveSendsAllowed({ NODE_ENV: "production", VERCEL_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true)
    expect(
      signupEnabled({
        NODE_ENV: "development",
        POSTGRES_URL: "postgres://local/db",
        NEWSLETTER_TOKEN_SECRET: "secret",
      } as NodeJS.ProcessEnv),
    ).toBe(true)
    expect(
      signupEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        POSTGRES_URL: "postgres://local/db",
        NEWSLETTER_TOKEN_SECRET: "secret",
      } as NodeJS.ProcessEnv),
    ).toBe(false)
    await expect(
      createEmailClient({
        NODE_ENV: "production",
        RESEND_API_KEY: "re_test",
        NEWSLETTER_FROM: "Bangers <news@example.com>",
      } as NodeJS.ProcessEnv),
    ).rejects.toThrow(/tests/)
  })

  it("protects the cron route and does not send when delivery is off", async () => {
    const store = memoryStore()
    const base = {
      dryRun: false,
      force: false,
      now: NOW,
      store,
      loadGigs: async () => {
        throw new Error("gigs should not load")
      },
    }
    const denied = await handleNewsletterCron({
      ...base,
      authorization: "Bearer wrong",
      env: { CRON_SECRET: "cron-secret", NODE_ENV: "production" } as NodeJS.ProcessEnv,
    })
    expect(denied.status).toBe(401)

    const missing = await handleNewsletterCron({
      ...base,
      authorization: "Bearer cron-secret",
      store: null,
      env: { CRON_SECRET: "cron-secret", NODE_ENV: "production", VERCEL_ENV: "production" } as NodeJS.ProcessEnv,
    })
    expect(missing.status).toBe(200)
    expect(missing.body.skippedReason).toBe("not-configured")

    const disabled = await handleNewsletterCron({
      ...base,
      authorization: "Bearer cron-secret",
      env: {
        CRON_SECRET: "cron-secret",
        NEWSLETTER_TOKEN_SECRET: "token-secret",
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv,
    })
    expect(disabled.body.skippedReason).toBe("sends-disabled")

    const email = recordingEmailClient()
    const dry = await handleNewsletterCron({
      authorization: "Bearer cron-secret",
      dryRun: true,
      force: false,
      now: NOW,
      store,
      email,
      loadGigs: async () => [],
      env: {
        CRON_SECRET: "cron-secret",
        NEWSLETTER_TOKEN_SECRET: "token-secret",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        SITE_URL: SITE,
      } as NodeJS.ProcessEnv,
    })
    expect(dry.status).toBe(200)
    expect(dry.body.dryRun).toBe(true)
    expect(dry.body.sent).toBe(0)
    expect(email.messages).toHaveLength(0)
  })
})
