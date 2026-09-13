# Personal Finance — front

Vite + React + TS, shadcn/ui (Tailwind v4), TanStack Query + Router, PWA.

```sh
pnpm install
pnpm dev --host   # open the LAN URL on your phone
```

Expects the API on `http://localhost:8000` (proxied via `/api`). Dev login button shows only in dev builds (`pnpm dev`).

- `pnpm typecheck` / `pnpm build`
- `pnpm icons` regenerates `public/icons/*.png` (scripts/make-icons.mjs)
