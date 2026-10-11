"use client"

import dynamic from "next/dynamic"

import type { MapModel } from "@/lib/map-model"

const SouthwestMap = dynamic(() => import("@/components/southwest-map").then((mod) => mod.SouthwestMap), {
  ssr: false,
  loading: () => <div className="h-[58vh] min-h-72 rounded-xl bg-muted sm:h-[68vh]" />,
})

export function MapCanvas({ model }: { model: MapModel }) {
  return <SouthwestMap model={model} />
}
