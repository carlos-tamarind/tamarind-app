
## New Page creation flow

### 1. New `<NewPageDialog />` component

File: `src/components/page/new-page-dialog.tsx`

Single source of truth for any "create a new page" action. Uses shadcn `Dialog` (which already provides: click-outside to close, dark overlay, top-right X). Internal state resets on open/close; closing aborts the operation.

Props:
- `open: boolean`, `onOpenChange(open: boolean)`
- `workspaceId: string`
- `conversationId?: string` — when present, enables and defaults to the "Conversation" visibility option, and removes "Private" from the options
- `onCreated?(pageId: string)` — callback after a successful creation (used to navigate / invalidate queries)

Form fields (top → bottom):
1. **Page title** — `<Input>` with label "Page title", placeholder `"My new page"`, `maxLength={50}`. Counts characters with `Array.from(value).length` so emojis count as 1. Empty is allowed (server defaults to "Untitled"); we trim before sending.
2. **Page visibility** — `<Select>` with label "Page visibility".
   - When `conversationId` is set: options are `Workspace`, `Conversation` — default `Conversation`. `Private` is intentionally not offered (a page that originates from a conversation must remain reachable to that conversation's participants).
   - When `conversationId` is not set: options are `Workspace`, `Private` — default `Private`. `Conversation` is not offered.
3. **Page template** — `<Select>` with label "Page template", disabled, single placeholder item "No templates available" (no options yet).

Footer:
- `Cancel` (variant `secondary`) → closes the modal, no side effects.
- `Create` (variant `default`, primary) → calls the appropriate server fn, on success calls `onCreated(pageId)` then closes.

### 2. Server-function updates

`src/lib/pages.functions.ts` — `createBlankPage`:
- Extend input validator with optional `title?: string (max 50)` and `visibility?: "private" | "workspace"`.
- Pass through to the insert (`title` only if non-empty after trim; visibility defaults to `"private"`).
- No uniqueness constraint changes — `title` is already free-form text, duplicates already allowed.

`src/lib/conversations.functions.ts` — `createConversationPage`:
- Extend input validator with optional `title?: string (max 50)` and `visibility?: "workspace" | "conversation"` (no `"private"` accepted on this entry point, matching the UI constraint).
- Default visibility stays `"conversation"`.
- When `visibility === "workspace"`, create the page without the conversation link; when `"conversation"`, keep the existing conversation link.

### 3. Wire the modal into every touchpoint

Replace every direct `createBlankPage` / `createConversationPage` call site with opening the new dialog:

- `src/routes/_authenticated.w.$workspaceId.tsx`
  - Remove `handleNewPage`'s direct call; add `newPageOpen` state.
  - Folded rail "New page" dropdown item and expanded sidebar "New page" CTA → open `<NewPageDialog workspaceId={...} />`.
  - `onCreated` → invalidate `["pages-list", workspaceId]` and navigate with `?p=pageId`.

- `src/components/conversation/conversation-window.tsx`
  - Composer "New page" button → open `<NewPageDialog workspaceId conversationId />`.
  - `onCreated` → invalidate `pages-list` + `conversation-pages`, navigate with `?p=pageId`.

- `src/components/conversation/conversation-settings-dialog.tsx`
  - "New page" button in the Pages section → open `<NewPageDialog workspaceId conversationId />`.
  - On created: close settings dialog, invalidate the two queries, navigate.

Future touchpoints (message selection, in-page inline) will reuse the same component.

### 4. Page ID field in `PageSettingsDialog`

File: `src/components/page/page-settings-dialog.tsx`
- Add a new read-only `pageId` prop.
- Render a new block between "Title" and "Owner":
  - Label: `Page ID`
  - Value: monospace text of the page id (same non-editable styling as Owner).
- Update `src/components/page/page-window.tsx` to pass `pageId={page.id}` through.

### Notes

- Pages created from a conversation cannot be `Private` — enforced both in the dialog (option not rendered) and in `createConversationPage`'s zod validator (rejects `"private"`).
- Duplicated titles need no schema change — `pages.title` has no uniqueness constraint today, and `updatePage` already accepts any string.
- The 50-char cap is enforced client-side (input `maxLength` + grapheme count) and via zod `max(50)` in both server fns.
- No DB migration required.
