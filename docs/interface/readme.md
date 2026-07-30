# Interface Layer Overview

The interface layer is the user-facing React application. It handles routing, UI rendering, data fetching, and realtime subscriptions.

## UI Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Routing | TanStack Router (file-based) |
| Data fetching | TanStack React Query + server functions |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui (Radix primitives) |
| Rich text | TipTap |
| Icons | Lucide React |
| Toasts | Sonner |

The app is branded **Mento** in the UI metadata (`"Contextual knowledge graph for teams."`).

## Component Organization

```
src/
├── routes/                    # Pages and API route handlers
├── components/
│   ├── ui/                    # shadcn/ui primitives (~40 components)
│   ├── conversation/          # Chat feature (window, settings, participants)
│   ├── page/                  # Page feature (editor, share, duplicate, settings)
│   ├── editor/                # Shared TipTap extensions (mentions, slash commands)
│   ├── profile/               # Profile dialog
│   ├── new-conversation-dialog.tsx
│   └── version-badge.tsx
├── hooks/
│   └── use-mobile.tsx
└── lib/
    ├── auth-context.tsx
    ├── *.functions.ts         # Server functions (backend RPC)
    ├── features.ts            # Plan-based feature gating
    └── utils.ts
```

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
| [User Interface](user_interface.md) | Workspace shell layout |
| [Workspaces & Permissions](workspaces_permissions.md) | Roles, plans, feature gating |
| [User Onboarding](user_onboarding.md) | Bootstrap, login, invites |
| [Conversations](conversations.md) | Chat UI and server functions |
| [Pages](pages.md) | TipTap editor, sharing, autosave |

## Related Docs

- [Architecture Overview](../architecture/overview.md) — Server-side patterns
- [Auth](../architecture/auth.md) — Authentication flow
- [Realtime](../architecture/realtime.md) — Live subscriptions
