## Goal

Let users quote 1+ selected messages via the "Quote" contextual action. Quoted messages appear as removable, boxed chips inside the composer (interleaved with typed text). Sent messages persist quotes as distinct boxed blocks; clicking a quote scrolls to the original. Quotes may nest recursively. When exporting selected messages into a page (existing `createPageFromMessages` flow), quotes are rendered as markdown-style blockquotes.

## 1. Data model (client-only markup, no DB migration)

Reuse the existing `raw_text` HTML column. Represent a quote as a self-contained block element the sanitizer already understands:

```html
<div class="msg-quote" data-quote-id="<original-message-id>" data-author="<author label>" data-created-at="<ISO>">
  <!-- nested sanitized HTML of the quoted message, may itself contain .msg-quote -->
</div>
```

- No schema change. Existing messages remain valid.
- `data-quote-id` powers click-to-scroll and the page-export blockquote metadata.
- Nesting is native: a `.msg-quote` may contain other `.msg-quote` elements.

Update `sanitizeMessageHtml` in `conversation-window.tsx`:
- Add `DIV` to `ALLOWED_MESSAGE_TAGS` **only when** it carries `class="msg-quote"`; otherwise unwrap.
- Whitelist `class`, `data-quote-id`, `data-author`, `data-created-at` on `.msg-quote` divs; strip everything else.
- Recurse into children so nested quotes and their inner formatting survive.

## 2. Tiptap Quote extension (composer)

