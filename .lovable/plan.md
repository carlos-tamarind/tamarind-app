## Message selection in conversations

Presentation-only change in `src/components/conversation/conversation-window.tsx`. No schema, server, or API changes.

### 1. Selection state

Local component state:
- `selectedIds: Set<string>` of selected message IDs.
- `toggleSelected(id)` — add if absent, remove if present.
- `clearSelection()` — reset to empty.

Selection is not persisted and is per-conversation instance.

### 2. Row layout

Each message currently renders as an `<li>` with `items-end`/`items-start`. Restructure so the whole row is a full-width, clickable container with a slot for the check icon:

```
<li> (full width, onClick=toggleSelected, cursor-pointer,
      hover:bg-muted/40, selected: bg-muted/60)
  <div class="flex items-center gap-2 px-3 py-1
              justify-end (isMe) | justify-start (other)">
    [ if !isMe && selected ] <CircleCheckBig>
    <div class="flex flex-col items-end|items-start
                transition-transform
                translate-x-2 (other, selected)
                -translate-x-2 (me, selected)">
       (name, bubble, timestamp — unchanged)
    </div>
    [ if isMe && selected ] <CircleCheckBig>
  </div>
</li>
```

Details:
- Hover: `hover:bg-muted/40`. Selected: `bg-muted/60` (no hover swap needed).
- Icon: `CircleCheckBig` from `lucide-react`, `size-4 text-primary shrink-0`.
- Slide: `translate-x-2` / `-translate-x-2` on the bubble column only when selected, with `transition-transform`.
- Row `onClick` calls `toggleSelected(m.id)`. Keep the existing `handleMessageClick` mention-navigation logic and add `e.stopPropagation()` when a `.mention-page` is clicked so the row toggle does not fire.

### 3. Auto-deselect triggers

Call `clearSelection()` in:
- `handleSend`, after a successful send (inside `try`, after `clearContent()`).
- On unmount and on `conversationId` change — reuse the existing `useEffect([conversationId])` that resets `liveMessages`, and add a cleanup return for unmount. This covers "closing or hiding the conversation".
- After a page is actually created from this conversation. `NewPageDialog` already accepts an `onCreated` callback. Wire `<NewPageDialog ... onCreated={(pageId) => { clearSelection(); navigate({ to: "/w/$workspaceId", params: { workspaceId }, search: (prev: any) => ({ ...prev, p: pageId }) }); }} />`. Opening/closing the modal without submitting does NOT clear selection.

### 4. Day separators

Day separator `<li>`s remain non-interactive: no hover/selected styling, no click handler. Only message rows are selectable.

### Technical notes

- Add `CircleCheckBig` to the `lucide-react` import block.
- Keep `<ul className="space-y-3">` unchanged.
- The existing fragment wrapper around separator + row remains; keys stay on inner `<li>`s.
