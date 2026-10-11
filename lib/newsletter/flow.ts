import { randomUUID } from "node:crypto"

import { londonDate } from "@/lib/geo"
import { chunk } from "@/lib/playlist"
import { absoluteUrl } from "@/lib/newsletter/config"
import { areaLabel, normalizeAreas, normalizeEmail } from "@/lib/newsletter/areas"
import type { EmailClient, OutboundEmail } from "@/lib/newsletter/email"
import { buildIssue, isThursdayMorningLondon, isoWeekKey, type NewsletterIssue, type PersonalNewsletter } from "@/lib/newsletter/issue"
import { renderConfirm, renderManage, renderWeekly } from "@/lib/newsletter/render"
import type { Subscriber, SubscriberStore } from "@/lib/newsletter/store"
import { batchIdempotencyKey, hashToken, newToken, preferenceToken, readPreferenceToken } from "@/lib/newsletter/tokens"
import type { Gig } from "@/lib/gigs/types"
import type { ArtistRecord } from "@/lib/types"

const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type SubscribeResult =
  | { status: "check-email"; confirmUrl?: string; preferencesUrl?: string }
  | { status: "invalid"; message: string }

export async function requestSubscription(
  input: { email: string; areas: string[]; consent: boolean; company: string },
  deps: {
    store: SubscriberStore
    email: EmailClient | null
    now: Date
    siteUrl: string
    tokenSecret: string
    deliver: boolean
  },
): Promise<SubscribeResult> {
  if (input.company.trim()) return { status: "check-email" }
  if (!input.consent) return { status: "invalid", message: "Tick the box to say yes to the weekly email." }
  const email = normalizeEmail(input.email)
  if (!email) return { status: "invalid", message: "Enter an email address." }
  const areas = normalizeAreas(input.areas)
  if (!areas) return { status: "invalid", message: "Pick at least one postcode district from the list." }

  await deps.store.ensure()
  const nowIso = deps.now.toISOString()
  const existing = await deps.store.findByEmail(email)

  if (existing?.status === "confirmed") {
    const preferencesUrl = preferenceLink(deps.siteUrl, existing.id, deps.tokenSecret)
    if (deps.deliver && deps.email) {
      const rendered = await renderManage({ preferencesUrl, siteUrl: deps.siteUrl })
      await deps.email.send(
        [
          {
            to: email,
            subject: "Manage your Bangers & Postcodes email",
            html: rendered.html,
            text: rendered.text,
          },
        ],
        `manage-${hashToken(email).slice(0, 16)}-${nowIso.slice(0, 13)}`,
      )
    }
    return deps.deliver ? { status: "check-email" } : { status: "check-email", preferencesUrl }
  }

  const id = existing?.id ?? randomUUID()
  const confirmToken = newToken()
  const pending = {
    id,
    email,
    areas,
    consentAt: nowIso,
    confirmTokenHash: hashToken(confirmToken),
    confirmExpiresAt: new Date(deps.now.getTime() + CONFIRM_TTL_MS).toISOString(),
  }
  if (!existing) await deps.store.insertPending(pending)
  else await deps.store.revivePending(pending)

  const confirmUrl = absoluteUrl(deps.siteUrl, `/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`)
  if (deps.deliver && deps.email) {
    const rendered = await renderConfirm({
      confirmUrl,
      areas: areas.map((code) => ({ code, label: areaLabel(code) })),
      siteUrl: deps.siteUrl,
    })
    await deps.email.send(
      [
        {
          to: email,
          subject: "Confirm your Bangers & Postcodes email",
          html: rendered.html,
          text: rendered.text,
        },
      ],
      `confirm-${hashToken(confirmToken).slice(0, 24)}`,
    )
    return { status: "check-email" }
  }
  return { status: "check-email", confirmUrl }
}

export async function confirmSubscription(
  token: string,
  deps: { store: SubscriberStore; now: Date },
): Promise<"confirmed" | "invalid"> {
  const hash = hashToken(token)
  await deps.store.ensure()
  const row = await deps.store.confirm(hash, deps.now.toISOString())
  return row ? "confirmed" : "invalid"
}

export async function unsubscribeSubscriber(
  token: string,
  deps: { store: SubscriberStore; now: Date; tokenSecret: string },
): Promise<"unsubscribed" | "invalid"> {
  const id = readPreferenceToken(token, deps.tokenSecret)
  if (!id) return "invalid"
  await deps.store.ensure()
  const row = await deps.store.findById(id)
  if (!row) return "invalid"
  await deps.store.markUnsubscribed(id, deps.now.toISOString())
  return "unsubscribed"
}

export async function updateSubscriberAreas(
  token: string,
  areasInput: string[],
  deps: { store: SubscriberStore; now: Date; tokenSecret: string },
): Promise<"updated" | "invalid" | "unsubscribed"> {
  const id = readPreferenceToken(token, deps.tokenSecret)
  if (!id) return "invalid"
  const areas = normalizeAreas(areasInput)
  if (!areas) return "invalid"
  await deps.store.ensure()
  const row = await deps.store.findById(id)
  if (!row) return "invalid"
  if (row.status === "unsubscribed") return "unsubscribed"
  if (row.status !== "confirmed") return "invalid"
  const ok = await deps.store.updateAreas(id, areas, deps.now.toISOString())
  return ok ? "updated" : "invalid"
}

