import { randomBytes } from "node:crypto"

import { connection } from "next/server"
import { NextRequest, NextResponse } from "next/server"

import { authorizeUrl, envValue, LOGIN_SCOPES, safeReturnPath } from "@/lib/oauth"
import { captureServerIfAllowed } from "@/lib/posthog-server"
import { COOKIE, cookieOptions } from "@/lib/session"
import { spotifyClient } from "@/lib/spotify"

export async function GET(request: NextRequest) {
  await connection()
  const client = spotifyClient()
  if (!client.configured()) {
    await reportLogin("unconfigured")
    return new NextResponse(missingCredentialsPage(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"))
  const state = randomBytes(24).toString("base64url")
  const destination = authorizeUrl({
    clientId: envValue("SPOTIFY_CLIENT_ID"),
    redirectUri: client.redirectUri(),
    state,
    scopes: LOGIN_SCOPES,
  })
  const response = NextResponse.redirect(destination)
  response.cookies.set(COOKIE.state, state, cookieOptions(60 * 10))
  response.cookies.set(COOKIE.returnTo, returnTo, cookieOptions(60 * 10))
  await reportLogin("started")
  return response
}

async function reportLogin(status: string) {
  try {
    await captureServerIfAllowed("spotify_login_started", { status })
  } catch {
    // Analytics must not block Spotify login.
  }
}

function missingCredentialsPage(): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spotify login · Bangers & Postcodes</title>
<style>
  :root { --raspberry:#A63446; --paper:#FBFEF9; --blue:#0C6291; --ink:#000004; --plum:#7E1946; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Georgia,serif }
  .kicker { letter-spacing:.16em; text-transform:uppercase; color:var(--blue); font-family:sans-serif; font-size:.8rem }
  a { color:var(--blue) }
  a:hover { color:var(--plum) }
  a:focus-visible { outline:2px solid var(--blue); outline-offset:3px }
</style>
<body>
  <main style="max-width:36rem;margin:4rem auto;padding:0 1.25rem">
    <p class="kicker">Spotify</p>
    <h1 style="font-weight:500">Log in needs API credentials</h1>
    <p style="line-height:1.6">Set <code>SPOTIFY_CLIENT_ID</code> and <code>SPOTIFY_CLIENT_SECRET</code> in <code>.env.local</code> for local dev, or in the Vercel project environment. Then set <code>SPOTIFY_REDIRECT_URI</code> if it should not be <code>http://127.0.0.1:3000/api/auth/callback</code>.</p>
    <p style="line-height:1.6">The Spotify dashboard has to allow that exact redirect URI, and the production https URL as well.</p>
    <p><a href="/playlist">Back to the playlist page</a></p>
  </main>
</body>
</html>`
}
