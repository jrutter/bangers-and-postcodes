"use client"

import { Button } from "@/components/ui/button"

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm font-medium tracking-[0.16em] text-info uppercase">Error</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight">This page did not load</h1>
      <p className="text-muted-foreground">
        The catalogue is still on disk. Try the page again, or go back to the list of postcodes.
      </p>
      <Button type="button" className="h-10 px-4" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  )
}
