import { Button } from '@/components/ui/button'

export function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-2xl font-semibold">Personal Finance</h1>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button className="h-11 w-full" onClick={() => location.assign('/api/auth/google/login')}>
          Continue with Google
        </Button>
        {import.meta.env.DEV && (
          <Button
            className="h-11 w-full"
            variant="outline"
            onClick={() => location.assign('/api/auth/dev-login')}
          >
            Dev login
          </Button>
        )}
      </div>
    </div>
  )
}
