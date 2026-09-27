import type { ReactNode } from 'react'
import { PiggyBank } from 'lucide-react'
import { money, type Direction } from '@/lib/money'
import { cn } from '@/lib/utils'

/** Category or label a row belongs to, as the chip and border need it. */
export type CatLike = { name: string; color: string | null; is_investment?: boolean }

const dayFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// Local-date parse: `new Date('YYYY-MM-DD')` would read it as UTC and shift the day.
export const dayLabel = (iso: string) => cap(dayFmt.format(new Date(`${iso}T00:00:00`)))

export function TxnChip({ item }: { item: CatLike }) {
  return (
    <>
      <span className="inline-flex max-w-40 items-center gap-1.5 truncate rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
        {item.color && (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: item.color }}
          />
        )}
        {item.name}
      </span>
    </>
  )
}

/** Mobile transaction row (transactions list + draft sheet): tinted border, day, description, chip, amount, action slot. Compact: one line — day, description, amount; no chip, no actions. */
export function TxnRow({
  date,
  description,
  amount,
  direction,
  category,
  compact,
  children,
}: {
  date: string
  description: string
  amount: string | number
  direction: Direction
  category?: CatLike | null
  compact?: boolean
  children?: ReactNode
}) {
  if (compact)
    return (
      <article
        className="flex items-center gap-2 rounded-lg border bg-card p-3"
        style={category?.color ? { borderColor: `color-mix(in srgb, ${category.color} 45%, transparent)` } : undefined}
      >
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dayLabel(date)}</span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <p className="truncate text-sm font-medium">{description}</p>
          {category?.is_investment && (
            <PiggyBank className="size-3.5 shrink-0 text-muted-foreground" aria-label="Investment" />
          )}
        </div>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', direction === 'earn' && 'text-emerald-600')}>
          {money(amount, direction)}
        </span>
      </article>
    )
  return (
    <article
      className="flex items-center gap-2 rounded-lg border bg-card p-3"
      style={category?.color ? { borderColor: `color-mix(in srgb, ${category.color} 45%, transparent)` } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dayLabel(date)}</span>
          <p className="truncate text-sm font-medium">{description}</p>
          {category?.is_investment && (
            <PiggyBank className="size-3.5 shrink-0 self-center text-muted-foreground" aria-label="Investment" />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">{category && <TxnChip item={category} />}</div>
      </div>
      <span className={cn('shrink-0 text-sm font-semibold tabular-nums', direction === 'earn' && 'text-emerald-600')}>
        {money(amount, direction)}
      </span>
      {children}
    </article>
  )
}
