import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'

type Settings = { llm_provider: string; llm_model: string; custom_prompts: string[] }
type ModelInfo = { id: string; name: string; input_cost: number | null; output_cost: number | null }
type Usage = {
  totals: { calls: number; input_tokens: number; output_tokens: number; cost_usd: string | null }
  recent: { model: string; input_tokens: number; output_tokens: number; cost_usd: string | null; draft_id: number; created_at: string }[]
}
type ApiKey = { id: number; name: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }
type LabelRow = { id: number; name: string; is_spending: boolean; color: string | null }
// The full pf_… key rides only on the POST response — never stored, never fetched again.
type NewApiKey = ApiKey & { key: string }

// Per-M-token USD: "free" for 0/0, "price n/a" when the catalog has no number.
const cost = (m: ModelInfo) =>
  m.input_cost == null || m.output_cost == null
    ? 'price n/a'
    : m.input_cost === 0 && m.output_cost === 0
      ? 'free'
      : `$${m.input_cost} in · $${m.output_cost} out per M tokens`

// 16px: iOS Safari zooms focused inputs below 16px. h-11 = 44px tap target.
const field =
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
const area = `${field.replace('h-11 ', '')} min-h-24 py-2`

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

// Rules edits strip + drop blanks (the server does the same) so blur compares apples to apples.
const cleanRules = (rules: string[]) => rules.map((r) => r.trim()).filter(Boolean)
const sameRules = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b)

