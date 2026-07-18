## 1. Mention dropdown swallows Enter (bug)

**File:** `src/components/conversation/conversation-window.tsx`

The composer's `editorProps.handleKeyDown` intercepts Enter and calls `handleSend()` before the mention Suggestion plugin sees the key, so choosing a highlighted member/page never happens.

Fix: in `handleKeyDown`, only send on Enter when no suggestion popup is active. Track open suggestions via a ref set from each mention suggestion's `onStart`/`onExit` (in `buildMentionSuggestion`), or check for a visible tippy popup rendered by the mention (e.g. `document.querySelector('[data-tippy-root]')` created by the mention render). Simplest robust approach: keep a shared `mentionOpenRef = useRef(0)` (counter), increment on `onStart`, decrement on `onExit`, and short-circuit Enter when `mentionOpenRef.current > 0`. Return `false` so ProseMirror/Suggestion handles Enter and inserts the mention.

Also verify the slash command menu behaves the same (it already handles Enter internally via `SlashMenu.onKeyDown`, but same guard covers it if we extend to slash — check quickly and include if needed).

## 2. Display name change doesn't persist (bug)

**Root cause:** `public.workspace_users` has no RLS UPDATE policy for regular members. Only `"Admins can manage members"` covers UPDATE. `updateMyDisplayName` runs under `requireSupabaseAuth` (user-scoped client), so `.update()` affects 0 rows silently, returns no error, and the mutation reports success — but nothing changed.

Fix (migration): add a policy allowing an authenticated user to update their own `workspace_users` row.

```sql
CREATE POLICY "Users can update their own membership profile"
ON public.workspace_users
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

No column-level restriction needed for now (server function only sets `display_name`); admin-only fields like `role_id` remain protected because non-admin UPDATEs are checked against the `USING`/`CHECK` predicates but admins already have their own policy for role changes. If we want to be stricter, we can also add a trigger to prevent `role_id` changes from this policy — flag for later, not needed now.

Also make `updateMyDisplayName` verify a row was actually updated (use `.select('id').single()` on the update) so future silent-failures throw.

## 3. Display name length limits (feature)

**File:** `src/components/profile/profile-dialog.tsx`

- Constants: `MIN = 3`, `MAX = 40`.
- Input: cap value length via `onChange` (`e.target.value.slice(0, MAX)`); remove `maxLength` reliance so paste is also clamped consistently.
- Layout: wrap input in `relative` container; place a dimmed, non-interactive counter `<span>` absolutely on the right (`pointer-events-none`, `text-muted-foreground`), right-padded on the input (`pr-14`) so text never overlaps the hint. Counter text: `${name.trim().length}/${MAX}`.
- Below the input, when `name.trim().length < MIN`, render a small helper: `"Display name must be at least 3 characters."` (muted/destructive text-xs).
- Disable Confirm when `name.trim().length < MIN` OR not dirty OR mutation pending. Cancel button and dialog close remain unaffected.

**Server tightening** (defense in depth): update `updateMyDisplayName` zod schema in `src/lib/profile.functions.ts` from `min(1).max(120)` to `min(3).max(40)`.

## 4. Versioning

Bump `APP_VERSION` in `src/lib/version.ts` from `0.1.29` → `0.1.30` and update `.lovable/plan.md`.

## Files touched

- `src/components/conversation/conversation-window.tsx` — mention-open ref + guarded Enter
- `supabase/migrations/<new>.sql` — self-update policy on `workspace_users`
- `src/lib/profile.functions.ts` — stricter zod (3–40), assert row updated
- `src/components/profile/profile-dialog.tsx` — counter, min-length hint, disabled state, clamp
- `src/lib/version.ts`, `.lovable/plan.md` — version bump
