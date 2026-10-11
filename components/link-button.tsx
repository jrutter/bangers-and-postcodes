"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"

export function LinkButton({
  href,
  children,
  variant = "default",
}: {
  href: string
  children: React.ReactNode
  variant?: "default" | "outline" | "secondary" | "ghost"
}) {
  return (
    <Button variant={variant} size="lg" className="h-10 px-4" render={<Link href={href} />}>
      {children}
    </Button>
  )
}
