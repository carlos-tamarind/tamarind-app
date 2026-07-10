## Goal

When a user creates a new page from inside a conversation (either a blank conversation page or a page built from selected messages), automatically post an announcement message in that conversation. The message is authored by the page creator, contains a link/mention to the freshly created page, and behaves like any other message (selectable, quotable, sanitized on render, clickable page chip navigates to the page).

## Message shape

`raw_text` HTML written directly to the `messages` table:

```html
<p>Hey! I just created this page:</p>
<p><span class="mention-page" data-id="{PAGE_ID}" data-label="{TITLE}">{TITLE}</span></p>
```

This matches the DOM produced by `PageMention.renderHTML` (minus the inline SVG, which is optional decoration — the `mention-page` chip styling and the existing click handler in `conversation-window.tsx` at line 589 work off `data-id` alone).

The sanitizer (`sanitizeMessageHtml`) already allows this exact structure (`mention-page` is in `ALLOWED_MENTION_CLASSES`, and `data-id` / `data-label` are in `KEEP_ATTRS_ON_MENTION`), so it round-trips unchanged if a user later quotes it.

## Server changes — `src/lib/conversations.functions.ts`

1. Add a small helper `postPageAnnouncementMessage({ conversationId, workspaceId, authorWuId, pageId, pageTitle })` that:
   - HTML-escapes the title (small local `escapeHtml`).
   - Builds the announcement HTML above.
   - Inserts into `messages` with `author_workspace_user_id = authorWuId` and `raw_text = html`.
   - Bumps `conversations.last_modified_at`.
   - Wrapped in `try/catch` so a failure never rolls back a successful page creation (just logs a `console.warn`).

2. In `createConversationPage`'s handler:
   - After the successful page insert, resolve the final title used (`data.title?.trim() || "Untitled"` to match the DB default when title is omitted — we already have `data.title` locally, and read back the row's `title` if omitted so the announcement label matches what the sidebar shows).
   - Call `postPageAnnouncementMessage`.

3. In `createPageFromMessages`'s handler:
   - After the successful page insert, call `postPageAnnouncementMessage` with `finalTitle` (already computed).

No schema changes, no new server functions, no changes to message read/write pipelines.

## Client changes — `src/components/page/new-page-dialog.tsx`

In `handleCreate`, after either `createInConv` or `createFromMessages` resolves, also invalidate the messages query so the announcement appears immediately if the user stays in / returns to the conversation:

```ts
queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
```

No other client changes are needed:
- Existing rendering of `raw_text` will render the `<p>` blocks and the `mention-page` chip.
- Existing click handler navigates to the page when the chip is clicked.
- Selection / quoting / MCM behavior already keys off `<li data-message-id="...">`, so the auto-message is treated exactly like any other.

## Out of scope

- No new realtime broadcast — messages appear on next fetch (invalidation covers the common case where the user comes back to the conversation).
- No i18n of the "Hey! I just created this page:" string (matches existing copy style).
- No change to the blank-workspace / private page flow (that path has no conversation to announce into).
