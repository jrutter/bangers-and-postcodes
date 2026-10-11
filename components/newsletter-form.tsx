"use client"

import { usePathname } from "next/navigation"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { AreaChecklist } from "@/components/area-checklist"
import { subscribeAction } from "@/app/newsletter/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { areasFromPathname } from "@/lib/newsletter/path"
import type { SubscribeResult } from "@/lib/newsletter/flow"

type AreaOption = { code: string; label: string; regionName?: string }

export function NewsletterForm({
  placement,
  enabled,
  loggedIn,
  options,
  defaultAreas,
  inferPath,
  areaPostcodes,
}: {
  placement: "footer" | "panel"
  enabled: boolean
  loggedIn: boolean
  options: AreaOption[]
  defaultAreas: string[]
  inferPath: boolean
  areaPostcodes: Record<string, string[]>
}) {
  const pathname = usePathname()
  const defaults = inferPath ? areasFromPathname(pathname || "/", areaPostcodes, options.map((option) => option.code)) : defaultAreas
  if (!enabled) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        The weekly email is not switched on yet. The rest of the site works as usual.
      </p>
    )
  }
  return (
    <NewsletterFields
      key={inferPath ? pathname : defaults.join(",")}
      placement={placement}
      loggedIn={loggedIn}
      options={options}
      defaults={defaults}
    />
  )
}

function NewsletterFields({
  placement,
  loggedIn,
  options,
  defaults,
}: {
  placement: "footer" | "panel"
  loggedIn: boolean
  options: AreaOption[]
  defaults: string[]
}) {
  const [state, action] = useActionState(subscribeAction, null)
  const heading = placement === "footer" ? "text-lg" : "text-3xl"
  return (
    <section className={placement === "panel" ? "space-y-4" : "space-y-3"} aria-labelledby={`newsletter-${placement}`}>
      <div className="space-y-2">
        <h2 id={`newsletter-${placement}`} className={`font-heading font-semibold tracking-tight ${heading}`}>
          This week, by postcode
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          One email a week for the districts you pick. Upcoming gigs, a few local artists, and a link to the area
          playlist. Spotify is optional.
        </p>
      </div>
      <form action={action} className="max-w-2xl space-y-4">
        <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label>
            Company
            <input name="company" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        <div className="space-y-2">
          <label htmlFor={`newsletter-email-${placement}`} className="text-sm font-medium">
            Email
          </label>
          <Input id={`newsletter-email-${placement}`} name="email" type="email" autoComplete="email" required maxLength={254} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Areas</legend>
          <p className="text-sm text-muted-foreground">Every London district, grouped by region. Pick up to 12.</p>
          <AreaChecklist options={options} defaults={defaults} />
        </fieldset>
        <label className="flex items-start gap-2 text-sm leading-6">
          <input type="checkbox" name="consent" value="yes" required className="mt-1 size-4 accent-primary" />
          <span>Email me a weekly roundup for the areas I picked. I can unsubscribe in one click.</span>
        </label>
        <p className="text-sm leading-6 text-muted-foreground">
          {loggedIn
            ? "You are logged in with Spotify. The weekly email does not store your taste. It links to For you on the site, which ranks an area from the current session."
            : "Spotify login is optional. The email is about the areas you pick. For you on the site is there if you log in later."}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          We email a confirmation link first. After that, at most one email a week. We store your email, those areas,
          and the times you sign up, confirm, and unsubscribe. We do not store Spotify listening.
        </p>
        <NewsletterSubmit />
        <FormNotice state={state} />
      </form>
    </section>
  )
}

function NewsletterSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="h-10 px-4" disabled={pending}>
      {pending ? "Sending confirmation…" : "Email me the Thursday roundup"}
    </Button>
  )
}

function FormNotice({ state }: { state: SubscribeResult | null }) {
  if (!state) return null
  if (state.status === "invalid") {
    return <p className="text-sm text-destructive">{state.message}</p>
  }
  return (
    <div className="space-y-2 text-sm leading-6">
      <p>Check your email for a confirmation link. Nothing weekly is sent until you confirm.</p>
      {state.confirmUrl ? (
        <p>
          Email sending is off in this environment.{" "}
          <a className="font-medium underline" href={state.confirmUrl}>
            Confirm this signup
          </a>
        </p>
      ) : null}
      {state.preferencesUrl ? (
        <p>
          This address is already confirmed. Email sending is off in this environment.{" "}
          <a className="font-medium underline" href={state.preferencesUrl}>
            Change areas
          </a>
        </p>
      ) : null}
    </div>
  )
}
