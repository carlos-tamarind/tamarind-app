## Goal

Wire the conversation MCM "Create new page" (both folded "New page" and expanded "Create new page") into a preset flow that opens the new-page dialog and, on confirm, creates a Conversation-scoped page pre-populated with the selected messages using the schema in the prompt.

## 1. Server function — `createPageFromMessages`

New server function in `src/lib/conversations.functions.ts`:

- Input: `{ conversationId, messageIds: string[] (min 1), title?, visibility: "workspace" | "conversation" (default "conversation") }`.
- `assertParticipant`, then fetch:
  - conversation (title, workspace_id) + all participants (label + workspace_user_id)
  - messages by id, filtered to this conversation, ordered `created_at asc` (author label + raw HTML/text + createdAt)
  - creator label = current workspace user
- Build page **title** (server-side, canonical): `Messages from <conv title> on YYYY-MM-DD HH:MM` (UTC, minute precision). If client sent a non-empty `title`, use it verbatim (user edits allowed).
- Build ProseMirror **content** doc:
  1. `heading level 1` = title.
  2. `bulletList` with 4 `listItem > paragraph` entries:
     - "Original conversation: " + `conversationMention {id: conversationId, label: convTitle}`
     - "Original participants: " + participants joined with ", " as `mention {id: workspaceUserId, label}` nodes
     - "Creation date: <RFC 2822 without timezone suffix>" (e.g. `Wed, 08 Jul 2026 14:03:00`)
     - "Created by: " + `mention {id: meWuId, label: meLabel}`
  3. Empty `paragraph` (line break).
  4. `heading level 2` = "Contents".
  5. `horizontalRule`.
  6. For each **contiguous run** of messages by the same author (chronological), emit:
     - `paragraph` with text `<author> on YYYY-MM-DD` (bold via mark if easy; else plain).
     - Then, for each message in the run, parse `raw_text` (HTML) into ProseMirror nodes and append. Fallback: one `paragraph` per message containing the plain text.
     - `paragraph` empty separator between runs.
- Insert into `pages` with `workspace_id`, `created_by_workspace_user_id = meWuId`, `owner_workspace_user_id = meWuId`, `visibility` (default `conversation`), `page_type = "standard"`, `origin_type = "conversation"`, `origin_source_id = conversationId`, `conversation_id = conversationId` (when visibility is `conversation`), `title`, `content`.
- Return `{ pageId }`.

HTML→ProseMirror: use a lightweight conversion (existing `sendMessage` stores raw HTML). Reasonable approach: split on `<br>`/block tags into paragraphs, strip HTML tags for text content in this iteration. We can iterate later; the important guarantee is content is never empty.

## 2. Dialog — extend `NewPageDialog`

Add optional props: `mode?: "blank" | "fromMessages"`, `presetTitle?: string`, `messageIds?: string[]`.

When `mode === "fromMessages"`:
- Initial `title` = `presetTitle` (editable, still 50-char cap).
- Force `visibility` default to `"conversation"`; keep the select behavior for conversation contexts (Workspace / Conversation).
- Template select: keep `disabled`, but change the visible value to `"New conversation page from message selection"` (add a hidden `SelectItem` with that value so the label renders inside the trigger).
- On Create: call the new `createPageFromMessages` server fn instead of `createConversationPage`. Invalidate `["conversation-pages", conversationId]` and `["pages-list", workspaceId]`. Navigate to the new page (same behavior as blank).

## 3. Conversation window wiring

In `src/components/conversation/conversation-window.tsx`:
- Compute preset title client-side for display: `Messages from ${displayTitle} on YYYY-MM-DD HH:MM` (local time; server re-derives canonical value if the user leaves it unchanged — acceptable minor drift, since the field is editable anyway).
- Replace `noop` on the expanded "Create new page" button and enable the folded "New page" button to open `NewPageDialog` in `fromMessages` mode with `messageIds = Array.from(selectedIds)` and the preset title.
- After successful create (via `onCreated`), call `clearSelection()` and navigate to the new page (existing default nav from the dialog does this; wire `onCreated` only if we need extra cleanup).

## 4. Notes / non-goals

- "Original conversation" link scroll-to-first-message is best-effort: `conversationMention` currently just opens the conversation. Deep-scroll-to-message is deferred (not blocking).
- "Add to page", "Quote", "Copy", "Delete" MCM options stay as placeholders.
- No DB migration required (uses existing `pages` schema).
- No changes to page-save guards from previous fix.

## Verification

- Select 1 message → folded MCM "New page" opens dialog with preset title + Conversation visibility + disabled template showing "New conversation page from message selection". Create → new page renders with schema.
- Select 3+ messages from 2 authors interleaved → runs group correctly by contiguous author.
- Non-participant workspace member cannot see the page (visibility=conversation, RLS via `conversation_id`).
