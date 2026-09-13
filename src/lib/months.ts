const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pad = (n: number) => String(n).padStart(2, '0')
const monthYearFmt = new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('it-IT', { month: 'short' })

/** Last 12 months, newest first — the month filter used across pages. */
export const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - i)
  return { value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: cap(monthYearFmt.format(d)) }
})

/** Last day of `ym` (YYYY-MM) as YYYY-MM-DD. */
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${pad(new Date(y, m, 0).getDate())}`
}

/** it-IT short month name ("Gen"…"Dic") for 1–12. */
export const monthShort = (m: number) => cap(shortFmt.format(new Date(2000, m - 1, 1)))
