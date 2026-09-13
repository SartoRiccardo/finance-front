import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { api } from '@/lib/api'

type Settings = { llm_provider: string; llm_model: string }
type ModelInfo = { id: string; name: string; input_cost: number | null; output_cost: number | null }

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

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

export function SettingsPage() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') })
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')

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

  const pick = (id: string) => id !== model && save.mutate({ llm_provider: provider, llm_model: id })

  return (
    <div className="p-4 pb-24">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Provider and model for receipt extraction.</p>

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
              onChange={(e) => save.mutate({ llm_provider: e.target.value, llm_model: model })}
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
        </div>
      )}
    </div>
  )
}
