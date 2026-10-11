"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="h-10 px-4" disabled={pending}>
      {pending ? "Creating playlist…" : children}
    </Button>
  )
}
