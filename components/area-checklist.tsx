export function AreaChecklist({
  options,
  defaults,
}: {
  options: { code: string; label: string; regionName?: string }[]
  defaults: string[]
}) {
  const groups = new Map<string, typeof options>()
  for (const option of options) {
    const name = option.regionName || "London"
    const list = groups.get(name) ?? []
    list.push(option)
    groups.set(name, list)
  }
  return (
    <div className="space-y-2">
      {[...groups.entries()].map(([name, list]) => {
        const open = list.some((option) => defaults.includes(option.code))
        return (
          <details key={name} open={open} className="rounded-lg bg-card px-3 py-2 ring-1 ring-border">
            <summary className="cursor-pointer text-sm font-medium">
              {name} · {list.length}
            </summary>
            <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
              {list.map((option) => (
                <label key={option.code} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="areas"
                    value={option.code}
                    defaultChecked={defaults.includes(option.code)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">{option.code}</span>
                    <span className="block text-muted-foreground">{option.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
