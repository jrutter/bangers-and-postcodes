"use client"

import { PostHogProvider } from "@posthog/react"
import { usePathname, useSearchParams } from "next/navigation"
import posthog from "posthog-js"
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { eventsForPath, safeFilterValue } from "@/lib/analytics"
import {
  analyticsKey,
  analyticsReady,
  applyConsent,
  captureClient,
  currentConsent,
  syncIdentity,
} from "@/lib/posthog-browser"

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <Pageviews />
      </Suspense>
      <AnalyticsListeners />
      <ConsentBanner />
      {children}
    </PostHogProvider>
  )
}

function Pageviews() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const seen = useRef("")
  useEffect(() => {
    const query = searchParams.toString()
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`
    if (!analyticsReady()) return
    if (seen.current === url) return
    seen.current = url
    captureClient("$pageview", { $current_url: url })
    for (const item of eventsForPath(pathname)) captureClient(item.event, item.properties)
    void syncIdentity()
  }, [pathname, searchParams])
  return null
}

function AnalyticsListeners() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const element = event.target instanceof Element ? event.target.closest("[data-analytics], [data-analytics-filter]") : null
      if (!(element instanceof HTMLElement)) return
      const name = element.getAttribute("data-analytics")
      if (name === "gig-ticket") {
        captureClient("gig_ticket_clicked", {
          artist: element.getAttribute("data-artist") ?? "",
          venue: element.getAttribute("data-venue") ?? "",
          area: element.getAttribute("data-area") ?? "",
        })
      } else if (name === "spotify-open") {
        captureClient("spotify_opened", {
          artist: element.getAttribute("data-artist") ?? "",
          kind: safeFilterValue(element.getAttribute("data-kind") ?? "artist"),
        })
      }
      const filter = element.getAttribute("data-analytics-filter")
      if (!filter || element instanceof HTMLSelectElement || element instanceof HTMLInputElement) return
      captureClient("filter_changed", {
        filter: safeFilterValue(filter),
        value: safeFilterValue(element.getAttribute("data-analytics-value") ?? ""),
      })
    }

    function onChange(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return
      const filter = target.getAttribute("data-analytics-filter")
      if (!filter) return
      captureClient("filter_changed", { filter: safeFilterValue(filter), value: safeFilterValue(target.value) })
    }

    function onSubmit(event: Event) {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      if (isNewsletterForm(form)) {
        captureClient("newsletter_signup", { status: "submitted" })
        return
      }
      if (isSearchForm(form)) {
        const field = form.querySelector('input[type="search"], input[name="q"], input[name="query"]')
        const queryLength = field instanceof HTMLInputElement ? field.value.trim().length : 0
        captureClient("search_used", {
          context: safeFilterValue(form.dataset.analyticsContext || form.id || "site"),
          query_length: queryLength,
        })
      }
    }

    function onNewsletter(event: Event) {
      const detail = (event as CustomEvent<{ status?: string }>).detail
      const status = detail?.status === "failed" || detail?.status === "success" ? detail.status : "submitted"
      captureClient("newsletter_signup", { status })
    }

    document.addEventListener("click", onClick)
    document.addEventListener("change", onChange)
    document.addEventListener("submit", onSubmit)
    window.addEventListener("bangers:newsletter", onNewsletter)
    return () => {
      document.removeEventListener("click", onClick)
      document.removeEventListener("change", onChange)
      document.removeEventListener("submit", onSubmit)
      window.removeEventListener("bangers:newsletter", onNewsletter)
    }
  }, [])
  return null
}

function ConsentBanner() {
  const stored = useSyncExternalStore(subscribeConsent, readBannerConsent, () => "pending" as const)
  const [choice, setChoice] = useState<"accepted" | "rejected" | null>(null)
  const consent = choice ?? stored
  if (!analyticsKey() || consent !== "unknown") return null
  return (
    <div
      role="dialog"
      aria-labelledby="analytics-consent-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-4 py-4 shadow-lg backdrop-blur-sm sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p id="analytics-consent-title" className="text-sm font-medium">
            Analytics cookies
          </p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            We use analytics to see which areas, gigs, and playlists get used. Session replay runs only after you
            accept, and anything typed into a field is masked. Reject and we do not set analytics cookies or send
            events. If your browser sends Do Not Track, analytics stay off.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" className="h-10 px-4" onClick={() => choose("rejected", setChoice)}>
            Reject
          </Button>
          <Button type="button" variant="outline" className="h-10 px-4" onClick={() => choose("accepted", setChoice)}>
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  )
}

function choose(choice: "accepted" | "rejected", setChoice: (value: "accepted" | "rejected") => void) {
  applyConsent(choice)
  setChoice(choice)
}

function subscribeConsent() {
  return () => {}
}

function readBannerConsent(): "accepted" | "rejected" | "unknown" {
  if (!analyticsKey()) return "accepted"
  return currentConsent()
}

function isNewsletterForm(form: HTMLFormElement): boolean {
  const marker = `${form.dataset.analyticsForm ?? ""} ${form.id} ${form.getAttribute("name") ?? ""} ${form.action}`
  return form.dataset.analyticsForm === "newsletter" || /newsletter/i.test(marker)
}

function isSearchForm(form: HTMLFormElement): boolean {
  return (
    form.dataset.analyticsForm === "search" ||
    form.getAttribute("role") === "search" ||
    Boolean(form.querySelector('input[type="search"]'))
  )
}
