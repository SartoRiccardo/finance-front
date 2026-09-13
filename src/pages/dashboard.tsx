import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { money } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// Numeric(12,2) may serialize as string — money()/Number() take both.
type Cell = number | string
type MonthRow = {
  month: number
  spent: Cell
  invested: Cell
  earned: Cell
  monthly_total: Cell
  monthly_liquid: Cell
  cum_total: Cell
  cum_liquid: Cell
}
type Yearly = {
  year: number
  months: MonthRow[]
  totals: { spent: Cell; invested: Cell; earned: Cell; total_cash: Cell; liquid_cash: Cell }
}

// Current year default; 2024–2027 minimum, extended so "now" is always offered.
const YEARS = Array.from({ length: Math.max(2027, new Date().getFullYear()) - 2023 }, (_, i) => 2024 + i)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const monthLabel = (m: number) =>
  cap(new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(new Date(2000, m - 1, 1)))

const COLS = [
  { label: 'Spent', k: 'spent' },
  { label: 'Invested', k: 'invested' },
  { label: 'Earned', k: 'earned' },
  { label: 'Total', k: 'monthly_total' },
  { label: 'Liquid', k: 'monthly_liquid' },
  { label: 'Cum. total', k: 'cum_total', cum: true },
  { label: 'Cum. liquid', k: 'cum_liquid', cum: true },
] as const

// 16px: iOS Safari zooms focused inputs below 16px.
const yearField =
  'h-10 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// Spreadsheet convention: zero renders as —, negatives keep the minus sign (red tint).
const value = (v: Cell) => {
  const n = Number(v)
  return <span className={cn('tabular-nums', n < 0 && 'text-destructive')}>{n === 0 ? '—' : money(n)}</span>
}

function Row({ label, v }: { label: string; v: Cell }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value(v)}</dd>
    </div>
  )
}

export function DashboardPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  // Cache key includes the year — each year has its own entry.
  const yearly = useQuery({
    queryKey: ['reports', 'yearly', year],
    queryFn: () => api<Yearly>(`/reports/yearly?year=${year}`),
  })
  const totals = yearly.data?.totals
  const months = yearly.data?.months ?? []
  const monthly = COLS.filter((c) => !('cum' in c))
  const cums = COLS.filter((c) => 'cum' in c)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <select
          aria-label="Year"
          className={cn(yearField, 'tabular-nums')}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {totals && (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {(
            [
              ['Spent', totals.spent],
              ['Invested', totals.invested],
              ['Earned', totals.earned],
              ['Total cash', totals.total_cash],
              ['Liquid cash', totals.liquid_cash],
            ] as const
          ).map(([label, v], i) => (
            <div key={label} className={cn('rounded-lg border bg-card p-3', i === 4 && 'col-span-2 md:col-span-1')}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{money(v)}</p>
            </div>
          ))}
        </div>
      )}

      {yearly.isPending && (
        <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
          Loading…
        </p>
      )}
      {yearly.isError && (
        <div className="mt-6 flex items-center gap-3 text-sm">
          <p role="alert" className="text-destructive">
            Could not load the report{yearly.error instanceof ApiError ? `: ${yearly.error.message}` : '.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => yearly.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Mobile: one card per month; cumulative block tinted to read as a group. */}
      <div className="mt-3 grid gap-2 md:hidden">
        {months.map((m) => (
          <article key={m.month} className="rounded-lg border bg-card p-3">
            <h2 className="text-sm font-medium">{monthLabel(m.month)}</h2>
            <dl className="mt-2 space-y-1">
              {monthly.map((c) => (
                <Row key={c.k} label={c.label} v={m[c.k]} />
              ))}
              <div className="mt-2 space-y-1 rounded-md bg-muted/60 px-2 py-1.5">
                {cums.map((c) => (
                  <Row key={c.k} label={c.label} v={m[c.k]} />
                ))}
              </div>
            </dl>
          </article>
        ))}
      </div>

      {/* Desktop: the spreadsheet table, cumulative columns tinted. */}
      <div className="hidden md:block">
        <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Monthly breakdown for {year}</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 font-medium">
                  Month
                </th>
                {COLS.map((c) => (
                  <th
                    key={c.k}
                    scope="col"
                    className={cn('px-2 py-2 text-right font-medium', 'cum' in c && 'bg-muted/60')}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-b last:border-b-0">
                  <td className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 font-medium">{monthLabel(m.month)}</td>
                  {COLS.map((c) => (
                    <td key={c.k} className={cn('px-2 py-2 text-right', 'cum' in c && 'bg-muted/60')}>
                      {value(m[c.k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
