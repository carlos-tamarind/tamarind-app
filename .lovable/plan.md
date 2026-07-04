## Diagnosis

Page saves are lost due to a race in `src/components/page/page-window.tsx` plus no unload-time flush.

**Race in the debounced save:**
1. User types → `onUpdate` sets `dirtyContentRef.current = v1` and schedules a 600ms timer.
2. Timer fires → `savePage(v1)` starts.
3. Before it resolves, user types again → `dirtyContentRef.current = v2`, new timer scheduled.
4. `savePage(v1)` resolves → `.then()` runs `dirtyContentRef.current = null`, **overwriting v2**.
5. User navigates away before the 2nd timer fires → unmount cleanup sees `dirtyContentRef === null` and skips the flush. **v2 is lost.**

**No unload flush:** Closing the tab, reloading, or a hard nav never runs the React unmount cleanup, so any pending debounced content dies with the page.

**Bonus bug:** the hydration effect calls `editor.commands.setContent(data)` which by default emits an `update` event, triggering a save of the just-loaded content (writes a spurious `last_modified_at` and re-orders the sidebar).

## Fix

### 1. Correct the "dirty" bookkeeping (`page-window.tsx`)

- Replace `dirtyContentRef` semantics with a monotonically increasing `pendingVersionRef` + `savedVersionRef`, and keep `latestContentRef` always holding the very last JSON produced by `onUpdate`.
- After a save resolves, set `savedVersionRef = versionThatWasSaved`. The "is there unsaved work?" check becomes `pendingVersionRef > savedVersionRef` — no risk of clobbering newer edits.
- Same treatment for title (`pendingTitleVersionRef` / `savedTitleVersionRef` / `latestTitleRef`).
- The debounced timer, unmount cleanup, and new unload/visibility handlers all consult these refs and re-send `latestContentRef.current` / `latestTitleRef.current` whenever pending > saved.

### 2. Stop the hydration from triggering a save

- Change `editor.commands.setContent((data.content ?? …))` in the hydration effect to `setContent(content, false)` (TipTap: `false` = do not emit update). Also gate `onUpdate` with an `isHydratingRef` guard as belt-and-braces.

### 3. Flush on tab close / hide / hard nav

- Add a `beforeunload` and `visibilitychange` (`document.visibilityState === "hidden"`) listener while the component is mounted.
- When fired with unsaved work, call `navigator.sendBeacon(url, Blob(JSON.stringify({...})))` against a new server route that accepts a page patch and applies it with the same auth as `updatePage`.
- `createServerFn` RPC is not beacon-friendly, so add a new server route:

  ```
  src/routes/api/pages.save.ts   →  POST /api/pages/save
  ```

  The route re-uses the same Supabase auth pattern as the other authenticated server functions (reads the bearer from the request, constructs a user-scoped Supabase client via `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`, performs the same update as `updatePage`, and best-effort upserts `page_collaborators`). It is **not** placed under `/api/public/*` because it requires the user session.
  - Because `sendBeacon` cannot set an `Authorization` header, the client passes the current access token in the JSON body (retrieved via `supabase.auth.getSession()` just-in-time before sending). The route verifies it with `supabase.auth.getUser(token)` before writing. RLS still applies.
  - Payload: `{ accessToken, pageId, title?, content? }`.

### 4. Shorten the debounce and add a "typing pause" safety net

- Drop the debounce from 600 ms → 250 ms (more forgiving, still coalesces bursts).
- Additionally schedule a hard "max wait" flush every 2 s while typing so a user who types continuously and then closes the tab has at most ~2 s of unsaved work sitting in the beacon path.

### 5. Keep the existing SPA-unmount flush, but use the new refs

The `useEffect` cleanup keeps calling `savePage` (real RPC) when unmounting during SPA navigation — same code path as today but driven by `pendingVersionRef > savedVersionRef` instead of the null check. This means the "navigate to another page inside the app" path is covered by the RPC (reliable), and only true page-unloads use the beacon.

## Files touched

- `src/components/page/page-window.tsx` — new refs, hydration `setContent(_, false)`, shorter debounce + max-wait, `beforeunload`/`visibilitychange` handlers, correct dirty check in unmount cleanup.
- `src/routes/api/pages.save.ts` — new server route for beacon-based saves (verifies bearer via Supabase, performs the same update as `updatePage`).

## Out of scope (as requested)

- Multi-user collaborative editing / conflict resolution.
- Offline queueing beyond the beacon on unload.

## QA checklist

1. Type in page A, immediately click page B → return to A. Content preserved.
2. Type in page A, wait ~1 s, keep typing, click page B within 100 ms → return to A. Content preserved (was the race that lost data).
3. Type in page A, immediately close the tab / reload. Reopen — content preserved (beacon path).
4. Change title only, navigate away — title preserved.
5. Toggle visibility on a page with unsaved content, navigate away — both persisted.
6. Sidebar "Pages" list is ordered by `last_modified_at` and updates after each real edit; no spurious reordering just from opening a page (hydration no longer emits a save).
7. Rapid A→B→A within 300 ms does not lose either page's edits.