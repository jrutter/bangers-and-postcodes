import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { assembleFavourites, dedupeFavourites, type FavouriteView } from "@/lib/england"
import { loadOrigins } from "@/lib/favourites-origin"
import { readFavouriteArtists } from "@/lib/favourites-spotify"
import { safeReturnPath, scopeAllowsTaste } from "@/lib/oauth"
import { COOKIE, accessIsFresh } from "@/lib/session"
import { TasteScopeError } from "@/lib/taste-spotify"

export type FavouriteSession =
  | { status: "anonymous" }
  | { status: "needs-scope" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; view: FavouriteView }

export async function loadFavouriteSession(returnTo: string, budgetMs = 12_000): Promise<FavouriteSession> {
  const jar = await cookies()
  const accessToken = jar.get(COOKIE.access)?.value
  const expires = Number(jar.get(COOKIE.expires)?.value || "0")
  const refresh = jar.get(COOKIE.refresh)?.value
  if (!accessIsFresh(accessToken, expires) && refresh) {
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(safeReturnPath(returnTo, "/favourites"))}`)
  }
  const loggedIn = Boolean(accessToken || refresh)
  if (!loggedIn) return { status: "anonymous" }
  const scope = jar.get(COOKIE.scope)?.value
  if (scope && !scopeAllowsTaste(scope)) return { status: "needs-scope" }
  if (!accessIsFresh(accessToken, expires)) {
    return { status: "error", message: "Spotify login expired. Log in again to see your English favourites." }
  }
  try {
    const artists = dedupeFavourites(await readFavouriteArtists(accessToken))
    if (artists.length === 0) return { status: "empty" }
    const origins = await loadOrigins(artists, budgetMs)
    const { places } = await import("@/lib/catalogue")
    return { status: "ready", view: assembleFavourites(artists, origins, places()) }
  } catch (error) {
    if (error instanceof TasteScopeError) return { status: "needs-scope" }
    return { status: "error", message: "Spotify favourites could not be loaded." }
  }
}
