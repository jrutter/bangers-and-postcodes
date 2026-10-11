import { collectRegionalGigs } from "@/lib/gigs/collect"
import { handleNewsletterCron } from "@/lib/newsletter/cron"
import { getStore } from "@/lib/newsletter/store"

export const maxDuration = 120

export async function GET(request: Request) {
  const url = new URL(request.url)
  const result = await handleNewsletterCron({
    authorization: request.headers.get("authorization"),
    dryRun: url.searchParams.get("dry") === "1",
    force: url.searchParams.get("force") === "1",
    now: new Date(),
    env: process.env,
    store: getStore(),
    loadGigs: async () => (await collectRegionalGigs()).gigs,
  })
  return Response.json(result.body, { status: result.status })
}
