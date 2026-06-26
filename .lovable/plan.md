
## 1. Mentions inside conversation messages

Extend the conversation composer (`src/components/conversation/conversation-window.tsx`) to support the same mention chips already used in pages, but limited to two kinds:

- `@` → workspace user (any workspace member, in or out of the conversation). Reuses `MemberMention` + `MentionList`.
- `@@` → page mention, limited to:
  - pages with `visibility = 'workspace'` (public), OR
  - pages where `conversation_id = <current conversationId>` (local conversation pages).
- No `\` conversation mention in the composer (future feature).

Backend: add `listMentionablePages({ workspaceId, conversationId })` in `src/lib/conversations.functions.ts` that asserts participant and returns `workspace`-visible pages unioned with pages of the current conversation.

Rendering: messages already pass through `sanitizeMessageHtml` with a strict whitelist (`P/STRONG/EM/CODE/BR`). Extend it to allow `SPAN` with `class` in `{mention-member, mention-page}` plus `data-id`/`data-label`, and to allow the inline mention `<svg>` produced by `custom-mentions.ts` (preserving `class="mention-icon"` and structural attributes). Clicking a page chip in a delivered message navigates via `search: { p: <id> }`; member chips are no-ops for now.

## 2. Open page from conversation details modal in split view

`src/components/conversation/conversation-settings-dialog.tsx`: clicking a page row sets the workspace-route search param `p` (keeping `c` intact) instead of routing to `/w/$workspaceId/p/$pageId`, so the central panel splits into conversation + page using existing split logic in `_authenticated.w.$workspaceId.tsx`.

## 3. Resizable message composer

In `conversation-window.tsx`, replace the static `grid-rows-[auto_8fr_2fr]` with a vertical `ResizablePanelGroup`:

- header (auto, outside group)
- messages panel
- composer panel: `defaultSize=20`, `minSize=12`, `maxSize=33`

Resize handle between messages and composer.

## 4. Tooltips on conversation buttons

Wrap these icon buttons in `conversation-window.tsx` with shadcn `Tooltip` (`TooltipProvider` added locally if not inherited):

- Participants → "Participants"
- New page → "New conversation page"
- Send → "Send message"
- Bold / Italic / Code → "Bold text" / "Italic text" / "Inline code"

## 5. Swap participants icon

Use Lucide `Users` (the `users` icon) for the participants button in the header, for both direct and group conversations.

## 6. Editable conversation title (groups only)

### Default title for groups

When `conversations.title` is `null` and the conversation has >2 participants, build the default as comma-separated display names (or email fallback), then truncate so the rendered title stays on a single line within its header slot with breathing room from the edges:

- Compute the default on the client in the title component (server still returns the raw stored title, which is `null` for unedited groups).
- Render the title inside a flex container that's bounded by `min-w-0` plus right-side padding (e.g. `pr-3`) before the pencil/lock icon, with `truncate` (`overflow:hidden; white-space:nowrap; text-overflow: ellipsis`).
- Cap the source string itself at ~64 characters: join names with `", "`, and if the result exceeds 64 chars, cut at the last full name that fits and append `" ..."`. This avoids both layout overflow and an overly long stored default.
- `text-overflow: ellipsis` acts as a second line of defense on narrow viewports.

The same rule applies to the title shown in the conversation details modal (truncate visually; the underlying default value is the same capped string).

### Edit behavior

- 1:1 (direct, 2 participants): title is read-only. Show `LockKeyhole` to the right of the title in both the header and the modal.
- Group (>2 participants): title is editable.
  - Show a `Pencil` icon-button to the right of the title in the header and the modal.
  - Click pencil → title becomes an `<input>` prefilled with the current value (stored value, or the truncated default if none stored). Pencil is replaced by `X` (cancel) and `Check` (confirm).
  - Cancel, click-outside (blur), or Escape → revert, discard changes.
  - Confirm or Enter → call server fn, persist, exit edit mode.
  - Closing the details modal while editing also discards changes.

### Backend

Add `renameConversation({ conversationId, title })` in `src/lib/conversations.functions.ts`:
- Assert participant.
- Reject if type is `direct` or participant count <= 2.
- Trim; enforce length 1–120.
- Update `conversations.title`.
- Invalidate `conversation` and `conversations-list` queries on the client.

### UI

- New shared component `src/components/conversation/editable-title.tsx` with `{ value, editable, onSave }` so header and modal share behavior.
- Used in `conversation-window.tsx` header and in `conversation-settings-dialog.tsx`.

## Technical notes

- All work stays in `src/components/conversation/*`, `src/components/editor/*` (reuse existing extensions), and `src/lib/conversations.functions.ts`.
- `MemberMention` / `PageMention` already serialize to clean inline SVG HTML that round-trips through the expanded sanitizer.
- `ResizablePanelGroup` with `direction="vertical"` is supported by the existing `@/components/ui/resizable` wrapper.
- No DB migration required.
