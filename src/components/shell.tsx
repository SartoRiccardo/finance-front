import type { ComponentType, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, ChartPie, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavItem = { path: string; icon: ComponentType<{ className?: string }>; label: string }

// Add future sections here — shell and routing pick them up, no per-page edits.
export const NAV: NavItem[] = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { path: '/insights', icon: ChartPie, label: 'Insights' },
]

function NavLinks({ className }: { className?: string }) {
  return (
    <>
      {NAV.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground lg:flex-none lg:flex-row lg:gap-2 lg:rounded-md lg:px-3 lg:text-sm lg:flex-initial',
            'data-[status=active]:text-foreground',
            className,
          )}
        >
          <item.icon className="size-5 lg:size-4" aria-hidden />
          {item.label}
        </Link>
      ))}
    </>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r p-4 lg:flex">
        <span className="mb-4 px-3 text-sm font-semibold">Personal Finance</span>
        <NavLinks className="lg:justify-start" />
      </aside>
      <main className="flex-1 pt-[env(safe-area-inset-top)] pb-16 lg:pb-0">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <NavLinks />
      </nav>
    </div>
  )
}
