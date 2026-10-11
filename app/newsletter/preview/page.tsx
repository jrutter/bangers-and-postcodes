import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { headers } from "next/headers"
import { Suspense } from "react"

import { PreviewLogin } from "@/components/newsletter-preview-login"
import { loadRegionalGigs } from "@/lib/gigs/cache"
import { gigProviderFingerprint } from "@/lib/gigs/providers"
import { newsletterAreas } from "@/lib/newsletter/areas"
import { absoluteUrl, newsletterEnv } from "@/lib/newsletter/config"
import { buildIssue } from "@/lib/newsletter/issue"
import { renderWeekly } from "@/lib/newsletter/render"
import { previewCookieMatches } from "@/lib/newsletter/preview-auth"
import { secretMatches } from "@/lib/newsletter/tokens"

export const metadata: Metadata = {
  title: "Email preview",
  robots: { index: false, follow: false },
}

export const maxDuration = 60

export default function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the email preview…</p>}>
      <PreviewBody searchParams={searchParams} />
    </Suspense>
  )
}

async function PreviewBody({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  await connection()
  const cfg = newsletterEnv()
  if (!cfg.previewSecret) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Email preview</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Preview is off until NEWSLETTER_PREVIEW_SECRET is set. The rest of the site keeps working.
        </p>
      </div>
    )
  }
  const header = (await headers()).get("authorization")
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : ""
  const allowed = secretMatches(bearer, cfg.previewSecret) || (await previewCookieMatches())
  if (!allowed) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Email preview</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Enter the preview secret to render this week&apos;s email for one postcode district. This does not send
          anything.
        </p>
        <PreviewLogin />
      </div>
    )
  }

  const requested = ((await searchParams).area || "SW15").toUpperCase()
  const known = newsletterAreas().some((area) => area.code === requested)
  const area = known ? requested : newsletterAreas()[0]?.code || "SW15"
  const feed = await loadRegionalGigs(gigProviderFingerprint())
  const issue = buildIssue({
    areas: [area],
    gigs: feed.gigs,
    now: new Date(),
    siteUrl: cfg.siteUrl,
    includeQuiet: true,
  })
  const rendered = await renderWeekly({
    ...issue,
    unsubscribeUrl: absoluteUrl(cfg.siteUrl, "/newsletter/unsubscribe"),
    preferencesUrl: absoluteUrl(cfg.siteUrl, "/newsletter/preferences"),
  })

  return (
    <div className="space-y-6">
      <header className="max-w-3xl space-y-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Email preview</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {issue.meaningful
            ? `This issue would be sent. Subject: ${issue.subject}.`
            : "This issue would be skipped. There are no gigs in the next 7 days for this district."}
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {newsletterAreas().map((option) => (
            <Link
              key={option.code}
              href={`/newsletter/preview?area=${option.code}`}
              className={option.code === area ? "font-medium text-foreground" : "text-muted-foreground"}
            >
              {option.code}
            </Link>
          ))}
        </div>
      </header>
      <iframe title={`Weekly email for ${area}`} sandbox="" srcDoc={rendered.html} className="h-[820px] w-full rounded-xl bg-white ring-1 ring-foreground/10" />
      <details className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <summary className="cursor-pointer text-sm font-medium">Plain text</summary>
        <pre className="mt-3 overflow-x-auto text-xs leading-5 whitespace-pre-wrap">{rendered.text}</pre>
      </details>
    </div>
  )
}
