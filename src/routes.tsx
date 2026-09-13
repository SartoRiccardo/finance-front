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

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    try {
      await queryClient.fetchQuery({
        queryKey: ['me'],
        queryFn: () => api<{ email: string }>('/auth/me'),
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: () => (
    <AppShell>
      <DashboardPage />
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

const routeTree = rootRoute.addChildren([loginRoute, indexRoute, catchAllRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
