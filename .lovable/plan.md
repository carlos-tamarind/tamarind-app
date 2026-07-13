## 1. Remove redundant H1 in pages built from messages

In `src/lib/conversations.functions.ts` → `createPageFromMessages`, the doc content currently starts with an `<h1>` matching the page title. Drop that first heading node so the doc opens directly with the properties list. The `title` field on the page row is unchanged.

## 2. Restructure the properties block

Still in `createPageFromMessages`, replace the plain bullet list with:
- An `<h2>` **Page properties**
- A `horizontalRule`
- The existing bullet list (Original conversation / Original participants / Creation date / Created by)

Then continue with the existing `Contents` H2 + divider + message runs.

Resulting top-of-doc order:
```text
H2 "Page properties"
---
• Original conversation: …
• Original participants: …
• Creation date: …
• Created by: …
(empty paragraph)
H2 "Contents"
---
<messages…>
```

## 3. Preserve message formatting and inline mentions

Today `htmlToParagraphs` strips every tag, so bold/italic/underline/strike/code and inline mentions (member / page / conversation) are lost when messages get pasted into the page. Quotes (`msg-quote` divs) already survive because `splitQuotes` handles them, but their inner text is also flattened.

Rewrite the plain-text path so message HTML converts to real ProseMirror inline content:

- Add a small hand-rolled HTML tokenizer (open tag / close tag / text) in `conversations.functions.ts` — no new dependency, matches the existing "no-DOM on the server" style already used by `splitQuotes`.
- Map block boundaries `<p>`, `<div>`, `<br>`, `<h1..6>`, `<li>` to paragraph splits (as today).
- Map inline tags to ProseMirror marks:
  - `<strong>`/`<b>` → `bold`
  - `<em>`/`<i>` → `italic`
  - `<u>` → `underline`
  - `<s>`/`<strike>`/`<del>` → `strike`
  - `<code>` → `code`
  - `<a href="…">` → `link` with the href
- Map mention spans to inline nodes using the classes emitted by `custom-mentions.ts` (`mention-member` → `mention`, `mention-page` → `pageMention`, `mention-conversation` → `conversationMention`), reading `data-id` and `data-label`.
- Unknown/unsupported tags: ignore the tag, keep the inner text.
- Entities decoded via the existing `decodeEntities` helper.

Replace `htmlToParagraphs` with a `htmlToInlineParagraphs(html)` returning `paragraph`-shaped nodes with `content: inline[]`. Update `htmlToBlocks` to use it for `kind: "text"` chunks; the quote branch keeps recursing so nested formatting inside quotes is preserved too.

Empty paragraphs are still emitted as `{ type: "paragraph" }` (no empty text nodes — ProseMirror rejects those).

## 4. Wrap long page titles (applies to every page)

In `src/components/page/page-window.tsx` (lines ~745-751), replace the single-line `<input>` with a `<textarea>` that auto-grows so titles always fit within the page width without horizontal scrolling:
- `rows={1}`, `resize-none`, `overflow-hidden`
- On each `onChange` / on mount, set `el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'`
- Prevent Enter from inserting a newline (`onKeyDown` — blur instead), keeping title semantics one-line-conceptually but visually wrapped
- Keep existing classes (`text-4xl font-bold`, `mb-6 w-full bg-transparent outline-none placeholder:text-muted-foreground`) plus `whitespace-pre-wrap break-words leading-tight`

Handlers (`handleTitleChange`, `handleTitleBlur`, value binding) stay the same.

## 5. Bump app version to 0.1.23

Per the corrected patch rule (increment by 1), update `src/lib/version.ts`:
- `APP_VERSION = "0.1.23"`

That satisfies the extra check: after rebuild both the on-screen `VersionBadge` and the console banner from `log-version.ts` will read `0.1.23`. The `Last commit` row still self-hides because `LAST_COMMIT` is `""` (no build-time SHA wired yet).

## Out of scope
- Wiring a real git SHA into the build.
- Any change to how message HTML is *stored* (still raw HTML in `messages.raw_text`).
- Any DB schema changes.
