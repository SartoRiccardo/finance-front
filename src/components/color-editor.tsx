import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { PALETTE } from '@/lib/palette'
import { cn } from '@/lib/utils'
import { Sheet } from '@/components/ui/sheet'

type Item = { id: number; name: string; color: string | null; is_investment?: boolean }
type Kind = 'categories' | 'labels'

/** Recolor categories/labels from the preset palette. */
export function ColorEditor({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<number | null>(null)
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Item[]>('/categories') })
  const labels = useQuery({ queryKey: ['labels'], queryFn: () => api<Item[]>('/labels') })

  const recolor = useMutation({
    mutationFn: ({ kind, id, color }: { kind: Kind; id: number; color: string }) =>
      api(`/${kind}/${id}`, { method: 'PATCH', body: JSON.stringify({ color }) }),
    onMutate: ({ kind, id, color }) => {
      const key = [kind] as const
      const prev = qc.getQueryData<Item[]>(key)
      if (prev) qc.setQueryData(key, prev.map((x) => (x.id === id ? { ...x, color } : x)))
      return { key, prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev)
      toast.error(e instanceof ApiError ? e.message : 'Something went wrong')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['labels'] })
    },
  })

  const section = (title: string, kind: Kind, data: Item[] | undefined) => (
    <section className="mt-4 first-of-type:mt-0">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="space-y-1.5">
        {(data ?? []).map((item) => (
          <Row
            key={item.id}
            item={item}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onPick={(color) => recolor.mutate({ kind, id: item.id, color })}
          />
        ))}
      </div>
    </section>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Colors" description="Tap a category or label, then a color.">
      {section('Categories', 'categories', categories.data)}
      {section('Labels', 'labels', labels.data)}
    </Sheet>
  )
}

function Row({
  item,
  expanded,
  onToggle,
  onPick,
}: {
  item: Item
  expanded: boolean
  onToggle: () => void
  onPick: (color: string) => void
}) {
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: item.color ?? 'transparent' }}
        />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        {item.is_investment && (
          <span className="rounded-full border px-1.5 py-0.5 text-xs text-muted-foreground">Investment</span>
        )}
      </button>
      {expanded && (
        <div role="group" aria-label={`Pick a color for ${item.name}`} className="grid grid-cols-10 gap-1.5 px-3 pb-3">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={item.color === c}
              onClick={() => onPick(c)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-md border border-black/10 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                item.color === c && 'border-foreground ring-2 ring-ring',
              )}
              style={{ backgroundColor: c }}
            >
              {item.color === c && <Check className="size-3 text-white mix-blend-difference" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
