# Conversations — MVP implementation plan (revised)

## Scope

Build the conversation experience: header, message list, composer with basic inline formatting (bold/italic/code), real-time delivery, group vs private split in the sidebar, participant management, and creation of conversation-owned pages from within a conversation.

Out of scope (deferred): channels (schema-ready, no UI), emoji reactions, replies, message edit/delete, participant removal, conversation deletion, page creation directly from a message, selective history sharing.

## 1. Database migration

- Add enum `conversation_type` with values `direct`, `group`, `channel`.
- Add `conversations.type conversation_type NOT NULL DEFAULT 'direct'`. Backfill existing rows from participant count (`2 → direct`, `>2 → group`).
- Add nullable `conversations.image_url text` for the settings modal placeholder slot.
- Enable Supabase Realtime on `public.messages`: `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages` + `ALTER TABLE public.messages REPLICA IDENTITY FULL`.
- No changes to history visibility — every participant sees full history (existing RLS already allows this).
- No new policies needed; existing policies cover the new column.

## 2. Server functions (`src/lib/conversations.functions.ts`)

Keep existing `listMyConversations`, `findOrCreateConversation`, `listWorkspaceMembers`. Add/extend:

- `findOrCreateConversation` — set `type = 'direct'` when exactly 2 participants (incl. me), else `'group'`.
- `getConversation({ conversationId })` → `{ id, title, type, imageUrl, participants: [{ workspaceUserId, displayName, avatarUrl, isMe }] }`.
- `listMessages({ conversationId, limit, before? })` → paginated, ordered ASC.
- `sendMessage({ conversationId, rawText, contentJson })` → inserts into `messages`, bumps `conversations.last_modified_at`.
- `addParticipants({ conversationId, workspaceUserIds })` → inserts rows. If the conversation was `direct` and now has 3+ participants, promote `type` to `group` in the same transaction.
- `listConversationPages({ conversationId })` → pages where `conversation_id = ?`.
- `createConversationPage({ conversationId })` → creates a page with `conversation_id`, `visibility='conversation'`, `origin_type='conversation'`, `origin_source_id=<conversationId>`, returns `pageId`.
- `listMyConversations` returns `type` so the sidebar can split.

## 3. Sidebar update (`src/routes/_authenticated.w.$workspaceId.tsx`)

Inside the Conversations tab, split into two labeled subsections:

- **Direct messages** — `type = 'direct'`
- **Groups** — `type = 'group'`

Row icon: `User` (direct) / `Users` (group). "New conversation" button unchanged.

## 4. Conversation route (`src/routes/_authenticated.w.$workspaceId.c.$conversationId.tsx`)

Replace the placeholder with a three-section layout.

### Header (top, bordered divider)
- Left: conversation title (bold).
- Right cluster:
  - Type icon (`User` / `Users`). For groups, click opens a Popover listing participants + an "Add participants" button (opens add-participants modal).
  - `MoreHorizontal` 3-dot icon → opens Settings modal.

### Message list (center, scrollable)
- `useQuery(['messages', conversationId])` calling `listMessages`.
- Real-time: subscribe to `postgres_changes` on `messages` filtered by `conversation_id=eq.<id>`; append on INSERT (dedupe by id).
- Bubbles:
  - Mine: right-aligned, `bg-primary text-primary-foreground`.
  - Others: left-aligned, `bg-muted`; author name shown above bubble when sender changes.
  - Timestamp under bubble: `HH:mm, DD-MM-YYYY` (small, muted).
- Auto-scroll to bottom on mount and on new message when already near bottom.

### Composer (bottom, bordered divider)
- Small TipTap editor (StarterKit subset). Toolbar: Bold, Italic, Code (lucide icons).
- Bottom-right cluster:
  - "New page" button (`FilePlus`) → calls `createConversationPage`, invalidates pages list, navigates to `/w/$workspaceId/p/$pageId`.
  - "Send" (`Send`) → disabled when empty; calls `sendMessage` with `rawText` + JSON; clears editor.
- Enter sends, Shift+Enter newline.

## 5. Modals (`src/components/conversation/`)

- `add-participants-dialog.tsx` — searchable workspace member list (reuses `listWorkspaceMembers`), multi-select excluding current participants, "Add" CTA → calls `addParticipants`. Standard modal behavior (X / backdrop / secondary CTA).
- `conversation-settings-dialog.tsx` — shadcn Dialog with:
  1. Placeholder image (initials avatar from title).
  2. Title (read-only for now).
  3. Participant list + "Add participants" button (opens add-participants dialog).
  4. Conversation pages list (`listConversationPages`) — rows link to the page; "New page" button at the bottom.

## 6. Visual / UX notes

- Use semantic tokens (`bg-primary`, `bg-muted`, `text-muted-foreground`) — no raw colors.
- Empty state: centered "No messages yet — say hi."
- Type icons: `User` (direct), `Users` (group); channel icon reserved.

## 7. Verification

- Build clean; open a conversation across two sessions, confirm realtime delivery and bubble alignment.
- Add a third member to a `direct` conversation; confirm `type` flips to `group` and sidebar moves it to the Groups subsection.
- Create a page from the composer; confirm it appears in the settings modal's pages list.

## Files touched

- New migration (enum + `type` column + `image_url` + realtime).
- `src/lib/conversations.functions.ts` — extended.
- `src/lib/pages.functions.ts` — `createConversationPage` (or extend `createBlankPage`).
- `src/routes/_authenticated.w.$workspaceId.tsx` — sidebar split.
- `src/routes/_authenticated.w.$workspaceId.c.$conversationId.tsx` — full rewrite.
- `src/components/conversation/conversation-header.tsx`
- `src/components/conversation/message-list.tsx`
- `src/components/conversation/message-composer.tsx`
- `src/components/conversation/add-participants-dialog.tsx`
- `src/components/conversation/conversation-settings-dialog.tsx`

## Estimated token budget

~40–50k tokens end-to-end including migration approval round-trip and QA fixes.