export async function subscriberFromToken(
  token: string,
  deps: { store: SubscriberStore; tokenSecret: string },
): Promise<Subscriber | null> {
  const id = readPreferenceToken(token, deps.tokenSecret)
  if (!id) return null
  await deps.store.ensure()
  return deps.store.findById(id)
}

export type SendReport = {
  ok: true
  dryRun: boolean
  weekKey: string
  sent: number
  skipped: number
  failed: number
  already: number
  batches: number
  skippedReason?: "outside-window"
}

export async function runWeeklySend(deps: {
  store: SubscriberStore
  email: EmailClient | null
  gigs: Gig[]
  now: Date
  siteUrl: string
  tokenSecret: string
  dryRun: boolean
  force: boolean
  batchSize: number
  batchDelayMs: number
  sleep?: (ms: number) => Promise<void>
  artists?: ArtistRecord[]
}): Promise<SendReport> {
  const weekKey = isoWeekKey(londonDate(deps.now))
  const report: SendReport = {
    ok: true,
    dryRun: deps.dryRun,
    weekKey,
    sent: 0,
    skipped: 0,
    failed: 0,
    already: 0,
    batches: 0,
  }
  if (!deps.dryRun && !deps.force && !isWindow(deps.now)) {
    report.skippedReason = "outside-window"
    return report
  }

  await deps.store.ensure()
  const subscribers = await deps.store.listConfirmed()
  const prior = new Map((await deps.store.listSends(weekKey)).map((row) => [row.subscriberId, row.status]))
  const issueCache = new Map<string, NewsletterIssue>()
  const queued: { subscriber: Subscriber; message: OutboundEmail }[] = []

  for (const subscriber of subscribers) {
    const previous = prior.get(subscriber.id)
    if (previous === "sent" || previous === "skipped") {
      report.already += 1
      continue
    }
    const cacheKey = subscriber.areas.join(",")
    let issue = issueCache.get(cacheKey)
    if (!issue) {
      issue = buildIssue({
        areas: subscriber.areas,
        gigs: deps.gigs,
        now: deps.now,
        siteUrl: deps.siteUrl,
        artists: deps.artists,
      })
      issueCache.set(cacheKey, issue)
    }
    if (!issue.meaningful) {
      if (deps.dryRun) {
        report.skipped += 1
        continue
      }
      const claim = await deps.store.claimSend(subscriber.id, weekKey, deps.now)
      if (claim === "already") {
        report.already += 1
        continue
      }
      await deps.store.finishSend(subscriber.id, weekKey, "skipped", deps.now)
      report.skipped += 1
      continue
    }
    if (deps.dryRun) {
      report.sent += 1
      continue
    }
    const claim = await deps.store.claimSend(subscriber.id, weekKey, deps.now)
    if (claim === "already") {
      report.already += 1
      continue
    }
    try {
      const personal = personalize(issue, deps.siteUrl, subscriber.id, deps.tokenSecret)
      const rendered = await renderWeekly(personal)
      queued.push({
        subscriber,
        message: {
          to: subscriber.email,
          subject: personal.subject,
          html: rendered.html,
          text: rendered.text,
          headers: {
            "List-Unsubscribe": `<${personal.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        },
      })
    } catch {
      await deps.store.finishSend(subscriber.id, weekKey, "failed", deps.now)
      report.failed += 1
    }
  }

  if (deps.dryRun || queued.length === 0) return report
  if (!deps.email) {
    for (const item of queued) {
      await deps.store.finishSend(item.subscriber.id, weekKey, "failed", deps.now)
      report.failed += 1
    }
    return report
  }

  const groups = chunk(queued, deps.batchSize)
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    const key = batchIdempotencyKey(
      weekKey,
      group.map((item) => item.subscriber.id),
    )
    try {
      await deps.email.send(
        group.map((item) => item.message),
        key,
      )
      for (const item of group) {
        await deps.store.finishSend(item.subscriber.id, weekKey, "sent", deps.now)
        report.sent += 1
      }
    } catch {
      for (const item of group) {
        await deps.store.finishSend(item.subscriber.id, weekKey, "failed", deps.now)
        report.failed += 1
      }
    }
    report.batches += 1
    if (index < groups.length - 1 && deps.batchDelayMs > 0) {
      await (deps.sleep ?? delay)(deps.batchDelayMs)
    }
  }
  return report
}

function personalize(issue: NewsletterIssue, site: string, subscriberId: string, secret: string): PersonalNewsletter {
  const token = preferenceToken(subscriberId, secret)
  return {
    ...issue,
    unsubscribeUrl: absoluteUrl(site, `/newsletter/unsubscribe?token=${encodeURIComponent(token)}`),
    preferencesUrl: absoluteUrl(site, `/newsletter/preferences?token=${encodeURIComponent(token)}`),
  }
}

function preferenceLink(site: string, subscriberId: string, secret: string): string {
  const token = preferenceToken(subscriberId, secret)
  return absoluteUrl(site, `/newsletter/preferences?token=${encodeURIComponent(token)}`)
}

function isWindow(now: Date): boolean {
  return isThursdayMorningLondon(now)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