New file `src/components/editor/quote-node.ts` exporting a `QuoteBlock` Node:
- `name: "quoteBlock"`, `group: "block"`, `content: "block+"` (so nested quote blocks + paragraphs work), `defining: true`, `selectable: true`, `draggable: false`, `atom: false`.
- Attrs: `quoteId`, `author`, `createdAt` (all string, nullable).
- `parseHTML`: `div.msg-quote` with data-attrs → node.
- `renderHTML`: `<div class="msg-quote" data-quote-id data-author data-created-at>` wrapping content.
- `NodeView` (React) renders the box with:
  - Muted background box (Tailwind: `rounded-md border bg-muted/50 px-3 py-2 my-1 relative group`).
  - Small header row with author + timestamp in muted text.
  - `NodeViewContent` for the inner ProseMirror content (read-only visually but structurally editable — we set `contentEditable={false}` on the wrapper except the inner content area; actually simpler: allow content edits at the ProseMirror level but the user just doesn't type into it normally since we insert full nodes).
  - Absolute-positioned `CircleX` button top-right, `opacity-0 group-hover:opacity-100`, click removes the node (`getPos()` + `deleteRange`).
- Register `QuoteBlock` in the composer's `useEditor` extensions list in `conversation-window.tsx`.

## 3. MCM "Quote" wiring

In `conversation-window.tsx`:
- Enable the folded "Quote" button (currently `disabled`) and the expanded "Quote {plural}" button (currently `noop`).
- Handler `handleQuoteSelection`:
  1. Take `selectedIds`, sort by chronological order (same pattern as `handleCreatePageFromSelection`).
  2. For each message id → build a `quoteBlock` ProseMirror node from `{quoteId: m.id, author, createdAt, content: parsed HTML of m.rawText}`. Use `editor.schema.nodeFromJSON` after converting the sanitized HTML string to PM JSON via `generateJSON(html, extensions)` from `@tiptap/html` — but simpler: use `editor.commands.insertContent(htmlString)` with the `msg-quote` div HTML; the `QuoteBlock.parseHTML` picks it up. Inner HTML is the message's already-sanitized `rawText` (which may itself contain `.msg-quote` divs).
  3. Insert each quote block into the composer at the current selection, appending a trailing empty paragraph after the last one so the user has a caret to type in.
  4. `editor.commands.focus()` and `clearSelection()`.
- Selection state and MCM auto-collapse: `clearSelection()` already handles both.

## 4. Sending & rendering quotes on sent messages

- `handleSend` already sends `editor.getHTML()`. The QuoteBlock's `renderHTML` guarantees the persisted HTML contains the `.msg-quote` markup with data attrs.
- The message list already renders sanitized HTML via `dangerouslySetInnerHTML`. Add CSS in `src/styles.css` for `.msg-quote`:
  - Muted background box, border, rounded, small header row rendered via a `::before` pseudo-element that shows `attr(data-author)` — actually pseudo-elements can't render two attrs cleanly. Instead: leave header off in sent messages OR render it inline as regular content when the block is created (the author/date live in data-attrs; CSS `::before { content: attr(data-author) " · " attr(data-created-at); }` covers this).
  - Nested `.msg-quote` inherits styling and gets extra left inset for indent.

## 5. Click-to-scroll on quotes

In `conversation-window.tsx#handleMessageClick` (currently handles `span.mention-page`):
- Extend to also match `.msg-quote[data-quote-id]`.
- On click: resolve `data-quote-id`, find `messages.find(m => m.id === id)`. If it exists in the current conversation's message list, scroll the corresponding `<li>` into view (`scrollIntoView({behavior: "smooth", block: "center"})`) and briefly flash-highlight it (add a `data-flash` class + timeout that removes it; CSS transitions the background).
  - Give each `<li>` a stable `id={`msg-${m.id}`}` or `data-message-id` for lookup.
- If the id isn't in the loaded list (e.g. deleted / outside window), do nothing (best-effort, matches spec).

## 6. Page export: quote → markdown blockquote

In `conversations.functions.ts#createPageFromMessages`, replace `htmlToParagraphs` with an HTML→ProseMirror-blocks converter that handles `.msg-quote`:

Add server helper `htmlToProseMirrorBlocks(html)` that:
- Parses HTML using a lightweight tokenizer (regex-based is fragile; use a tiny hand-written walker with `linkedom` — check package first, else roll a minimal recursive parser using regex against `<div class="msg-quote"...>...</div>` boundaries).
- Emits ProseMirror JSON:
  - Regular paragraph runs → `paragraph` nodes (as today).
  - Each `.msg-quote` div → a `blockquote` node containing the recursive conversion of its inner HTML. Prepend a paragraph with the author + date from data-attrs so the reader keeps context (e.g. `**{author} on {YYYY-MM-DD}:**`).
  - Nested `.msg-quote` recurse into nested `blockquote` nodes.
- Blockquote is a standard ProseMirror node (part of StarterKit); page editor already supports it — no page-side changes needed. The markdown-style quote requirement is satisfied by using `blockquote` (renders as `> ...`) which is what StarterKit's `Blockquote` node maps to.

Update the "for each msg in run" loop to push the resulting block array instead of paragraphs.

## 7. Cross-cutting details

- Keyboard: pressing Backspace at the start of an empty paragraph directly after a QuoteBlock deletes the block (Tiptap default for `defining: true` nodes handles this; verify).
- Multi-quote insertion order = selection chronological order.
- `handleSend` empty-check: currently `editor.getText().trim()` — a composer with only quote blocks returns empty text. Change to allow send when the doc has any non-empty block: `!editor.isEmpty` OR contains ≥1 `quoteBlock`. Simplest: `editor.state.doc.textContent.trim().length > 0 || editor.state.doc.descendants(n => n.type.name === "quoteBlock")`. Update `isEmpty` state derivation accordingly.
- `sendMessage` server fn validates `rawText.min(1).max(10000)`. Quote HTML is comfortably under 10 KB for reasonable selections; if a user quotes very large content we truncate via existing max — accept 400 error as-is (out of scope to fix now).

## Verification

- Select 2 messages → click "Quote" (folded MCM). Both appear as chips in composer, in chronological order. Hover shows CircleX. Click CircleX on top chip → it disappears, remaining chip snaps up.
- Type text above and below chips, send. Sent message shows two boxed quotes with author/date header; typed text renders normally around them.
- Click a quote inside someone else's sent message → conversation scrolls to the original with brief highlight.
- Quote a message that already contains a quote → nested box renders correctly, both in composer and after send.
- Select messages that contain quotes → "Create new page" → generated page renders each quoted message as a blockquote (with nested blockquotes preserved), author/date paragraph included above each blockquote's content.
