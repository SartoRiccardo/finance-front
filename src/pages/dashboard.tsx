import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
  { label: 'Running total', k: 'cum_total', cum: true },
  { label: 'Running liquid', k: 'cum_liquid', cum: true },
] as const

// 16px: iOS Safari zooms focused inputs below 16px.
const yearField =
  'h-10 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// CVD-validated pairs (dataviz validator): spent/invested pass all checks on
// both surfaces. The running line is theme ink on purpose — it's the
// spreadsheet's pencil line, not a categorical series (identity via legend).
const MODES = { spend: 'Spend', liquid: 'Liquid', total: 'Total' } as const
type Mode = keyof typeof MODES

// Spreadsheet convention: zero renders as —, negatives keep the minus sign (red tint).
const value = (v: Cell) => {
  const n = Number(v)
  return <span className={cn('tabular-nums', n < 0 && 'text-destructive')}>{n === 0 ? '—' : money(n)}</span>
}

export function DashboardPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [mode, setMode] = useState<Mode>('spend')
  // Cache key includes the year — each year has its own entry.
  const yearly = useQuery({
    queryKey: ['reports', 'yearly', year],
    queryFn: () => api<Yearly>(`/reports/yearly?year=${year}`),
  })
  const totals = yearly.data?.totals
  const months = yearly.data?.months ?? []
  const chartData = months.map((m) => ({
    name: monthLabel(m.month),
    spent: Number(m.spent),
    invested: Number(m.invested),
    liquid: Number(m.monthly_liquid),
    runLiquid: Number(m.cum_liquid),
    total: Number(m.monthly_total),
    runTotal: Number(m.cum_total),
  }))

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

      {/* Graph above the table: pick a mode, then scan the numbers. */}
      {months.length > 0 && (
        <section className="mt-3">
          <div role="radiogroup" aria-label="Graph" className="mx-auto grid max-w-xs grid-cols-3 rounded-md border p-1">
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'min-h-9 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {MODES[m]}
              </button>
            ))}
          </div>

          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v: number) => Math.round(v).toLocaleString('it-IT')}
                />
                <Tooltip
                  formatter={(v) => money(Number(v))}
                  cursor={{ fill: 'var(--accent)' }}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                />
                {/* Legend text in ink tokens, never the series color. */}
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => <span className="text-muted-foreground">{v}</span>}
                />
                {mode === 'spend' && (
                  <>
                    {/* Stacked = monthly outflow with its composition; top segment rounds the stack. */}
                    <Bar dataKey="spent" name="Spent" stackId="a" fill="#f43f5e" maxBarSize={28} />
                    <Bar dataKey="invested" name="Invested" stackId="a" fill="#3b82f6" maxBarSize={28} radius={[4, 4, 0, 0]} />
                  </>
                )}
                {mode === 'liquid' && (
                  <>
                    <Bar dataKey="liquid" name="Liquid" fill="#06b6d4" maxBarSize={28} />
                    <Line dataKey="runLiquid" name="Running liquid" stroke="var(--foreground)" strokeWidth={2} dot={false} type="monotone" />
                  </>
                )}
                {mode === 'total' && (
                  <>
                    <Bar dataKey="total" name="Total" fill="#8b5cf6" maxBarSize={28} />
                    <Line dataKey="runTotal" name="Running total" stroke="var(--foreground)" strokeWidth={2} dot={false} type="monotone" />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* The spreadsheet table itself — scrolls both axes; header row and
          month column stay pinned. Opaque backgrounds where cells overlap. */}
      <div className="mt-3 max-h-[60dvh] overflow-auto rounded-lg border bg-card">
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">Monthly breakdown for {year}</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="sticky top-0 left-0 z-30 border-r bg-card py-2 pl-3 pr-3 font-medium">
                Month
              </th>
              {COLS.map((c) => (
                <th
                  key={c.k}
                  scope="col"
                  className={cn(
                    'sticky top-0 z-20 px-3 py-2 text-right font-medium whitespace-nowrap',
                    'cum' in c ? 'bg-muted' : 'bg-card',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-b last:border-b-0">
                <td className="sticky left-0 z-10 border-r bg-card py-2 pl-3 pr-3 font-medium">{monthLabel(m.month)}</td>
                {COLS.map((c) => (
                  <td key={c.k} className={cn('px-3 py-2 text-right whitespace-nowrap', 'cum' in c && 'bg-muted/60')}>
                    {value(m[c.k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
