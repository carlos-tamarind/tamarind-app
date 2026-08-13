# Fix missing mention icons inside the editor

## What's wrong

Mention chips (user, page, conversation) render their small icon only in already-sent conversation messages, never while typing and never inside pages.

Sent messages are rendered as raw HTML by the browser, which understands SVG correctly. The editor instead builds the chip's DOM element by element, and the way the icon is currently described makes the editor create a plain, non-drawing element instead of a real SVG. So the chip shows the label but no icon everywhere the editor is used (page body, message composer).

## The fix

In `src/components/editor/custom-mentions.ts`, declare the icon's tags with their SVG namespace so the editor creates real SVG elements:

- Change the spec tag names from `"svg"`, `"circle"`, `"path"`, `"rect"` to the namespaced form `"http://www.w3.org/2000/svg svg"` (and the same prefix for the child tags), which is the form the editor's DOM serializer understands.
- Keep the existing attributes, classes (`mention-icon`, `mention-member` / `mention-page` / `mention-conversation`) and label text unchanged, so styling, copy/paste HTML and click handling are unaffected.

No other files change; sent-message rendering keeps working exactly as today since the serialized HTML is identical.

## Verification

- Type `@user`, `@@page` and `\conversation` in a page and in the message composer: each chip shows its icon immediately.
- Send the message: the icon still shows in the message list.
