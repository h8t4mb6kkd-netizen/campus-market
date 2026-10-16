export function MiniBarChart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      <div className="flex h-32 items-stretch gap-2">
        {data.map((day) => (
          <div key={day.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-muted">{day.value}</span>
            <div
              className="w-full rounded-t bg-brand/75"
              style={{ height: `${Math.max(4, Math.round((day.value / max) * 100))}%` }}
            />
            <span className="text-[10px] text-muted">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
