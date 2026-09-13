import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { api, ApiError } from '@/lib/api'
import { queryClient } from '@/query-client'
import { AppShell } from '@/components/shell'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { TransactionsPage } from '@/pages/transactions'
import { InsightsPage } from '@/pages/insights'
import { DraftsPage } from '@/pages/drafts'

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

// Shell routes share this guard — 401 on /auth/me goes to login.
const requireAuth = async () => {
  try {
    await queryClient.fetchQuery({
      queryKey: ['me'],
      queryFn: () => api<{ email: string }>('/auth/me'),
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw redirect({ to: '/login' })
    throw e
  }
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: requireAuth,
  component: () => (
    <AppShell>
      <DashboardPage />
    </AppShell>
  ),
})

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transactions',
  beforeLoad: requireAuth,
  component: () => (
    <AppShell>
      <TransactionsPage />
    </AppShell>
  ),
})

const insightsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/insights',
  beforeLoad: requireAuth,
  component: () => (
    <AppShell>
      <InsightsPage />
    </AppShell>
  ),
})

const draftsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/drafts',
  beforeLoad: requireAuth,
  component: () => (
    <AppShell>
      <DraftsPage />
    </AppShell>
  ),
})

// Any unknown path goes back to the guarded shell.
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  transactionsRoute,
  insightsRoute,
  draftsRoute,
  catchAllRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
