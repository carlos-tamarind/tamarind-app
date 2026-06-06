## Goal

Get the workspace shell building cleanly on react-resizable-panels v4, convert the legacy `/c/$id` and `/p/$id` URLs into redirects to the search-param model, and clean up the index/parent route conflict so all routes mount correctly.

## 1. Resizable-panels v4 API migration

File: `src/routes/_authenticated.w.$workspaceId.tsx`

- Replace `direction="horizontal"` with `orientation="horizontal"` on `<ResizablePanelGroup>`.
- Replace the `onLayout={handleLayout}` prop with `onLayoutChanged={handleLayout}` (v4 fires this on pointer release rather than every drag tick, which is what we want for the collapse-threshold behavior).
- Give each `<ResizablePanel>` an `id` (`"conv"` and `"page"`) — v4's layout callback returns a `{ [panelId]: number }` map, so panels need stable ids.
- Rewrite `handleLayout` to accept `layout: Record<string, number>` and read `layout.conv` / `layout.page` instead of destructuring an array. Same 20% collapse-threshold logic, same `navigate({ search: prev => ({ ...prev, c|p: undefined }) })` behavior.
- Drop the `layoutInteracted` ref — `onLayoutChanged` only fires after user interaction in v4, so the initial-mount guard is no longer needed.

No changes needed to `src/components/ui/resizable.tsx` (it already re-exports v4's `Group`/`Panel`/`Separator` and forwards props).

## 2. Redirect routes for legacy `/c/$id` and `/p/$id` URLs

Files: `src/routes/_authenticated.w.$workspaceId.c.$conversationId.tsx`, `src/routes/_authenticated.w.$workspaceId.p.$pageId.tsx`

Replace the current full-page `ConversationView` / `PageView` implementations with a thin redirect:

```ts
export const Route = createFileRoute("/_authenticated/w/$workspaceId/c/$conversationId")({
  beforeLoad: ({ params }) =>
    redirect({
      to: "/w/$workspaceId",
      params: { workspaceId: params.workspaceId },
      search: { c: params.conversationId },
      replace: true,
    }),
});
```

Same shape for `/p/$pageId` with `search: { p: params.pageId }`.

This keeps existing in-app links like `navigate({ to: "/w/$workspaceId/p/$pageId", ... })` working (the conversation composer's "new page" CTA, page mentions, backlinks) while consolidating the actual rendering in the parent shell. We'll leave those call sites alone in this pass; the redirect handles them.

The full implementations of the conversation and page views already live in `src/components/conversation/conversation-window.tsx` and `src/components/page/page-window.tsx`, so deleting the route bodies loses no functionality.

## 3. Index route + Outlet cleanup

Currently `_authenticated.w.$workspaceId.tsx` renders the full shell (sidebar + split panel) but never renders `<Outlet />`, so the `/settings` modal route and the `/` index route silently fail to mount.

- Add `<Outlet />` to the shell, rendered after the `<NewConversationDialog>` so child routes (currently `_authenticated.w.$workspaceId.settings.tsx`, which renders as a portal `<Dialog>`) overlay the shell correctly.
- Delete `src/routes/_authenticated.w.$workspaceId.index.tsx` entirely. The empty-state UI is already rendered inline by the parent shell when both `c` and `p` search params are absent, so the index leaf is now dead code and would re-render its own empty state on top of the shell's.

## Technical Notes

- v4 `Layout` type: `{ [panelId: string]: number }` (percentages 0..100). With panel ids `conv` and `page`, we read `layout.conv` and `layout.page` directly.
- `redirect()` from `@tanstack/react-router` thrown in `beforeLoad` is the canonical pattern; no `component` is needed on the redirect routes.
- `routeTree.gen.ts` regenerates automatically — no manual edits needed after deleting the index route file.

## Out of scope

- Refactoring `conversation-window.tsx` / `page-window.tsx` internals.
- Persisting split sizes across navigation.
- Mobile responsive treatment of the split.

## Files touched

- Edit `src/routes/_authenticated.w.$workspaceId.tsx` (panels API + Outlet).
- Rewrite `src/routes/_authenticated.w.$workspaceId.c.$conversationId.tsx` as a redirect.
- Rewrite `src/routes/_authenticated.w.$workspaceId.p.$pageId.tsx` as a redirect.
- Delete `src/routes/_authenticated.w.$workspaceId.index.tsx`.
