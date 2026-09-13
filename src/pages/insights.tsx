import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, ApiError } from '@/lib/api'
import { money } from '@/lib/money'
import { MONTHS, monthEnd, monthShort } from '@/lib/months'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// Numeric(12,2) may serialize as string — money()/Number() take both.
type Cell = number | string
type CatRow = { category_id: number; name: string; is_investment: boolean; total: Cell }
type CatSeries = { category_id: number; name: string; is_investment: boolean; months: Cell[] }
type Category = { id: number; color: string | null }

const VIEWS = { breakdown: 'Breakdown', chart: 'Trend' } as const
type View = keyof typeof VIEWS
const TOP_N = 8

// Neutral ink for color-less categories and the residual "Other" bucket — a
// non-entity color on purpose (dataviz: contrast ≥3:1 passes on both surfaces;
// the categorical chroma-floor "FAIL" is the point — it must read as gray, not
// as another category). ponytail: can collide with an explicitly gray category
// (#6b7280/#475569); differentiate visually if that ever bites in real data.
const NEUTRAL = 'var(--muted-foreground)'

// 16px: iOS Safari zooms focused inputs below 16px.
const field =
  'h-10 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong')

export function InsightsPage() {
  const [month, setMonth] = useState(MONTHS[0].value)
  const [view, setView] = useState<View>('breakdown')
  // Legend taps toggle lines (recharts v3 legend isn't clickable — custom content).
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  const from = `${month}-01`
  const to = monthEnd(month)
  const year = Number(month.slice(0, 4))

  const byCat = useQuery({
    queryKey: ['reports', 'by-category', month],
    queryFn: () => api<CatRow[]>(`/reports/by-category?from=${from}&to=${to}`),
  })
  // Only fetched once the trend view is opened.
  const trend = useQuery({
    queryKey: ['reports', 'category-series', year],
    queryFn: () => api<CatSeries[]>(`/reports/category-series?year=${year}`),
    enabled: view === 'chart',
  })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const colorOf = new Map((categories.data ?? []).map((c) => [c.id, c.color]))

  useEffect(() => {
    if (byCat.error) fail(byCat.error)
    if (trend.error) fail(trend.error)
  }, [byCat.error, trend.error])

  const rows = byCat.data ?? []
  const grand = rows.reduce((a, r) => a + Number(r.total), 0)
  const max = Math.max(...rows.map((r) => Number(r.total)), 0)
  const spend = rows.filter((r) => !r.is_investment)
  const invested = rows.filter((r) => r.is_investment)

  // Top 8 by the charted period's total (the year), tail folded into "Other".
  const withData = (trend.data ?? [])
    .map((s) => ({ s, sums: s.months.map(Number), sum: s.months.reduce<number>((a, b) => a + Number(b), 0) }))
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum)
  const top = withData.slice(0, TOP_N)
  const rest = withData.slice(TOP_N)
  const hasOther = rest.length > 0
  const keyOf = (id: number) => `c${id}`
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const point: Record<string, string | number> = { name: monthShort(i + 1) }
    for (const { s, sums } of top) point[keyOf(s.category_id)] = sums[i]
    if (hasOther) point.other = rest.reduce((a, x) => a + x.sums[i], 0)
    return point
  })
  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? month

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Insights</h1>
        <select
          aria-label="Month"
          className={cn(field, 'tabular-nums')}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div role="radiogroup" aria-label="View" className="mt-3 grid max-w-xs grid-cols-2 rounded-md border p-1">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            onClick={() => setView(v)}
            className={cn(
              'min-h-9 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {VIEWS[v]}
          </button>
        ))}
      </div>

      {byCat.isPending && (
        <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
          Loading…
        </p>
      )}
      {byCat.isError && (
        <div className="mt-6">
          <Button variant="outline" size="sm" onClick={() => byCat.refetch()}>
            Retry
          </Button>
        </div>
      )}

      <div className="mt-3 grid gap-6 md:grid-cols-2">
        {view === 'breakdown' && byCat.isSuccess && (
          <section aria-label={`Spending by category, ${monthLabel}`}>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No spending recorded in {monthLabel}.</p>
            ) : (
              <>
                <BarList rows={spend} colorOf={colorOf} max={max} grand={grand} />
                {invested.length > 0 && (
                  <>
                    <h2 className="mt-4 mb-2 text-xs font-medium text-muted-foreground uppercase">Investments</h2>
                    <BarList rows={invested} colorOf={colorOf} max={max} grand={grand} dimmed />
                  </>
                )}
              </>
            )}
          </section>
        )}

        {view === 'chart' && (
          <section aria-label={`Per-category spending across ${year}`}>
            {trend.isPending && (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Loading…
              </p>
            )}
            {trend.isSuccess && withData.length > 0 && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
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
                      cursor={{ stroke: 'var(--border)' }}
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                    />
                    {/* Legend text in ink tokens, never the series color; taps toggle lines. */}
                    <Legend
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12 }}
                      content={(props) => (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1 text-xs">
                          {(props.payload ?? []).map((e) => {
                            const key = String(e.dataKey)
                            const off = hidden.has(key)
                            return (
                              <button
                                key={key}
                                type="button"
                                aria-pressed={!off}
                                onClick={() => toggle(key)}
                                className={cn(
                                  'flex items-center gap-1.5 text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                  off && 'line-through opacity-50',
                                )}
                              >
                                <span
                                  aria-hidden
                                  className="size-2 shrink-0 rounded-full border border-black/10"
                                  style={{ background: off ? 'var(--muted)' : (e.color ?? undefined) }}
                                />
                                {e.value}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    />
                    {/* Color follows the entity (category), same as the transaction chips. */}
                    {top.map(({ s }) => (
                      <Line
                        key={s.category_id}
                        dataKey={keyOf(s.category_id)}
                        name={s.name}
                        stroke={colorOf.get(s.category_id) ?? NEUTRAL}
                        strokeWidth={2}
                        dot={false}
                        type="monotone"
                        hide={hidden.has(keyOf(s.category_id))}
                      />
                    ))}
                    {hasOther && (
                      <Line
                        dataKey="other"
                        name="Other"
                        stroke={NEUTRAL}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        type="monotone"
                        hide={hidden.has('other')}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {trend.isSuccess && withData.length === 0 && (
              <p className="text-sm text-muted-foreground">No spending recorded in {year}.</p>
            )}
            {trend.isError && (
              <Button variant="outline" size="sm" onClick={() => trend.refetch()}>
                Retry
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function BarList({
  rows,
  colorOf,
  max,
  grand,
  dimmed,
}: {
  rows: CatRow[]
  colorOf: Map<number, string | null>
  max: number
  grand: number
  dimmed?: boolean
}) {
  return (
    <div className={cn('space-y-3', dimmed && 'opacity-60')}>
      {rows.map((r) => {
        const v = Number(r.total)
        return (
          <div key={r.category_id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className="shrink-0 tabular-nums">
                {money(v)}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {grand ? Math.round((v / grand) * 100) : 0}%
                </span>
              </span>
            </div>
            {/* Track is decorative — name, € and share carry the information. */}
            <div aria-hidden className="mt-1 h-2 rounded-sm bg-muted">
              <div
                className="h-full rounded-r-sm"
                style={{ width: `${max ? (v / max) * 100 : 0}%`, background: colorOf.get(r.category_id) ?? NEUTRAL }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
