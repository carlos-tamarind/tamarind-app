## Editor UX fixes

### 1. Cursor jumping to end / dropped characters

**Root cause:** After every autosave (600ms debounce) `PageWindow` invalidates `["page", pageId]`. The refetch resolves, the `useEffect([data, editor])` runs, and `editor.commands.setContent(data.content)` rewrites the document — which (a) resets the selection to the end and (b) clobbers characters typed between the save firing and the refetch landing.

**Fix in `src/components/page/page-window.tsx`:**
- Remove the `["page", pageId]` invalidation from the autosave success handler, the title `onBlur` save, and the unmount-flush effect. Keep `pages-list` and `page-backlinks` invalidations.
- Harden hydration so it only seeds the editor once per `pageId` (track a `hydratedForPageRef`). Future refetches (presence, refocus, etc.) will no longer overwrite the live document.
- Only set the title input from server data when `dirtyTitleRef.current === null`, so in-flight typing isn't overwritten.

### 2. Icon prefixes for mentions

Replace the textual trigger characters in rendered chips with monochrome Lucide icons. The chip becomes `[icon] Name` with a single space between icon and label.

Icons (inlined as static SVG strings copied from Lucide):
- Workspace user → `user-round`
- Page → `notebook-text`
- Conversation → `messages-square`

**Files:**
- `src/components/editor/custom-mentions.ts`:
  - Add `renderHTML` to `PageMention` and `ConversationMention` that emits `<span class="mention-…"><svg…/> Label</span>` using the corresponding inlined Lucide SVG. Update `renderText` to return plain `Label` (no `@@`/`\`) so copy/paste is clean.
  - Export a `MemberMention` (extends `@tiptap/extension-mention`) with the same `renderHTML`/`renderText` pattern using the `user-round` SVG.
- `src/routes` / `src/components/page/page-window.tsx` and `src/components/conversation/conversation-window.tsx`: swap the bare `Mention` extension for the new `MemberMention` so member chips also get the icon.
- `src/styles.css`: add rules for `.mention-member`, `.mention-page`, `.mention-conversation` — inline-flex, `gap: 1ch`, SVG sized `1em` with `currentColor` stroke, no extra background tint beyond existing chip styles.

Trigger characters (`@`, `@@`, `\`) and the `MentionList` suggestion popup are unchanged.

### Out of scope
No backend, schema, slash-menu, presence, backlink, or save-semantics changes beyond the invalidation tweak above.
