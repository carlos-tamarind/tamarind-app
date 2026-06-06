## Bugs

**a) Send button never enables.** The composer's `isEmpty` check reads `editor.isEmpty` directly during render. In current `@tiptap/react`, `useEditor` does not re-render the host component on transactions — so `isEmpty` stays `true` (its mount value), and the Send button stays `disabled`. Pressing Enter works because `handleSend` runs from the editor's own keydown handler, which bypasses the disabled check.

**b) Sent messages render as plain text.** The composer sends `editor.getText().trim()`, which strips bold/italic/code marks. The server stores plain text into `messages.raw_text`, and the bubble renders it as a string. So formatting is lost end-to-end on send, not on display.

## Fix

File: `src/components/conversation/conversation-window.tsx`

### a) Reactive empty-state

Track empty state via the editor's `onUpdate` callback into local React state:

```ts
const [isEmpty, setIsEmpty] = useState(true);

const editor = useEditor({
  ...,
  onUpdate: ({ editor }) => setIsEmpty(editor.isEmpty),
  onCreate:  ({ editor }) => setIsEmpty(editor.isEmpty),
});
```

Drop the derived `const isEmpty = !editor || editor.isEmpty` line. The Send button's `disabled={isEmpty || sending}` then reflects every keystroke. Also reset `setIsEmpty(true)` right after `editor.commands.clearContent()` in `handleSend` so the button disables again after a successful send.

### b) Send HTML, render formatted

1. In `handleSend`, send the HTML payload instead of plain text:
   ```ts
   const html = editor.getHTML();
   const plain = editor.getText().trim();
   if (!plain) return;            // still gate on visible text
   await sendMsg({ data: { conversationId, rawText: html } });
   ```
   No server change needed — `raw_text` is plain `text` and accepts the HTML string. The schema allows up to 10k chars, and the StarterKit-only marks (bold/italic/code, plus paragraph/hard-break) keep the markup small.

2. Render messages with the formatting preserved. Replace `{m.rawText}` with a sanitized HTML render. The composer is locked to a tiny mark set (bold, italic, code, paragraph, hard-break) so we can sanitize inline without adding a dependency:

   ```ts
   const ALLOWED_TAGS = new Set(["P", "STRONG", "B", "EM", "I", "CODE", "BR"]);

   function sanitizeMessageHtml(html: string): string {
     if (typeof window === "undefined") return ""; // SSR guard
     const tpl = document.createElement("template");
     tpl.innerHTML = html;
     const walk = (node: Node) => {
       for (const child of Array.from(node.childNodes)) {
         if (child.nodeType === Node.ELEMENT_NODE) {
           const el = child as Element;
           if (!ALLOWED_TAGS.has(el.tagName)) {
             // Replace disallowed element with its text content
             el.replaceWith(document.createTextNode(el.textContent ?? ""));
             continue;
           }
           // Strip every attribute (href, onclick, style, etc.)
           for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
           walk(el);
         }
       }
     };
     walk(tpl.content);
     return tpl.innerHTML;
   }
   ```

   Memoize per message and render with `dangerouslySetInnerHTML`:

   ```tsx
   <div className="... prose prose-sm max-w-none ..."
        dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(m.rawText) }} />
   ```

   Add `prose-invert` styling-wise it's not needed; the existing bubble classes plus `prose-sm` will style `<strong>`, `<em>`, `<code>` correctly. For the "me" bubble (primary background), add `prose-invert` so inline `<code>` reads correctly against the dark background.

### Backward compatibility

Existing messages stored as plain text without tags pass through the sanitizer unchanged (no elements to strip) and render correctly as a single text node. No migration needed.

## Out of scope

- Adding a dedicated `html_text` column or a separate `messages.format` field.
- Markdown shortcuts (e.g. `**bold**`) in the composer.
- Mentions / links inside messages.
- Server-side sanitization (client sanitizes on render; the row remains as authored).

## Files touched

- Edit `src/components/conversation/conversation-window.tsx`.
