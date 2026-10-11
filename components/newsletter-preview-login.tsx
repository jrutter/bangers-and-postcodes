"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import { unlockPreview } from "@/app/newsletter/preview/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function PreviewLogin() {
  const router = useRouter()
  const [state, action] = useActionState(unlockPreview, null)
  useEffect(() => {
    if (state?.ok) router.refresh()
  }, [state, router])
  return (
    <form action={action} className="max-w-md space-y-3">
      <label htmlFor="preview-secret" className="text-sm font-medium">
        Preview secret
      </label>
      <Input id="preview-secret" name="secret" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" className="h-10 px-4">
        Show the email
      </Button>
      {state?.ok === false ? <p className="text-sm text-destructive">That secret does not match.</p> : null}
    </form>
  )
}
