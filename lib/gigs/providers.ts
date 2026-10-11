import { skiddleProvider } from "@/lib/gigs/skiddle"
import { ticketmasterProvider } from "@/lib/gigs/ticketmaster"
import type { GigProvider, GigProviderId } from "@/lib/gigs/types"

/** Add a provider by implementing GigProvider and appending it here. */
export const gigProviders: GigProvider[] = [skiddleProvider, ticketmasterProvider]

export function gigProviderFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const ids = gigProviders.filter((provider) => provider.configured(env)).map((provider) => provider.id)
  return ids.join("+") || "none"
}

export function providerById(id: GigProviderId): GigProvider | undefined {
  return gigProviders.find((provider) => provider.id === id)
}
