import Link from "next/link"

export function TasteSort({ pathname, sort }: { pathname: string; sort: "date" | "for-you" }) {
  return (
    <p className="flex flex-wrap gap-3 text-sm">
      <SortLink href={pathname} active={sort === "date"}>
        Date
      </SortLink>
      <SortLink href={`${pathname}?sort=for-you`} active={sort === "for-you"}>
        For you
      </SortLink>
    </p>
  )
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
