import { useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Camera, ImagePlus, Loader2, ScanLine, Trash2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { money } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'

type Category = { id: number; name: string }
type DraftRow = { id: number; date: string; description: string; amount: string | number; category_id: number | null }
// id < 0 ⇒ row not on the server yet (POST on first commit), id > 0 ⇒ PATCH.
type Draft = { id: number; source: string; status: string; created_at: string; rows?: DraftRow[] }
type RowValues = { date: string; description: string; amount: string; category_id: string }
type RowBody = { date: string; description: string; amount: string; direction: 'spend'; category_id: number }

// 16px: iOS Safari zooms focused inputs below 16px.
const field =
  'h-10 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
const MAX_BYTES = 10 * 1024 * 1024
const dtFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const pad = (n: number) => String(n).padStart(2, '0')
const TODAY = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')
const toBody = (v: RowValues): RowBody => ({
  date: v.date,
  description: v.description.trim(),
  amount: Number(v.amount.replace(',', '.')).toFixed(2),
  direction: 'spend',
  category_id: Number(v.category_id),
})
// Valid only when every field is filled — an incomplete row stays local until it is.
const valid = (v: RowValues) =>
  !!v.date && !!v.description.trim() && !!v.category_id && Number(v.amount.replace(',', '.')) > 0

export function DraftsPage() {
  const qc = useQueryClient()
  const [working, setWorking] = useState<null | 'upload' | 'extract'>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api<Draft[]>('/drafts') })
  // ponytail: the list may omit rows, so cards fetch each open draft's detail (few drafts, cheap N+1).
  const details = useQueries({
    queries: (drafts.data ?? []).map((d) => ({
      queryKey: ['draft', d.id],
      queryFn: () => api<Draft>(`/drafts/${d.id}`),
    })),
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new ApiError(400, 'Choose an image file.')
      if (file.size > MAX_BYTES) throw new ApiError(400, 'Images must be 10MB or smaller.')
      setWorking('upload')
      const fd = new FormData()
      fd.append('file', file)
      const { upload_id } = await api<{ upload_id: number }>('/uploads', { method: 'POST', body: fd })
      setWorking('extract')
      return api<Draft>('/drafts/from-upload', { method: 'POST', body: JSON.stringify({ upload_id }) })
    },
    // Cancel-safe: leaving the page mid-extraction is fine — this still runs and the list refreshes.
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ['drafts'] })
      toast.success(`Draft created with ${draft.rows?.length ?? 0} rows`)
      setDetailId(draft.id)
    },
    onError: fail,
    onSettled: () => setWorking(null),
  })

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) upload.mutate(file)
  }

  const list = drafts.data ?? []
  return (
    <div className="p-4 pb-24">
      <h1 className="text-xl font-semibold">Drafts</h1>
      <p className="mt-1 text-sm text-muted-foreground">Photograph a receipt, check the rows, approve them in.</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" disabled={!!working} onClick={() => cameraRef.current?.click()}>
          <Camera aria-hidden /> Camera
        </Button>
        <Button variant="outline" className="h-11" disabled={!!working} onClick={() => fileRef.current?.click()}>
          <ImagePlus aria-hidden /> File
        </Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />

      {working && (
        <div role="status" className="mt-3 flex items-center gap-3 rounded-lg border bg-card p-4">
          <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium">{working === 'upload' ? 'Uploading photo…' : 'Reading the receipt…'}</p>
            <p className="text-xs text-muted-foreground">Takes a few seconds. You can leave this page.</p>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {drafts.isPending && !working && (
          <>
            <div className="h-[4.25rem] animate-pulse rounded-lg bg-muted" />
            <div className="h-[4.25rem] animate-pulse rounded-lg bg-muted" />
          </>
        )}
        {drafts.isError && <p className="text-sm text-destructive">Could not load drafts.</p>}
        {list.map((d, i) => {
          const rows = details[i]?.data?.rows ?? d.rows
          return <DraftCard key={d.id} draft={d} rows={rows} onOpen={() => setDetailId(d.id)} />
        })}
        {!drafts.isPending && !drafts.isError && list.length === 0 && !working && (
          <p className="mt-6 text-sm text-muted-foreground">No open drafts. Photograph a receipt to create one.</p>
        )}
      </div>

      {detailId !== null && (
        <DraftDetail key={detailId} id={detailId} categories={categories.data ?? []} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}

function DraftCard({ draft, rows, onOpen }: { draft: Draft; rows?: DraftRow[]; onOpen: () => void }) {
  const total = (rows ?? []).reduce((n, r) => n + Number(r.amount), 0)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg border bg-card p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <ScanLine className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{rows?.[0]?.description || 'Receipt'}</span>
        <span className="block text-xs text-muted-foreground">
          {rows ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} · ${dtFmt.format(new Date(draft.created_at))}` : '…'}
        </span>
      </span>
      {rows && <span className="shrink-0 text-sm font-semibold tabular-nums">{money(total, 'spend')}</span>}
    </button>
  )
}

function DraftDetail({ id, categories, onClose }: { id: number; categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient()
  // Local rows win over refetches so a blur-save doesn't clobber edits in other rows;
  // reset to null to re-sync from the server (after an error).
  const [local, setLocal] = useState<DraftRow[] | null>(null)
  const draft = useQuery({ queryKey: ['draft', id], queryFn: () => api<Draft>(`/drafts/${id}`) })
  const rows = local ?? draft.data?.rows ?? []
  const total = rows.reduce((n, r) => n + Number(r.amount), 0)

  const save = useMutation({
    mutationFn: ({ rowId, body }: { rowId: number; body: RowBody }) =>
      rowId > 0
        ? api<DraftRow>(`/drafts/${id}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api<DraftRow>(`/drafts/${id}/rows`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (saved, { rowId }) => {
      if (rowId > 0) return
      setLocal((rs) => (rs ?? rows).map((r) => (r.id === rowId ? saved : r)))
      qc.invalidateQueries({ queryKey: ['drafts'] })
    },
    onError: (e) => {
      fail(e)
      setLocal(null)
      qc.invalidateQueries({ queryKey: ['draft', id] })
    },
  })
  const removeRow = useMutation({
    mutationFn: (rowId: number) => api(`/drafts/${id}/rows/${rowId}`, { method: 'DELETE' }),
    onMutate: (rowId) => setLocal((rs) => (rs ?? rows).filter((r) => r.id !== rowId)),
    onError: (e) => {
      fail(e)
      setLocal(null)
      qc.invalidateQueries({ queryKey: ['draft', id] })
    },
  })
  const done = useMutation({
    mutationFn: (discard: boolean) =>
      discard
        ? api(`/drafts/${id}`, { method: 'DELETE' })
        : api(`/drafts/${id}/approve`, { method: 'POST' }),
    onSuccess: (_data, discard) => {
      toast.success(discard ? 'Draft discarded' : `Approved — ${rows.length} transactions added`)
      qc.invalidateQueries({ queryKey: ['drafts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
      onClose()
    },
    onError: fail,
  })
  const busy = save.isPending || removeRow.isPending || done.isPending

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Draft receipt"
      description={rows.length ? `${rows.length} rows · ${money(total, 'spend')}` : 'No rows'}
    >
      {draft.isPending && <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>}

      <div className="space-y-4">
        {rows.map((row) => (
          <RowFields
            key={row.id}
            initial={row}
            categories={categories}
            onCommit={(v) => save.mutate({ rowId: row.id, body: toBody(v) })}
            onRemove={() => (row.id > 0 ? removeRow.mutate(row.id) : setLocal((rs) => (rs ?? rows).filter((r) => r.id !== row.id)))}
          />
        ))}
        <Button
          variant="outline"
          className="h-11 w-full border-dashed"
          disabled={rows.some((r) => r.id < 0)}
          onClick={() =>
            setLocal((rs) => [...(rs ?? rows), { id: -Date.now(), date: TODAY(), description: '', amount: '', category_id: null }])
          }
        >
          <ScanLine aria-hidden /> Add row
        </Button>
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1"
          disabled={busy}
          onClick={() => {
            if (confirm('Discard this draft and its rows?')) done.mutate(true)
          }}
        >
          Discard
        </Button>
        <Button className="h-11 flex-1" disabled={busy || rows.length === 0} onClick={() => done.mutate(false)}>
          Approve{rows.length ? ` (${rows.length})` : ''}
        </Button>
      </div>
    </Sheet>
  )
}

function RowFields({
  initial,
  categories,
  onCommit,
  onRemove,
}: {
  initial: DraftRow
  categories: Category[]
  onCommit: (v: RowValues) => void
  onRemove: () => void
}) {
  const [values, setValues] = useState<RowValues>({
    date: initial.date,
    description: initial.description,
    amount: String(initial.amount),
    category_id: initial.category_id ? String(initial.category_id) : '',
  })
  const [saved, setSaved] = useState(values)
  const set =
    (k: keyof RowValues) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [k]: e.target.value }))

  const commit = (next: RowValues) => {
    if (JSON.stringify(next) === JSON.stringify(saved)) return
    setSaved(next)
    if (valid(next)) onCommit(next)
  }

  return (
    <div className="grid grid-cols-[7.5rem_1fr_2.75rem] items-start gap-1.5 rounded-lg border bg-card p-2">
      <input type="date" required aria-label="Date" className={cn(field, 'tabular-nums')} value={values.date} onChange={set('date')} onBlur={() => commit(values)} />
      <select aria-label="Category" required className={field} value={values.category_id} onChange={(e) => { set('category_id')(e); commit({ ...values, category_id: e.target.value }) }}>
        <option value="" disabled>
          Category…
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label="Remove row" onClick={onRemove}>
        <Trash2 aria-hidden />
      </Button>
      <div className="col-span-2 grid grid-cols-[1fr_6rem] gap-1.5">
        <input
          required
          maxLength={200}
          aria-label="Description"
          placeholder="Description"
          className={field}
          value={values.description}
          onChange={set('description')}
          onBlur={() => commit(values)}
        />
        <input
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          aria-label="Amount (€)"
          className={cn(field, 'tabular-nums')}
          value={values.amount}
          onChange={set('amount')}
          onBlur={() => {
            const n = Number(values.amount.replace(',', '.'))
            if (values.amount && (!Number.isFinite(n) || n <= 0)) {
              toast.error('Enter a valid amount.')
              setValues((v) => ({ ...v, amount: saved.amount }))
              return
            }
            commit(values)
          }}
        />
      </div>
    </div>
  )
}
