## Bug

When a page has been idle for 5+ minutes and the user opens it while another page is currently open, the page's title AND content are wiped in the database. Owner, visibility, collaborators are intact — which means an UPDATE is being issued that sets `title` and `content` to empty values.

## Likely cause

Two suspect code paths in `src/components/page/page-window.tsx` combine with React Query's 5-minute `gcTime` to explain the symptom:

1. **Local-draft hydration can apply an empty draft and immediately save it.**
   `hydration effect` reads `mento:page-draft:{pageId}` from `localStorage`. If a draft exists whose `updatedAt > data.lastModifiedAt`, it overwrites `nextTitle` / `nextContent` with the draft's values, bumps the pending versions, and calls `scheduleFlushRef.current()` — which will POST that draft (potentially `title = ""`, `content = { type: "doc", content: [] }`) back to the server. A stale draft ends up in `localStorage` whenever an earlier save failed silently (the unmount flush runs with `{ silent: true }`, and on failure it does NOT clear the draft; it also has no live component to retry from). After 5+ minutes the query cache is gc'd, so `getPage` re-runs from scratch and hydration re-triggers the draft path.

2. **`writeLocalDraft` can persist a draft with `content = null`.**
   `latestContentRef.current` is initialised to `null` and only set to a real doc when hydration runs OR `onUpdate` fires. If the user types in the title *before* hydration finishes (fast switch into an idle page), `handleTitleChange` bumps the dirty flags and calls `writeLocalDraft`, which writes `{ title, content: null }` to `localStorage`. Later, hydration applies that draft → editor content becomes empty → a save wipes DB `content`.

Both paths ultimately reach `updatePage` / `/api/pages/save`, which currently accept whatever is sent (`if (title !== undefined) patch.title = title; if (content !== undefined) patch.content = content;`), so an empty payload is written verbatim.

## Fix

Defence in depth: guard on the client, the local draft, and the server. No functional changes to editing or collaboration.

### 1. `src/components/page/page-window.tsx`

- **Never treat a draft as valid unless its content is a well-formed doc.** In the hydration effect, when reading `draft`, only accept `draft.content` if it is an object with `type === "doc"` and an `Array.isArray(content)`. Otherwise ignore `draftHasContent`. Same guard for `draft.title` (must be a non-null string; empty string only allowed if the user genuinely cleared it, i.e. draft is newer than server AND title was already empty on the server).
- **Never write a draft that would represent a page wipe.** In `writeLocalDraft`, skip writing if `latestContentRef.current` is `null`/`undefined` AND `latestTitleValueRef.current` is empty. Also skip the whole write if hydration has not yet completed (`hydratedForPageRef.current !== pageId`) — nothing the user typed before hydration should be persisted, since we don't yet know the server baseline.
- **Clear the draft even after silent unmount flush failure.** In the unmount cleanup, if `flushNowRef.current({ silent: true })` rejects/returns false and no live component will retry, still leave a draft only if the pending content is a valid doc (uses the same validator as above). Simpler: reuse the guard so a bad draft can never persist across a reload.
- **Guard `flushNowRef.current` against no-op wipes.** Before building `patch`, if `contentDirty` and `latestContentRef.current` is not a valid doc, drop `content` from the patch (and leave `contentPendingVersion` alone so a future real edit will save). Same for `titleDirty` when `latestTitleRef.current === null`.

### 2. `src/lib/pages.functions.ts` (`updatePage`)

Add a server-side safety net so a buggy client can't wipe a page:

- Fetch the current row inside the handler (already done by `assertCanEditPage`; extend it or add a follow-up read for `title`, `content`).
- If the incoming `content` is an "empty doc" (`{ type: "doc", content: [] }` or missing/empty `content` array) AND the stored `content` is non-empty, drop `content` from the patch and log a warning with `pageId` + caller `userId`. Do the same for `title === ""` when the stored title is non-empty.
- If after this filtering the patch is empty (only `last_modified_at`), skip the UPDATE and return `{ ok: true, skipped: true }`.

### 3. `src/routes/api/pages.save.ts` (beacon endpoint)

Apply the exact same "don't overwrite non-empty with empty" guard as `updatePage`. The beacon runs at tab-close / hide time and is the highest-risk path because there is no UI feedback if it wipes the row.

### 4. Small telemetry

Add a single `console.warn("[pages] blocked empty-content overwrite", { pageId, userId })` in both server paths whenever the guard trips, so if this recurs we can trace which client path fired.

## Out of scope

- Real collaborative editing (still a future prompt).
- Any change to visibility, collaborators, presence, or the conversation panel.
- Any change to how successful edits are debounced/saved — only the "empty overwrite" edge is closed.

## Verification

1. Manual: open Page A with content, open Page B, wait 6 minutes, click Page A → content and title still present. Repeat with the tab hidden during the wait (exercises the beacon).
2. Manual: type in a page, force a network failure (offline), navigate away → confirm the draft written to `localStorage` is either a valid doc or absent; reload the page → confirm no empty save occurs.
3. DB check via read query on `pages.title` / `pages.content` before and after the reopen to confirm no wipe.
