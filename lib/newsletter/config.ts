/** Newsletter configuration. Missing keys leave the rest of the site alone. */

export type NewsletterConfig = {
  postgresUrl: string
  resendKey: string
  from: string
  tokenSecret: string
  cronSecret: string
  previewSecret: string
  siteUrl: string
  batchSize: number
  batchDelayMs: number
}

export function newsletterEnv(env: NodeJS.ProcessEnv = process.env): NewsletterConfig {
  return {
    postgresUrl: (env.POSTGRES_URL || env.DATABASE_URL || "").trim(),
    resendKey: (env.RESEND_API_KEY || "").trim(),
    from: (env.NEWSLETTER_FROM || "").trim(),
    tokenSecret: (env.NEWSLETTER_TOKEN_SECRET || "").trim(),
    cronSecret: (env.CRON_SECRET || "").trim(),
    previewSecret: (env.NEWSLETTER_PREVIEW_SECRET || "").trim(),
    siteUrl: siteUrl(env),
    batchSize: clamp(numberEnv(env.NEWSLETTER_BATCH_SIZE, 50), 1, 100),
    batchDelayMs: clamp(numberEnv(env.NEWSLETTER_BATCH_DELAY_MS, 600), 0, 10_000),
  }
}

export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.SITE_URL || "").trim().replace(/\/$/, "")
  if (explicit) return explicit
  const production = (env.VERCEL_PROJECT_PRODUCTION_URL || "").trim()
  if (production) return `https://${production.replace(/^https?:\/\//, "")}`
  const vercel = (env.VERCEL_URL || "").trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`
  return "http://127.0.0.1:3000"
}

/**
 * Real delivery is production-only. Tests and local/preview runs cannot
 * construct the Resend client unless a test passes a mock.
 * NEWSLETTER_ALLOW_SEND=1 is an explicit override for a deliberate production send from a non-Vercel shell.
 */
export function liveSendsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "test") return false
  if (env.NEWSLETTER_ALLOW_SEND === "1") return true
  if (env.NODE_ENV !== "production") return false
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return false
  return true
}

/** The form needs a database and a secret for preference links. Production also needs Resend. */
export function signupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = newsletterEnv(env)
  if (!cfg.postgresUrl || !cfg.tokenSecret) return false
  if (liveSendsAllowed(env)) return Boolean(cfg.resendKey && cfg.from)
  return true
}

export function absoluteUrl(site: string, path: string): string {
  const base = site.endsWith("/") ? site : `${site}/`
  return new URL(path, base).toString()
}

function numberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
