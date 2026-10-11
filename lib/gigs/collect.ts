import { searchWindow, southwestSearchPoint } from "@/lib/geo"
import { gigProviders } from "@/lib/gigs/providers"
import { dedupeGigs, inSouthwest } from "@/lib/gigs/select"
import type { Gig, GigDeps, GigFeed, GigSearch } from "@/lib/gigs/types"

export async function collectRegionalGigs(options?: GigDeps & { now?: Date }): Promise<GigFeed> {
  const now = options?.now ?? new Date()
  const window = searchWindow(now)
  const point = southwestSearchPoint()
  const query: GigSearch = { ...point, ...window }
  const env = options?.env ?? process.env
  const deps: GigDeps = { fetchImpl: options?.fetchImpl, env }
  const reports = await Promise.all(
    gigProviders.map(async (provider) => {
      if (!provider.configured(env)) {
        return { id: provider.id, label: provider.label, configured: false, error: null, count: 0, gigs: [] as Gig[] }
      }
      try {
        const gigs = await provider.search(query, deps)
        return { id: provider.id, label: provider.label, configured: true, error: null, count: gigs.length, gigs }
      } catch (error) {
        const message = error instanceof Error ? error.message : `${provider.label} could not be loaded.`
        return { id: provider.id, label: provider.label, configured: true, error: message, count: 0, gigs: [] as Gig[] }
      }
    }),
  )
  const gigs = dedupeGigs(reports.flatMap((report) => report.gigs)).filter(inSouthwest)
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
  }
}
