import { connection } from "next/server"

import { NewsletterForm } from "@/components/newsletter-form"
import { areaPostcodeMap, newsletterAreas } from "@/lib/newsletter/areas"
import { signupEnabled } from "@/lib/newsletter/config"
import { hasSpotifySession } from "@/lib/session"

export async function NewsletterSignup({
  placement,
  defaultAreas = [],
  inferPath = false,
}: {
  placement: "footer" | "panel"
  defaultAreas?: string[]
  inferPath?: boolean
}) {
  await connection()
  const loggedIn = await hasSpotifySession()
  return (
    <NewsletterForm
      placement={placement}
      enabled={signupEnabled()}
      loggedIn={loggedIn}
      options={newsletterAreas()}
      defaultAreas={defaultAreas}
      inferPath={inferPath}
      areaPostcodes={inferPath ? areaPostcodeMap() : {}}
    />
  )
}
