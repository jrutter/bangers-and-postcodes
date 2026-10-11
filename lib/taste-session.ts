import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { safeReturnPath, scopeAllowsTaste } from "@/lib/oauth"
import { COOKIE, accessIsFresh } from "@/lib/session"
import type { TasteProfile } from "@/lib/taste"
import { readUserTaste, TasteScopeError } from "@/lib/taste-spotify"

export type TasteAccess = "anonymous" | "needs-scope" | "granted" | "unknown"

export type TasteSession =
  | { status: "anonymous" }
  | { status: "needs-scope" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: TasteProfile }

/** Cookie check only. Taste itself is loaded per request and not stored. */
export async function tasteAccess(): Promise<TasteAccess> {
  const jar = await cookies()
  const loggedIn = Boolean(jar.get(COOKIE.access)?.value || jar.get(COOKIE.refresh)?.value)
  if (!loggedIn) return "anonymous"
  const scope = jar.get(COOKIE.scope)?.value
  if (!scope) return "unknown"
  return scopeAllowsTaste(scope) ? "granted" : "needs-scope"
}

export async function loadTasteSession(returnTo: string): Promise<TasteSession> {
  const jar = await cookies()
  const accessToken = jar.get(COOKIE.access)?.value
  const expires = Number(jar.get(COOKIE.expires)?.value || "0")
  const refresh = jar.get(COOKIE.refresh)?.value
  if (!accessIsFresh(accessToken, expires) && refresh) {
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(safeReturnPath(returnTo, "/"))}`)
  }
  const access = await tasteAccess()
  if (access === "anonymous") return { status: "anonymous" }
  if (access === "needs-scope") return { status: "needs-scope" }
  if (!accessIsFresh(accessToken, expires)) {
    return { status: "error", message: "Spotify login expired. Log in again to rank by your taste." }
  }
  try {
    const profile = await readUserTaste(accessToken)
    if (Object.keys(profile.byName).length === 0 && !profile.genresAvailable) return { status: "empty" }
    return { status: "ready", profile }
  } catch (error) {
    if (error instanceof TasteScopeError) return { status: "needs-scope" }
    return { status: "error", message: "Spotify taste could not be loaded. These lists stay in their usual order." }
  }
}
