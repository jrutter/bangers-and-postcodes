import { initBrowserAnalytics } from "@/lib/posthog-browser"

try {
  initBrowserAnalytics()
} catch {
  // Analytics must not block the app when PostHog fails to start.
}