// Per-call cost: "free" when the model was free, "—" when unknown.
const cost4 = (c: string | null) => (c == null ? '—' : Number(c) === 0 ? 'free' : `$${Number(c).toFixed(4)}`)
// Drop the vendor prefix: "openrouter/google/gemini" → "google/gemini".
const shortModel = (m: string) => m.slice(m.indexOf('/') + 1)
const dtFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function CostsTab() {
  const usage = useQuery({ queryKey: ['llm-usage'], queryFn: () => api<Usage>('/llm/usage') })
  if (usage.isPending) return <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
  if (usage.isError) return <p className="mt-4 text-sm text-destructive">Could not load usage.</p>
  const { totals, recent } = usage.data
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Calls</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">{totals.calls}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Cost</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">{cost4(totals.cost_usd)}</p>
        </div>
      </div>

      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No readings yet. Approve a receipt draft and its cost shows up here.</p>
      ) : (
        <ul className="space-y-1">
          {recent.map((r) => (
            <li
              key={`${r.draft_id}-${r.created_at}`}
              className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{shortModel(r.model)}</span>
                <span className="block text-xs text-muted-foreground">
                  in {r.input_tokens} · out {r.output_tokens} tokens · {dtFmt.format(new Date(r.created_at))}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{cost4(r.cost_usd)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Same ['labels'] key the transactions page uses, so invalidations keep both fresh.
// fail() already surfaces the server's detail (duplicate-name 409, in-use 409) verbatim.
function LabelsTab() {
  const qc = useQueryClient()
  const labels = useQuery({ queryKey: ['labels'], queryFn: () => api<LabelRow[]>('/labels') })
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  // '' = untouched → omitted from the POST.
  const [color, setColor] = useState('')
  const [edit, setEdit] = useState<{ id: number; name: string; orig: string } | null>(null)

  const done = () => qc.invalidateQueries({ queryKey: ['labels'] })
  const add = useMutation({
    mutationFn: () =>
      api('/labels', { method: 'POST', body: JSON.stringify({ name: name.trim(), ...(color ? { color } : {}) }) }),
    onSuccess: () => {
      setName('')
      setColor('')
      setAdding(false)
      done()
    },
    onError: fail,
  })
  const rename = useMutation({
    mutationFn: ({ id, name: n }: { id: number; name: string }) =>
      api(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify({ name: n }) }),
    onSuccess: () => {
      setEdit(null)
      done()
    },
    onError: fail, // keep the editor open so a duplicate-name error can be fixed
  })
  const del = useMutation({
    mutationFn: (id: number) => api(`/labels/${id}`, { method: 'DELETE' }),
    onSuccess: done,
    onError: fail,
  })
  // Blur/Enter commit; Escape drops the edit. No request when the name is unchanged.
  const commit = () => {
    if (!edit) return
    const n = edit.name.trim()
    if (n && n !== edit.orig) rename.mutate({ id: edit.id, name: n })
    else setEdit(null)
  }

  const list = labels.data ?? []
  return (
    <div className="mt-4 space-y-3">
      {labels.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {labels.isError && <p className="text-sm text-destructive">Could not load labels.</p>}
      {list.length === 0 && !labels.isPending && !labels.isError && (
        <p className="text-sm text-muted-foreground">No labels yet.</p>
      )}
      <ul className="space-y-1">
        {list.map((l) => (
          <li key={l.id} className="flex min-h-11 items-center gap-2 rounded-md border bg-card px-3 py-1">
            {edit && edit.id === l.id ? (
              <input
                autoFocus
                aria-label="Rename label"
                className={field}
                maxLength={120}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') setEdit(null)
                }}
              />
            ) : (
              <>
                {l.color && <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: l.color }} />}
                <button
                  type="button"
                  aria-label={`Rename ${l.name}`}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => setEdit({ id: l.id, name: l.name, orig: l.name })}
                >
                  {l.name}
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={`Delete ${l.name}`}
                  disabled={del.isPending}
                  onClick={() => confirm(`Delete “${l.name}”?`) && del.mutate(l.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) add.mutate()
          }}
        >
          <input
            aria-label="Label name"
            required
            maxLength={120}
            placeholder="e.g. Subscription"
            autoComplete="off"
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="color"
            aria-label="Color (optional)"
            className="mt-2 h-11 w-14 cursor-pointer rounded-md border bg-transparent p-1"
            value={color || '#000000'}
            onChange={(e) => setColor(e.target.value)}
          />
          <Button type="submit" className="mt-3 h-11 w-full" disabled={add.isPending || !name.trim()}>
            Save label
          </Button>
        </form>
      ) : (
        <Button variant="outline" className="h-11 w-full border-dashed" onClick={() => setAdding(true)}>
          <Plus aria-hidden /> Add label
        </Button>
      )}
    </div>
  )
}

function KeysTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  // Set on create → the sheet flips to the shown-once screen; cleared on dismiss.
  const [created, setCreated] = useState<NewApiKey | null>(null)

  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => api<ApiKey[]>('/keys') })
  const create = useMutation({
    mutationFn: () => api<NewApiKey>('/keys', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: (k) => {
      setCreated(k)
      setName('')
      qc.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: fail,
  })
  const revoke = useMutation({
    mutationFn: (id: number) => api(`/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Key revoked')
      qc.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: fail,
  })

  const list = keys.data ?? []
  return (
    <div className="mt-4 space-y-3">
      <Button className="h-11 w-full" onClick={() => setOpen(true)}>
        <KeyRound aria-hidden /> New key
      </Button>

      {keys.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {keys.isError && <p className="text-sm text-destructive">Could not load keys.</p>}
      {list.length === 0 && !keys.isPending && !keys.isError && (
        <p className="text-sm text-muted-foreground">No API keys yet.</p>
      )}
      <ul className="space-y-1">
        {list.map((k) => (
          <li
            key={k.id}
            className={cn(
              'flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2',
              k.revoked_at && 'opacity-50',
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{k.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {k.key_prefix}… · {dtFmt.format(new Date(k.created_at))} ·{' '}
                {k.last_used_at ? `used ${dtFmt.format(new Date(k.last_used_at))}` : 'never used'}
              </span>
            </span>
            {k.revoked_at ? (
              <span className="shrink-0 text-xs text-muted-foreground">Revoked</span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                disabled={revoke.isPending}
                onClick={() => confirm(`Revoke “${k.name}”?`) && revoke.mutate(k.id)}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setCreated(null) // the shown-once key dies with the sheet
        }}
        title={created ? 'Key created' : 'New API key'}
        description={created ? undefined : 'Name it after whatever will use it.'}
      >
        {created ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-destructive">
              You won’t see this key again — copy it somewhere safe now.
            </p>
            <code className="block break-all rounded-md border bg-card p-3 font-mono text-sm">{created.key}</code>
            <div className="flex gap-2">
              <Button
                className="h-11 flex-1"
                onClick={() =>
                  navigator.clipboard.writeText(created.key).then(() => toast.success('Key copied')).catch(fail)
                }
              >
                <Copy aria-hidden /> Copy
              </Button>
              <Button variant="outline" className="h-11 flex-1" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) create.mutate()
            }}
          >
            <label htmlFor="key-name" className="mb-1 block text-sm font-medium">
              Name
            </label>
            <input
              id="key-name"
              required
              maxLength={100}
              placeholder="e.g. Home Assistant"
              autoComplete="off"
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" className="mt-3 h-11 w-full" disabled={create.isPending || !name.trim()}>
              Create key
            </Button>
          </form>
        )}
      </Sheet>
    </div>
  )
}

export function SettingsPage() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') })
  const [tab, setTab] = useState<'model' | 'labels' | 'keys'>('model')
  // Chip folder inside the Model tab: rules editor vs costs.
  const [folder, setFolder] = useState<'rules' | 'costs'>('rules')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [prompts, setPrompts] = useState<string[]>([])

  const saveRules = (rules: string[]) => {
    setPrompts(rules)
    if (settings.data && !sameRules(rules, settings.data.custom_prompts))
      save.mutate({ llm_provider: provider, llm_model: model, custom_prompts: rules })
  }

  // The rules editor edits a local copy; settings.data changing (load, refetch) re-syncs it.
  useEffect(() => {
    if (settings.data) setPrompts(settings.data.custom_prompts)
  }, [settings.data])

  // ~300ms debounce: one request per pause in typing, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  // Optimistic write; the invalidate re-syncs from the server if the PUT fails.
  const save = useMutation({
    mutationFn: (next: Settings) => api('/settings', { method: 'PUT', body: JSON.stringify(next) }),
    onMutate: (next) => qc.setQueryData(['settings'], next),
    onSuccess: () => toast.success('Settings saved'),
    onError: (e) => {
      fail(e)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const provider = settings.data?.llm_provider ?? ''
  const model = settings.data?.llm_model ?? ''
  const models = useQuery({
    queryKey: ['llm-models', provider, search],
    queryFn: () => api<ModelInfo[]>(`/llm/models?q=${encodeURIComponent(search)}`),
    // Empty q shows no results, not the whole catalog.
    enabled: !!settings.data && search.length > 0,
  })
  const list = (models.data ?? []).slice(0, 20)

  // Every save sends all three fields, so no save can silently drop another.
  const pick = (id: string) =>
    id !== model && save.mutate({ llm_provider: provider, llm_model: id, custom_prompts: cleanRules(prompts) })

  return (
    <div className="p-4 pb-24">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Provider and model for receipt extraction.</p>

      <div role="radiogroup" aria-label="Settings section" className="mt-3 grid grid-cols-3 rounded-md border p-1">
        {(['model', 'labels', 'keys'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'h-9 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              tab === t ? 'bg-secondary font-semibold' : 'text-muted-foreground',
            )}
          >
            {t === 'model' ? 'Model' : t === 'labels' ? 'Labels' : 'Keys'}
          </button>
        ))}
      </div>

      {tab === 'keys' ? (
        <KeysTab />
      ) : tab === 'labels' ? (
        <LabelsTab />
      ) : (
        <>
          {settings.isPending && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
          {settings.isError && <p className="mt-4 text-sm text-destructive">Could not load settings.</p>}
          {settings.data && (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="llm-provider" className="mb-1 block text-sm font-medium">
                  Provider
                </label>
                <select
                  id="llm-provider"
                  className={field}
                  value={provider}
                  disabled={save.isPending}
                  onChange={(e) =>
                    save.mutate({ llm_provider: e.target.value, llm_model: model, custom_prompts: cleanRules(prompts) })
                  }
                >
                  <option value="google">Google</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>

              <div>
                <label htmlFor="llm-model" className="mb-1 block text-sm font-medium">
                  Model
                </label>
                <input
                  id="llm-model"
                  type="search"
                  autoComplete="off"
                  placeholder="Search models…"
                  className={field}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {model && (
                  <p className="mt-2 flex min-h-11 items-center gap-2 rounded-md border bg-card px-3 text-sm">
                    <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">
                      Current: <span className="font-medium">{model}</span>
                    </span>
                  </p>
                )}
                {search.length > 0 && (
                  <div className="mt-2 space-y-1" aria-label="Model results">
                    {models.isFetching && <p className="p-2 text-sm text-muted-foreground">Searching…</p>}
                    {models.isError && <p className="p-2 text-sm text-destructive">Could not search models.</p>}
                    {list.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={m.id === model}
                        onClick={() => pick(m.id)}
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border bg-card px-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{m.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{cost(m)}</span>
                        </span>
                        {m.id === model && <Check className="size-4 shrink-0" aria-hidden />}
                      </button>
                    ))}
                    {!models.isFetching && !models.isError && list.length === 0 && (
                      <p className="p-2 text-sm text-muted-foreground">No models match “{search}”.</p>
                    )}
                  </div>
                )}
              </div>

              <div role="radiogroup" aria-label="Model tools" className="grid grid-cols-2 rounded-md border p-1">
                {(['rules', 'costs'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={folder === f}
                    onClick={() => setFolder(f)}
                    className={cn(
                      'h-8 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      folder === f ? 'bg-secondary font-semibold' : 'text-muted-foreground',
                    )}
                  >
                    {f === 'rules' ? 'Rules' : 'Costs'}
                  </button>
                ))}
              </div>

              {folder === 'costs' ? (
                <CostsTab />
              ) : (
                <div>
                  <p className="mb-1 text-sm font-medium">Custom rules</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    One rule per entry — added to the receipt-reading prompt.
                  </p>
                  <div className="space-y-2">
                    {prompts.map((rule, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <textarea
                          aria-label={`Rule ${i + 1}`}
                          className={area}
                          maxLength={500}
                          placeholder={i === 0 ? 'e.g. “apple vinegar goes in Self Care (we use it for hair rinses)”' : undefined}
                          value={rule}
                          onChange={(e) => setPrompts((rs) => rs.map((r, j) => (j === i ? e.target.value : r)))}
                          onBlur={() => saveRules(cleanRules(prompts))}
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="mt-1 shrink-0"
                          aria-label={`Delete rule ${i + 1}`}
                          onClick={() => saveRules(prompts.filter((_, j) => j !== i))}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      className="h-11 w-full border-dashed"
                      disabled={prompts.length >= 20}
                      onClick={() => setPrompts((rs) => [...rs, ''])}
                    >
                      <Plus aria-hidden /> Add rule
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
