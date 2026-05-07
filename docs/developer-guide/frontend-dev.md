# Frontend development

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + next-intl. Code lives under `frontend/src/`.

## Running locally

`pnpm` is the package manager. The merge script for addon translations runs automatically on `pnpm dev` and `pnpm build`.

```bash
cd frontend
pnpm install
pnpm dev          # http://localhost:3000 (proxies /api/* to backend in compose)
pnpm test
pnpm test --watch
pnpm build
```

For end-to-end tests against a running stack, use Playwright (`pnpm e2e` if configured).

## Code layout

```
frontend/src/
├── app/                # Next.js App Router pages
│   ├── page.tsx        # /  (Server Component; lists drives)
│   ├── setup/          # First-run wizard
│   ├── unlock/         # Password entry
│   ├── admin/
│   │   ├── layout.tsx  # Admin gate; restart-pending banner
│   │   └── settings/   # Drives / Passwords / AddonPolicy
│   ├── drive/[name]/
│   ├── files/[id]/
│   └── app/settings/   # Profile + theme + language
├── components/         # Shared React components
├── hooks/              # Custom hooks (useShortcuts, useDebounce, …)
├── lib/                # Utilities (api.ts, format.ts, adminConfig.ts, …)
├── i18n/               # next-intl config
├── messages-core/      # Core translations (tracked)
├── messages/           # Merged translations (gitignored, generated)
└── types/              # TypeScript shared types
```

## Custom server

`frontend/server.js` is a small Node script that:

- Hosts the Next.js app.
- Adds an HTTP rewrite for `/api/*` → `http://backend:8000`.
- Adds a WebSocket proxy for `/api/ws` → `ws://backend:8000/api/ws`, preserving cookies.

This is what makes the backend non-public: the only way in is through the frontend.

## Next.js 16 conventions

- `params` is a `Promise`. In Server Components: `const { name } = await params;`. In Client Components: `const params = useParams<{ name: string }>();` or `const { name } = use(params);`.
- The home page (`/`) is a Server Component and fetches `http://backend:8000` directly.
- Drive and file pages are Client Components and fetch through `/api/` (the rewrites).

## i18n

- `next-intl`. Cookie-only routing (`NEXT_LOCALE`). No locale URL prefix.
- Client Component: `useTranslations('namespace')`.
- Server Component: `getTranslations('namespace')`.
- Core strings only in `messages-core/`. Addon strings only in addon dirs. The merge script combines them into `messages/`.

```text
messages-core/ja.json + addons/*/frontend/messages/ja.json  →  messages/ja.json
```

Editing `messages/` directly is a mistake — it gets overwritten.

## Design system

UI changes (colors, typography, radius, tables, MarkdownPreview, long-form prose) follow `DESIGN.md` at the repo root. When adding new tokens (color, radius, font scale), update `DESIGN.md` together with the code — never let the implementation land first. Before hardcoding a `max-width` or `font-size`, check whether the scale already exists in DESIGN.md §3 / §5.

## Tag editing helper

The frontend has a single helper for tag writes:

```ts
import { saveFileTags } from '@/lib/api';

await saveFileTags(file, tags);
```

It branches internally on MIME / extension. The UI layer must **not** decide where to write — `.md` is canonical to frontmatter, everything else is canonical to the DB, and `saveFileTags` knows that.

For `.md`, edits use a 500 ms debounce on the chip editor → `PUT /api/files/{id}/content`. The 500 ms target balances "doesn't fire on every keystroke" with "feels live"; 2 s feels laggy, sub-100 ms wastes server.

For `.md` Approve auto_tags, retry once on `ConflictError` (the projection may have just rewritten frontmatter).

## SPA navigation

Page transitions use `router.push()` / `<Link>`. **No full reloads** — `window.location.href = ...` is allowed only for the post-unlock redirect because the JWT cookie has just been set and SPA caches need to be invalidated.

## Addon slots

Slots are typed React components rendered with `<AddonSlot name="..." />`. The current slots:

- `search-modes`
- `file-detail-sections`
- `dashboard-widgets`
- `folder-actions`

The `AddonSlotsProvider` re-fetches `/api/addons/status?drive=` on drive change, so per-drive policy filtering happens automatically. If no addon contributes to a slot, the slot is hidden — no holes in the UI.

To add a new slot, define it in the slots manifest, render it where it should appear, and document the contract for addon authors (props it passes, what they should return).

## Hooks

- `useShortcuts({ key, handler })` — register a keyboard shortcut for the current page. Pages can show the cheat sheet with `?` (built into the global shortcut system).
- `useDebounce(value, ms)` — common pattern for chip editors.
- `useTheme()` — reads/writes `theme-preference` localStorage.

## State

Most state is server-fetched. Client state is small: theme, autoplay, view mode per folder. We do not pull in Redux / Zustand for these — `useState` and localStorage are enough.

## Testing

- `vitest 3.x` only — vitest 4 has a rolldown native-bindings issue that breaks our test runner.
- `jsdom 25.x` only — jsdom 29 breaks ESM compatibility with our setup.
- Component tests live next to the component (`Button.test.tsx`).
- Integration tests live under `e2e/` and use Playwright.

## Build

`pnpm build` runs:

1. The merge script (combine `messages-core` + addon messages → `messages/`).
2. `next build`.

The Dockerfile chains both. CI mirrors the same.

## Common pitfalls

- **Missing translation keys** — usually because addon translations were not merged. Ensure the merge script ran before `next build`.
- **Hydration mismatch** — `useEffect`-driven theme attribute vs SSR. Use `next/script beforeInteractive` to set `data-theme` before React hydrates, or accept the brief flash for non-critical UI.
- **Redirect loops on `/setup`** — `setup_completed` sentinel and the gate component must agree. If you change the sentinel logic, update both.
- **WebSocket reconnect storms** — back off exponentially. Log once per minute, not per attempt.

## See also

- [Architecture](architecture.md)
- [Addon development](addon-dev.md) — for slot contracts and per-drive policy on the client.
