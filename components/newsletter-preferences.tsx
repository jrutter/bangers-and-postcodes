"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { updateAreasAction } from "@/app/newsletter/preferences/actions"
import { Button } from "@/components/ui/button"

export function PreferenceForm({
  token,
  options,
  selected,
  status,
}: {
  token: string
  options: { code: string; label: string }[]
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((option) => (
            <label key={option.code} className="flex items-start gap-2 rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
              <input type="checkbox" name="areas" value={option.code} defaultChecked={selected.includes(option.code)} className="mt-1 size-4 accent-primary" />
              <span>
                <span className="font-medium">{option.code}</span>
                <span className="block text-muted-foreground">{option.label}</span>
              </span>
            </label>
          ))}
        </div>
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
