# Fix: cursor jumps to end of page after autosave

## What's happening

Every successful autosave invalidates the `["page", pageId]` query, so the page refetches and comes back with a new `lastModifiedAt`. The editor's hydration effect sees a changed `lastModifiedAt` and re-applies the document with `editor.commands.setContent(...)` — even though the content is byte-identical to what the user already has on screen. `setContent` rebuilds the ProseMirror doc and resets the selection, which lands the caret at the last writable position. That's the jump the user sees right after the debounce fires.

## The fix

Three changes in the page editor (`src/components/page/page-window.tsx`), all presentation-level — no change to what gets persisted:

1. **Record our own save as the hydration baseline.** When a save succeeds and we write the fresh row into the query cache, also advance `hydratedLastModifiedAtRef` to the value the save returned/refetched, so a self-triggered refetch is never mistaken for a remote change.

2. **Skip no-op re-hydration.** In the "already hydrated" branch, compare the incoming server content and title against what the editor currently holds. If they are equivalent, update the stored `lastModifiedAt` and return without touching the document. This alone removes the caret jump in the single-user case and makes the guard robust regardless of timing.

3. **Preserve the caret when re-hydration is genuinely needed** (real remote change). Capture `editor.state.selection` before `setContent`, then restore it clamped to the new document size afterwards, keeping focus only if the editor was focused.

## Verification

- Type in the middle of a page, pause for the debounce, confirm the caret stays put and the save status still reaches "saved".
- Repeat on a private page, a conversation page, and a workspace page.
- Edit the title, confirm nav list still updates.
- Reload the page and confirm the saved content is intact.

## Version

Bump `src/lib/version.ts` to `0.3.144`.

## Also: unblock the current type-check failures

The build currently fails on mention typings, unrelated to the caret bug but blocking any change:

- `@tiptap/suggestion` was pinned to `^3.23.6` and pulled its own nested `@tiptap/core` 3.23.6, producing "two different Editor types" errors. Already realigned to `^3.30.1` (resolves to 3.30.2, deduped).
- `src/components/conversation/conversation-window.tsx` (~line 725) passes `mentionOpenRef` directly as the options argument to `buildMentionSuggestion`; it must be `{ openCounter: mentionOpenRef }`.
- `buildEntityMentionSuggestion` in `src/components/editor/mention-suggestion.ts` types its `command` props as `MentionEntityItem`, which is not assignable to Tiptap's `MentionNodeAttrs`. Widen the parameter to Tiptap's attrs type and narrow to `MentionEntityItem` inside the handler.
