import Link from "next/link"

export function TasteSort({
  pathname,
  sort,
  query,
}: {
  pathname: string
  sort: "date" | "for-you"
  query?: Record<string, string | undefined>
}) {
  return (
    <p className="flex flex-wrap gap-3 text-sm">
      <SortLink href={withSort(pathname, query, null)} active={sort === "date"}>
        Date
      </SortLink>
      <SortLink href={withSort(pathname, query, "for-you")} active={sort === "for-you"}>
        For you
      </SortLink>
    </p>
  )
}

function withSort(pathname: string, query: Record<string, string | undefined> | undefined, sort: string | null): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) params.set(key, value)
  }
  if (sort) params.set("sort", sort)
  const text = params.toString()
  return text ? `${pathname}?${text}` : pathname
}

function SortLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "font-medium text-foreground underline decoration-primary underline-offset-4"
          : "text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
      }
    >
      {children}
    </Link>
  )
}
