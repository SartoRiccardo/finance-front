import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CirclePlus, Pencil, Trash2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { money, type Direction } from '@/lib/money'
import { MONTHS, monthEnd } from '@/lib/months'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { ColorEditor } from '@/components/color-editor'
import { TxnChip, TxnRow, dayLabel } from '@/components/txn-row'

type Category = { id: number; name: string; description: string | null; is_investment: boolean; color: string | null }
type Label = { id: number; name: string; color: string | null }
type Tx = {
  id: number
  date: string
  description: string
  amount: string | number
  direction: Direction
  category_id: number | null
  label_id: number | null
}
// id set ⇒ PATCH, missing ⇒ POST; amount as decimal string.
type TxInput = Omit<Tx, 'id' | 'amount'> & { id?: number; amount: string }
type TxPage = { items: Tx[]; total: number }
type InfTx = { pages: TxPage[]; pageParams: unknown[] }

const PAGE_SIZE = 50

// 16px: iOS Safari zooms focused inputs below 16px.
const field =
  'h-10 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// Local-date helpers: `new Date('YYYY-MM-DD')` parses as UTC and shifts the day.
const pad = (n: number) => String(n).padStart(2, '0')
const TODAY = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function TransactionsPage() {
  const [month, setMonth] = useState(TODAY().slice(0, 7))
  const [categoryId, setCategoryId] = useState('')
  const [direction, setDirection] = useState('')
  const [editing, setEditing] = useState<Tx | 'new' | null>(null)
  const [colorsOpen, setColorsOpen] = useState(false)

  const params = new URLSearchParams()
  if (month) {
    params.set('from', `${month}-01`)
    params.set('to', monthEnd(month))
  }
  if (categoryId) params.set('category_id', categoryId)
  if (direction) params.set('direction', direction)
  const qs = params.toString()
  const key = ['transactions', qs]

  // Infinite scroll: API pages at 50; the sentinel below auto-loads more.
  const tx = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      api<TxPage>(`/transactions?${qs}${qs ? '&' : ''}limit=${PAGE_SIZE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const labels = useQuery({ queryKey: ['labels'], queryFn: () => api<Label[]>('/labels') })

  const qc = useQueryClient()
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong')
  const setPages = (fn: (p: TxPage) => TxPage) => {
    const prev = qc.getQueryData<InfTx>(key)
    if (prev) qc.setQueryData<InfTx>(key, { ...prev, pages: prev.pages.map(fn) })
    return prev
  }

  const remove = useMutation({
    mutationFn: (id: number) => api(`/transactions/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      return setPages((p) =>
        p.items.some((t) => t.id === id)
          ? { ...p, items: p.items.filter((t) => t.id !== id), total: p.total - 1 }
          : p,
      )
    },
    onError: (e, _id, prev) => {
      if (prev) qc.setQueryData(key, prev)
      fail(e)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const save = useMutation({
    mutationFn: (t: TxInput) =>
      t.id
        ? api(`/transactions/${t.id}`, { method: 'PATCH', body: JSON.stringify(t) })
        : api('/transactions', { method: 'POST', body: JSON.stringify(t) }),
    onMutate: async (t) => {
      await qc.cancelQueries({ queryKey: key })
      return setPages((p) => {
        if (t.id)
          return p.items.some((x) => x.id === t.id)
            ? { ...p, items: p.items.map((x) => (x.id === t.id ? { ...x, ...t } : x)) }
            : p
        return { ...p, items: [{ ...t, id: -Date.now() } as Tx, ...p.items], total: p.total + 1 }
      })
    },
    onError: (e, _t, prev) => {
      if (prev) qc.setQueryData(key, prev)
      fail(e)
    },
    onSuccess: (_data, t) => {
      setEditing(null)
      toast.success(t.id ? 'Transaction updated' : 'Transaction added')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const labelById = new Map((labels.data ?? []).map((l) => [l.id, l]))
  const itemOf = (t: Tx) => (t.category_id ? catById.get(t.category_id) : labelById.get(t.label_id ?? -1))
  const chip = (t: Tx) => {
    const item = itemOf(t)
    return item ? <TxnChip item={item} /> : null
  }
  const actions = (t: Tx) => (
    <div className="flex justify-end">
      <Button variant="ghost" size="icon-xs" aria-label={`Edit ${t.description}`} onClick={() => setEditing(t)}>
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${t.description}`}
        onClick={() => {
          if (confirm(`Delete “${t.description}”?`)) remove.mutate(t.id)
        }}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  )

  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !tx.hasNextPage || !tx.fetchNextPage) return
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && tx.fetchNextPage(),
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [tx.hasNextPage, tx.fetchNextPage, qs])

  const items = tx.data?.pages.flatMap((p) => p.items) ?? []
  // Row border carries the category/label color, softened for light and dark.
  const rowStyle = (t: Tx) => {
    const item = itemOf(t)
    return item?.color
      ? { borderColor: `color-mix(in srgb, ${item.color} 45%, transparent)` }
      : undefined
  }
  const total = tx.data?.pages[0]?.total ?? 0
  return (
    <div className="p-4 pb-24">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <select aria-label="Month" className={field} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All time</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Category"
          className={field}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Direction"
          className={field}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        >
          <option value="">All</option>
          <option value="spend">Spends</option>
          <option value="earn">Earnings</option>
        </select>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {tx.isPending ? 'Loading…' : tx.isError ? 'Could not load transactions.' : `${total} transactions`}
        </p>
        <Button
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
          onClick={() => setColorsOpen(true)}
        >
          Colors
        </Button>
      </div>

      <div className="mt-3 space-y-2 md:hidden">
        {items.map((t) => (
          <TxnRow
            key={t.id}
            date={t.date}
            description={t.description}
            amount={t.amount}
            direction={t.direction}
            category={itemOf(t)}
          >
            {actions(t)}
          </TxnRow>
        ))}
      </div>

      <div className="hidden md:block">
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 font-medium">Date</th>
              <th scope="col" className="py-2 font-medium">Description</th>
              <th scope="col" className="py-2 font-medium">Category</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b" style={rowStyle(t)}>
                <td className="py-2 tabular-nums">{dayLabel(t.date)}</td>
                <td className="py-2">{t.description}</td>
                <td className="py-2">
                  <span className="flex items-center gap-1.5">{chip(t)}</span>
                </td>
                <td className={cn('py-2 text-right font-medium tabular-nums', t.direction === 'earn' && 'text-emerald-600')}>
                  {money(t.amount, t.direction)}
                </td>
                <td className="py-2">{actions(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!tx.isPending && !tx.isError && items.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No transactions here yet.</p>
      )}

      <div ref={sentinel} className="min-h-10 pt-3 text-center text-xs text-muted-foreground">
        {tx.isFetchingNextPage && 'Loading…'}
      </div>

      <Button
        aria-label="Add transaction"
        size="icon-lg"
        onClick={() => setEditing('new')}
        className="fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-lg lg:bottom-6"
      >
        <CirclePlus className="size-6" aria-hidden />
      </Button>

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New transaction' : 'Edit transaction'}
        description="Spends pick a category, earnings pick a label."
      >
        <TxForm
          tx={editing === 'new' ? undefined : (editing ?? undefined)}
          categories={categories.data ?? []}
          labels={labels.data ?? []}
          pending={save.isPending}
          onSubmit={(t) => save.mutate(t)}
          onCancel={() => setEditing(null)}
        />
      </Sheet>

      <ColorEditor open={colorsOpen} onOpenChange={setColorsOpen} />
    </div>
  )
}

function TxForm({
  tx,
  categories,
  labels,
  pending,
  onSubmit,
  onCancel,
}: {
  tx?: Tx
  categories: Category[]
  labels: Label[]
  pending: boolean
  onSubmit: (t: TxInput) => void
  onCancel: () => void
}) {
  const [direction, setDirection] = useState<Direction>(tx?.direction ?? 'spend')
  const [date, setDate] = useState(tx?.date ?? TODAY())
  const [description, setDescription] = useState(tx?.description ?? '')
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '')
  const [categoryId, setCategoryId] = useState(tx?.category_id ? String(tx.category_id) : '')
  const [labelId, setLabelId] = useState(tx?.label_id ? String(tx.label_id) : '')
  const [error, setError] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount.replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) return setError('Enter a valid amount.')
    const refId = direction === 'spend' ? categoryId : labelId
    if (!refId) return setError(direction === 'spend' ? 'Pick a category.' : 'Pick a label.')
    setError('')
    onSubmit({
      id: tx?.id,
      date,
      description: description.trim(),
      amount: n.toFixed(2),
      direction,
      category_id: direction === 'spend' ? Number(refId) : null,
      label_id: direction === 'earn' ? Number(refId) : null,
    })
  }

  return (
    <form onSubmit={submit}>
      <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 rounded-md border p-1">
        {(['spend', 'earn'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={direction === d}
            onClick={() => setDirection(d)}
            className={cn(
              'min-h-9 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              direction === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {d === 'spend' ? 'Spend' : 'Earn'}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="tx-date" className="mb-1.5 block text-sm font-medium">
            Date
          </label>
          <input
            id="tx-date"
            type="date"
            required
            className={field}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="tx-description" className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <input
            id="tx-description"
            required
            maxLength={200}
            className={field}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="tx-amount" className="mb-1.5 block text-sm font-medium">
            Amount (€)
          </label>
          <input
            id="tx-amount"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            aria-invalid={!!error && !Number.isFinite(Number(amount.replace(',', '.')))}
            className={cn(field, 'tabular-nums')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {direction === 'spend' ? (
          <div>
            <label htmlFor="tx-category" className="mb-1.5 block text-sm font-medium">
              Category
            </label>
            <select
              id="tx-category"
              required
              className={field}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="" disabled>
                Select a category…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="tx-label" className="mb-1.5 block text-sm font-medium">
              Label
            </label>
            <select id="tx-label" required className={field} value={labelId} onChange={(e) => setLabelId(e.target.value)}>
              <option value="" disabled>
                Select a label…
              </option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="h-11 flex-1" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
