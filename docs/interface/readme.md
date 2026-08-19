# Interface Layer Overview

The interface layer is the user-facing React application. It handles routing, theming, UI rendering, data fetching, keyboard shortcuts, and realtime subscriptions.

## UI Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Routing | TanStack Router (file-based) |
| Data fetching | TanStack React Query + server functions |
| Styling | Tailwind CSS 4 (`src/styles.css` design tokens, oklch) |
| Theming | Light / dark / system via `ThemeProvider` |
| Components | shadcn/ui (Radix primitives, New York style) |
| Command UI | `cmdk` (command palette) |
| Rich text | TipTap |
| Icons | Lucide React |
| Toasts | Sonner |
| Layout | `react-resizable-panels` |

Root font size is **115%** so rem-based Tailwind utilities scale together.

## Component Organization

```
src/
├── routes/                    # Pages and API route handlers
├── components/
│   ├── ui/                    # shadcn/ui primitives + kbd, empty-state, section-label
│   ├── brand/                 # Wordmark
│   ├── conversation/          # Chat feature (window, settings, participants)
│   ├── page/                  # Page feature (editor, share, duplicate, settings)
│   ├── editor/                # Shared TipTap extensions (mentions, slash commands)
│   ├── search/                # Search overlay modal
│   ├── profile/               # Profile dialog
│   ├── command-palette.tsx
│   ├── status-bar.tsx
│   ├── navigation-panel.tsx
│   ├── empty-state-home.tsx
│   ├── auth-layout.tsx
│   ├── close-hint-overlay.tsx
│   └── new-conversation-dialog.tsx
├── hooks/
│   ├── use-mobile.tsx
│   ├── use-hotkeys.ts         # Browser-safe shortcut registry
│   └── use-search-request.ts  # Debounced search hook
└── lib/
    ├── auth-context.tsx
    ├── theme-context.tsx
    ├── save-status-context.tsx
    ├── composer-drafts.ts     # sessionStorage message drafts
    ├── activity.functions.ts  # Recent activity for empty state
    ├── *.functions.ts         # Server functions (backend RPC)
    ├── search.functions.ts    # executeSearch server function
    ├── features.ts            # Plan-based feature gating
    └── utils.ts
```

## Theming

[`src/lib/theme-context.tsx`](../../src/lib/theme-context.tsx) persists `light` | `dark` | `system` in `localStorage` (`tamarind:theme`). Default is **light**. A blocking script in [`src/routes/__root.tsx`](../../src/routes/__root.tsx) applies the class before first paint to avoid a flash of the wrong theme.

The status bar theme toggle and the command palette Theme group both call `setTheme`.

## Data Layer Pattern

The frontend does not call Supabase directly for domain data (except auth and Realtime). Instead:

```typescript
// 1. Define server function (src/lib/pages.functions.ts)
export const listMyPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => { ... });

// 2. Call from React via useServerFn + React Query
const fetchPages = useServerFn(listMyPages);
const { data } = useQuery({
  queryKey: ["pages-list", workspaceId],
  queryFn: () => fetchPages({ data: { workspaceId } }),
});
```

Auth token is automatically attached to every server function call by `attachSupabaseAuth` middleware.

## Direct Supabase Client Usage

The browser Supabase client ([`src/integrations/supabase/client.ts`](../../src/integrations/supabase/client.ts)) is used for:

- **Authentication** — sign-in, sign-out, session management
- **Realtime subscriptions** — message INSERT events, page presence

All other data flows through server functions.

## Feature Areas

| Document | Topic |
|----------|-------|
| [User Interface](user_interface.md) | Workspace shell, status bar, command palette, hotkeys |
| [Workspaces & Permissions](workspaces_permissions.md) | Roles, plans, feature gating |
| [User Onboarding](user_onboarding.md) | Bootstrap, login, invites |
| [Conversations](conversations.md) | Chat UI, composer, drafts |
| [Pages](pages.md) | TipTap editor, sharing, autosave |

## Related Docs

- [Search & Retrieval](../search/readme.md) — Hybrid search overlay and pipeline
- [Architecture Overview](../architecture/overview.md) — Server-side patterns
- [Auth](../architecture/auth.md) — Authentication flow
- [Realtime](../architecture/realtime.md) — Live subscriptions
