## Goal

In a conversation, pressing Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) in the new-message editor sends the message immediately — even in the cases where plain Enter stops sending (e.g. right after inserting a page/user mention).

## Change

In `src/components/conversation/conversation-window.tsx`, the composer's `handleKeyDown` currently only handles plain `Enter` (and bails out when a mention dropdown is open via `mentionOpenRef`).

Add a modifier branch that runs **before** the existing checks:

- If `event.key === "Enter"` and (`event.metaKey` or `event.ctrlKey`): prevent default and call `handleSend()`, returning `true`.
- This branch ignores `mentionOpenRef` and the shift check, so it always sends regardless of mention-suggestion state — which is exactly the stuck case described.
- Existing plain-Enter behaviour and Shift+Enter newline stay unchanged.

`handleSend` already guards on empty content and in-flight sends, so no extra safety is needed.

## Notes

- Presentation/interaction only; no server or data changes.
- App version bumped one patch step per project convention.
- Verified in the preview by typing a message and sending with Cmd/Ctrl+Enter.
