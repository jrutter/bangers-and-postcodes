"use client"

import { useEffect, useRef } from "react"

import { captureClient } from "@/lib/posthog-browser"

export function ForYouShown({
  status,
  artistCount,
  gigCount,
}: {
  status: string
  artistCount: number
  gigCount: number
}) {
  const seen = useRef("")
  useEffect(() => {
    const key = `${status}:${artistCount}:${gigCount}`
    if (seen.current === key) return
    seen.current = key
    captureClient("for_you_shown", { status, artist_count: artistCount, gig_count: gigCount })
  }, [status, artistCount, gigCount])
  return null
}
