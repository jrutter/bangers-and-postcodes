"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { AreaChecklist } from "@/components/area-checklist"
import { updateAreasAction } from "@/app/newsletter/preferences/actions"
import { Button } from "@/components/ui/button"

export function PreferenceForm({
  token,
  options,
  selected,
  status,
}: {
  token: string
  options: { code: string; label: string; regionName?: string }[]
  selected: string[]
  status: "confirmed" | "pending" | "unsubscribed"
}) {
  const [state, action] = useActionState(updateAreasAction, null)
  if (status === "unsubscribed") {
    return <p className="text-sm leading-6">This address is unsubscribed. Sign up again from any area page to rejoin.</p>
  }
  if (status !== "confirmed") {
    return <p className="text-sm leading-6">Confirm the signup email before changing areas.</p>
  }
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <input type="hidden" name="token" value={token} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Areas</legend>
        <p className="text-sm text-muted-foreground">Grouped by region. Pick up to 12.</p>
        <AreaChecklist options={options} defaults={selected} />
      </fieldset>
      <SaveButton />
      {state?.status === "updated" ? <p className="text-sm leading-6">Areas saved. The next Thursday email uses this list.</p> : null}
      {state?.status === "invalid" ? <p className="text-sm text-destructive">{state.message}</p> : null}
    </form>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="h-10 px-4" disabled={pending}>
      {pending ? "Saving…" : "Save areas"}
    </Button>
  )
}
