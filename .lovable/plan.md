# Fix-up plan

Four small, scoped fixes — all frontend except #3 which adjusts one server function.

## 1. "Open workspaces panel" button does nothing

**Cause:** in `src/routes/_authenticated.w.$workspaceId.tsx`, `handleShellLayout` runs on every layout event from `ResizablePanelGroup` — including the very first one right after we open the rail. The rail mounts at `defaultSize=6` but the library reports an intermediate sub‑3 value during the initial layout pass, so `setRailOpen(false)` fires immediately and the rail snaps back shut.

**Fix:** Stop using `onLayoutChanged` for auto‑close. Instead:
- Remove `handleShellLayout` and the `RAIL_AUTO_CLOSE` constant.
- Mark the rail `ResizablePanel` as `collapsible collapsedSize={0} minSize={4} maxSize={8}` and pass `onCollapse={() => setRailOpen(false)}`. This way the rail only closes when the user actually drags the handle past the collapse threshold, not on initial layout.
- Keep the `key={\`shell-${railOpen ? "rail" : "norail"}\`}` remount so opening always restores `defaultSize=6`.

## 2. Nav-panel "New conversation" / "New page" CTAs stretch with the panel

In the same file, the bottom CTA buttons are currently `className="w-full"`. Replace `w-full` with a fixed width (e.g. `w-40`) and keep the wrapping `<div className="flex justify-center px-3 pb-3">` so they stay centered regardless of panel width. Applies to both branches (conversations and pages).

## 3. Messages show a short user-id fragment instead of the display name

**Cause:** `getConversation` in `src/lib/conversations.functions.ts` falls back to `user_id.slice(0,6)` when `workspace_users.display_name` is null. That fragment is what the conversation bubble renders via `author?.displayName`.

**Fix:** in `getConversation`, when `display_name` is null, look up the user's email from `auth.users` (via `supabaseAdmin.auth.admin.getUserById`, batched per missing user) and fall back to email; only as a last resort use `"Unknown"`. Do the same fallback chain in `listMyConversations` so the sidebar label is consistent. No schema changes.

Frontend (`conversation-window.tsx`) already uses `author?.displayName`, so no UI change needed there.

## 4. Composer area should be 2/10 of the conversation height

In `src/components/conversation/conversation-window.tsx`:
- Change the root from `flex h-full flex-col` to `grid h-full grid-rows-[auto_1fr_2fr]` where row 1 = header, row 2 = scrollable messages (8/10 effective with header), row 3 = composer (2/10).
- More precisely, use `grid-rows-[auto_8fr_2fr]` so the header keeps its intrinsic height and the messages/composer split is exactly 8:2 of the remaining space.
- Add `min-h-0 overflow-y-auto` on the messages container and `min-h-0 overflow-hidden` on the composer container so the grid rows clamp correctly.
- Inside the composer, let the `EditorContent` wrapper fill (`h-full`) and make the textarea area scroll internally (`overflow-y-auto`) so the toolbar + send column stay visible.

## Out of scope

- No DB migrations.
- No changes to message sanitizer, realtime, or send behavior.
- No styling overhaul of the rail/profile area beyond the items above.

## Files touched

- `src/routes/_authenticated.w.$workspaceId.tsx` (fixes #1, #2)
- `src/lib/conversations.functions.ts` (fix #3)
- `src/components/conversation/conversation-window.tsx` (fix #4)
