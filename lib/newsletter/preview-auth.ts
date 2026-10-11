import { cookies } from "next/headers"

import { newsletterEnv } from "@/lib/newsletter/config"
import { cookieOptions } from "@/lib/session"
import { hashToken, secretMatches } from "@/lib/newsletter/tokens"

export const PREVIEW_COOKIE = "bangers_newsletter_preview"

export async function previewCookieMatches(): Promise<boolean> {
  const expected = newsletterEnv().previewSecret
  if (!expected) return false
  const jar = await cookies()
  const value = jar.get(PREVIEW_COOKIE)?.value || ""
  return secretMatches(value, hashToken(expected))
}

export async function grantPreviewCookie(secret: string): Promise<boolean> {
  const expected = newsletterEnv().previewSecret
  if (!expected || !secretMatches(secret, expected)) return false
  const jar = await cookies()
  jar.set(PREVIEW_COOKIE, hashToken(expected), cookieOptions(60 * 60 * 12))
  return true
}
