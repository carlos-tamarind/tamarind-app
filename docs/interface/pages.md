# Pages

Pages are rich-text documents where teams distill and organize knowledge. They support TipTap editing, @mentions, visibility controls, sharing, duplication, and autosave.

## Page Model

| Field | Description |
|-------|-------------|
| `title` | Page title |
| `content` | TipTap JSON document |
| `plain_text` | Generated column for full-text search |
| `visibility` | `private`, `conversation`, `workspace`, `external` |
| `page_type` | `standard`, `template`, `generated`, `imported` |
| `origin_type` | `user`, `conversation`, `import`, `ai` |
| `parent_page_id` | Optional parent for hierarchical pages |
| `conversation_id` | Optional link to a conversation |
| `purged_at` | Scheduled purge time (`NULL` = live; future = trashed; past = due for hard delete) |

`page_type: template` exists in the schema. The New Page dialog does **not** expose a template picker in the MVP.

## UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `PageWindow` | [`page-window.tsx`](../../src/components/page/page-window.tsx) | Main page editor |
| `NewPageDialog` | [`new-page-dialog.tsx`](../../src/components/page/new-page-dialog.tsx) | Title + visibility; blank, conversation-scoped, or from-messages |
| `PageSettingsDialog` | [`page-settings-dialog.tsx`](../../src/components/page/page-settings-dialog.tsx) | Page metadata and settings (`DialogContent` size `detail`, 630px) |
| `SharePageDialog` | [`share-page-dialog.tsx`](../../src/components/page/share-page-dialog.tsx) | Share to members or conversations |
| `DuplicatePageDialog` | [`duplicate-page-dialog.tsx`](../../src/components/page/duplicate-page-dialog.tsx) | Copy page to another context (main dialog `md` so the visibility row fits) |
| `PageDeletionBanner` | [`page-deletion-banner.tsx`](../../src/components/page/page-deletion-banner.tsx) | Grace-period copy with owner Undo / Erase now |

## Page Editor Features

The main editor ([`page-window.tsx`](../../src/components/page/page-window.tsx)) provides:

- **TipTap rich text** — headings, underline (`__text__`), lists, task lists, code blocks, quotes
- **Code-block shortcut** — **⌘⇧E** on macOS or **Ctrl+Shift+E** on Windows/Linux
- **Slash commands** — `/` palette for inserting blocks ([`slash-command.tsx`](../../src/components/editor/slash-command.tsx))
- **@mentions** — `@` for workspace members and group/channel conversations (1:1 DMs deduped against members), `@@` for pages
- **Autosave** — debounced save via `updatePage`; status reported to the status bar (`SaveStatusProvider`)
- **Beacon save** — flush on tab close via `POST /api/pages/save`
- **Title in the header** — condenses on scroll
- **Visibility chip** — labeled control for who can see the page (hidden while the page is trashed)
- **Deletion banner** — while trashed: remaining grace period; owner can Undo or Erase now
- **Backlinks** — icon rows in a bordered card
- **Share and duplicate** — copy page to another conversation or workspace member
- **Presence** — overlapping avatars with tooltips (Supabase Presence)
- **Unsaved changes blocker** — warns before navigating away
- **Local drafts** — `tamarind:page-draft:{pageId}` in localStorage, with a one-time read of legacy `mento:page-draft:{pageId}` keys

## Autosave

Two save mechanisms prevent data loss:

1. **Debounced server function** — `updatePage` called after editing pauses
2. **Beacon API** — `POST /api/pages/save` on `beforeunload` / `visibilitychange`

The beacon endpoint accepts the access token in the request body (since beacon requests cannot set headers). See [API Routes](../api/readme.md).

Save progress (`idle` / `saving` / `saved` / `error`) is shown in the [status bar](user_interface.md).

## Server Functions

All in [`src/lib/pages.functions.ts`](../../src/lib/pages.functions.ts):

| Function | Method | Purpose |
|----------|--------|---------|
| `createBlankPage` | POST | Create empty page in workspace |
| `listMyPages` | GET | User's accessible pages (`lastModifiedAt`, `purgedAt`, `ownerWorkspaceUserId`) |
| `getPage` | GET | Page content and metadata (`purgedAt`, `isOwner`) |
| `updatePage` | POST | Save title and content |
| `setPageVisibility` | POST | Change visibility level (blocked when trashed) |
| `getPageBacklinks` | GET | Pages linking to this page |
| `sharePage` | POST | Share page to members/conversations (blocked when trashed) |
| `duplicatePage` | POST | Copy page to another context (blocked when trashed) |
| `trashPage` | POST | Owner: schedule purge (`purged_at = now() + 30 days`) |
| `recoverPage` | POST | Owner: clear `purged_at` |
| `purgePageNow` | POST | Owner: set `purged_at = now()`, rewrite mentions, hard-delete |

## Trash, recover, and purge

Only the owner can trash a page (from page settings). Trashing sets `purged_at` 30 days ahead (`DELETE_PAGE_GRACE_PERIOD_MS` in [`src/lib/delete-entities/config.ts`](../../src/lib/delete-entities/config.ts)). The page stays readable, editable, searchable, and in the semantic pipeline. Share, publish, duplicate, and pin are blocked; existing pins are removed.

The owner sees the page only under **Deleted** in the nav (recover control on the row). Other users with access still see it in its original section, without pin/visibility actions.

Recover clears `purged_at`. Erase now confirms, then rewrites remaining `pageMention` / `mention-page` references to `[Deleted page]` and calls `purge_due_entities` for that id. The hourly purge worker does the same rewrite hook before the global sweep.

Settings footer CTAs are content-sized and centered, with Publish / Share / Duplicate icons. The trash control is a destructive icon button on the next row, right-aligned.

## Visibility Levels

| Visibility | Access |
|------------|--------|
| `private` | Owner and explicit collaborators |
| `conversation` | Linked conversation participants |
| `workspace` | All workspace members |
| `external` | Schema-ready; not yet implemented |

Collaborators are tracked in `page_collaborators` when they edit a page. RLS policies use `is_page_collaborator()` for access checks.

## Editor Extensions

Shared TipTap extensions in [`src/components/editor/`](../../src/components/editor/):

| Extension | File | Purpose |
|-----------|------|---------|
| Custom mentions | `custom-mentions.ts` | `@@` page, `@` member/conversation nodes (with avatars) |
| Mention entities | `mention-entities.ts` | Unified `@` autocomplete fetch/merge |
| Mention suggestion | `mention-suggestion.ts` | Tippy popup + insert command |
| Mention list | `mention-list.tsx` | Autocomplete popup |
| Formatting extensions | `formatting-extensions.ts` | Shared underline input rule and code-block shortcut |
| Slash command | `slash-command.tsx` | `/` block insertion palette |
| Quote node | `quote-node.tsx` | Quote blocks for conversation messages |

## Page Origins

Pages can be created from multiple sources:

| Origin | How |
|--------|-----|
| `user` | Blank page via NewPageDialog |
| `conversation` | Conversation-scoped page or from selected messages |
| `import` | Schema-ready |
| `ai` | Schema-ready |

Creating a page from messages (`createPageFromMessages` in conversations.functions.ts) sets `origin_type: 'conversation'`.

## Related Docs

- [User Interface](user_interface.md) — Where pages appear in the shell
- [Conversations](conversations.md) — Creating pages from messages
- [Workspaces & Permissions](workspaces_permissions.md) — Visibility and access
- [API Routes](../api/readme.md) — Beacon save endpoint
