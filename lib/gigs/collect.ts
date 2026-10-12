import { searchWindow } from "@/lib/geo"
import {
  SKIDDLE_PACE_MS,
  SKIDDLE_REQUEST_BUDGET,
  TICKETMASTER_PACE_MS,
  TICKETMASTER_REQUEST_BUDGET,
} from "@/lib/gigs/constants"
import { GigProviderError } from "@/lib/gigs/http"
import { gigProviders } from "@/lib/gigs/providers"
import { dedupeGigs, inLondon } from "@/lib/gigs/select"
import { londonSearchTiles } from "@/lib/gigs/tiles"
import type { Gig, GigDeps, GigFeed, GigProviderId, GigSearch } from "@/lib/gigs/types"

const PACE_MS: Record<GigProviderId, number> = {
  skiddle: SKIDDLE_PACE_MS,
  ticketmaster: TICKETMASTER_PACE_MS,
}

const REQUEST_BUDGET: Record<GigProviderId, number> = {
  skiddle: SKIDDLE_REQUEST_BUDGET,
  ticketmaster: TICKETMASTER_REQUEST_BUDGET,
}

export async function collectRegionalGigs(options?: GigDeps & { now?: Date }): Promise<GigFeed> {
  const now = options?.now ?? new Date()
  const window = searchWindow(now)
  const tiles = londonSearchTiles()
  const env = options?.env ?? process.env
  const paceMs = options?.paceMs ?? (process.env.VITEST ? 0 : undefined)
  let truncated = false
  const reports = await Promise.all(
    gigProviders.map(async (provider) => {
      if (!provider.configured(env)) {
        return { id: provider.id, label: provider.label, configured: false, error: null, count: 0, gigs: [] as Gig[] }
      }
      const requests = { current: REQUEST_BUDGET[provider.id] }
      const deps: GigDeps = {
        fetchImpl: options?.fetchImpl,
        env,
        paceMs: paceMs ?? PACE_MS[provider.id],
        requests,
      }
      const found: Gig[] = []
      let failures = 0
      let firstError: string | null = null
      for (const tile of tiles) {
        if (requests.current <= 0) {
          truncated = true
          break
        }
        const query: GigSearch = { ...tile, ...window }
        try {
          found.push(...(await provider.search(query, deps)))
        } catch (error) {
          failures += 1
          if (!firstError) {
            firstError = error instanceof Error ? error.message : `${provider.label} could not be loaded.`
          }
          if (error instanceof GigProviderError && failures >= 3) break
        }
      }
      return {
        id: provider.id,
        label: provider.label,
        configured: true,
        error: found.length === 0 ? firstError : null,
        count: found.length,
        gigs: found,
      }
    }),
  )
  const gigs = dedupeGigs(reports.flatMap((report) => report.gigs)).filter(inLondon)
  return {
    gigs,
    providers: reports.map((report) => ({
      id: report.id,
      label: report.label,
      configured: report.configured,
      error: report.error,
      count: report.count,
    })),
    from: window.from,
    to: window.to,
    ...(truncated ? { truncated: true } : {}),
  }
}
