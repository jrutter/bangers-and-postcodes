import { liveSendsAllowed, newsletterEnv } from "@/lib/newsletter/config"
import { createEmailClient, type EmailClient } from "@/lib/newsletter/email"
import { runWeeklySend, type SendReport } from "@/lib/newsletter/flow"
import type { SubscriberStore } from "@/lib/newsletter/store"
import { secretMatches } from "@/lib/newsletter/tokens"
import type { Gig } from "@/lib/gigs/types"

export type CronBody = {
  ok: boolean
  dryRun?: boolean
  weekKey?: string
  sent?: number
  skipped?: number
  failed?: number
  already?: number
  batches?: number
  skippedReason?: string
  error?: string
}

export async function handleNewsletterCron(input: {
  authorization: string | null
  dryRun: boolean
  force: boolean
  now: Date
  env: NodeJS.ProcessEnv
  store: SubscriberStore | null
  loadGigs: () => Promise<Gig[]>
  email?: EmailClient
  sleep?: (ms: number) => Promise<void>
}): Promise<{ status: number; body: CronBody }> {
  const cfg = newsletterEnv(input.env)
  const provided = bearer(input.authorization)
  if (!cfg.cronSecret || !secretMatches(provided, cfg.cronSecret)) {
    return { status: 401, body: { ok: false, error: "unauthorized" } }
  }
  if (!input.store || !cfg.tokenSecret) {
    return { status: 200, body: { ok: true, skippedReason: "not-configured", dryRun: input.dryRun } }
  }
  const live = liveSendsAllowed(input.env)
  if (!input.dryRun && !live) {
    return { status: 200, body: { ok: true, dryRun: false, skippedReason: "sends-disabled" } }
  }

  let email = input.email
  if (!input.dryRun && live && !email) {
    try {
      email = await createEmailClient(input.env)
    } catch {
      return { status: 500, body: { ok: false, error: "email-client" } }
    }
  }

  let gigs: Gig[]
  try {
    gigs = await input.loadGigs()
  } catch {
    return { status: 500, body: { ok: false, error: "gigs" } }
  }

  const report: SendReport = await runWeeklySend({
    store: input.store,
    email: email ?? null,
    gigs,
    now: input.now,
    siteUrl: cfg.siteUrl,
    tokenSecret: cfg.tokenSecret,
    dryRun: input.dryRun,
    force: input.force,
    batchSize: cfg.batchSize,
    batchDelayMs: cfg.batchDelayMs,
    sleep: input.sleep,
  })
  return {
    status: 200,
    body: {
      ok: true,
      dryRun: report.dryRun,
      weekKey: report.weekKey,
      sent: report.sent,
      skipped: report.skipped,
      failed: report.failed,
      already: report.already,
      batches: report.batches,
      skippedReason: report.skippedReason,
    },
  }
}

function bearer(authorization: string | null): string {
  if (!authorization?.startsWith("Bearer ")) return ""
  return authorization.slice("Bearer ".length).trim()
}
