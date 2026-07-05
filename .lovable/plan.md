## Goal
Make page persistence deterministic: the state visible just before the user leaves a page is saved and is the state shown the next time that page loads, for private, workspace, and conversation pages.

## What I found
- The editor currently uses timers plus best-effort unmount/beacon saves. That still allows navigation to load stale cached data before the save has fully committed, which explains the “appears after 2 navigations” symptom.
- Conversation pages and workspace pages are likely failing because the authenticated update path depends on the page update policy; today only page owners/admins can update pages, while conversation/workspace-visible pages may be editable/readable by participants or workspace members but not updateable by them.
- The query cache for `['page', pageId]` is invalidated only indirectly, so returning to the same page can reuse stale content even after a save.

## Implementation plan
1. **Make save authorization match readable/editable page types**
   - Update the backend save function so it validates the user can access the page and then persists through the trusted server path.
   - Support private owner pages, workspace pages for workspace members, and conversation pages for conversation participants.
   - Keep collaborator tracking intact.

2. **Replace “save eventually” navigation with “save before leaving”**
   - In `PageWindow`, introduce a dedicated `flushBeforeLeave()` function that writes the latest title/content immediately.
   - For in-app page/conversation/workspace navigation, intercept the click, call `flushBeforeLeave()`, then navigate only after the save returns.
   - This removes reliance on debounce timing for the acceptance criteria.

3. **Keep the cache in sync immediately**
   - On every successful save, update `['page', pageId]` in the query cache with the exact title/content that was saved.
   - Invalidate page lists, backlinks, conversation page lists, and the current page query so sidebars and reloads reconcile with the database.
   - This should eliminate the “needs two navigations” stale-cache behavior.

4. **Harden remaining unload paths**
   - Keep `visibilitychange` / `beforeunload` beacon as a final fallback for browser tab close/reload.
   - Change it to use the same backend save semantics as the normal save path.
   - Do not mark changes as saved unless the normal RPC save succeeds; beacon remains best-effort only because browsers do not allow awaited unload work.

5. **Fix the current React runtime error if it is tied to the save flow**
   - Investigate the `resolveDispatcher() is null` stack during verification and correct it if it blocks authenticated page QA.

## QA plan
- Use the preview with an authenticated session if available.
- Verify rapid edit → immediately open another page → return shows the latest character on first return.
- Verify private, workspace, and conversation pages all persist title and body edits.
- Verify edit while split conversation+page is open, close only the page panel, reopen, and confirm the latest state appears.
- Verify no sidebar/list stale state after title changes.
- If an authenticated session is not available in the preview, validate what can be tested publicly and report that authenticated end-to-end QA needs the user to sign in first.