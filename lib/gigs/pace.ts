const nextAt = new Map<string, number>()

export async function pace(key: string, ms: number): Promise<void> {
  if (ms <= 0) return
  const now = Date.now()
  const slot = nextAt.get(key) ?? 0
  const wait = slot - now
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  nextAt.set(key, Date.now() + ms)
}

export function takeRequest(remaining: { current: number } | undefined): boolean {
  if (!remaining) return true
  if (remaining.current <= 0) return false
  remaining.current -= 1
  return true
}
