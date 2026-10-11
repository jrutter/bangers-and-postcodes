import { LinkButton } from "@/components/link-button"

export default function NotFound() {
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm font-medium tracking-[0.16em] text-primary uppercase">Missing</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight">That postcode is not on the map</h1>
      <p className="text-muted-foreground">
        This version covers southwest London, from Barnes to Wimbledon. Pick one of those areas from the home page.
      </p>
      <LinkButton href="/">Back home</LinkButton>
    </div>
  )
}
