import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import './index.css'
import { router } from './routes'
import { queryClient } from './query-client'

// Dev runs SW-free (PWA is prod-only); if an older build's worker is still
// registered in this browser, evict it + its caches so dev never shows stale
// precached content.
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))
  if ('caches' in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  </StrictMode>,
)
