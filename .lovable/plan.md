## Folded Message Contextual Menu (MCM)

Presentation-only change in `src/components/conversation/conversation-window.tsx`. No schema, server, or new component files required.

### 1. Trigger condition

- Show MCM when `selectedIds.size > 0`.
- Otherwise, render the existing `<header>` unchanged.
- Selection is already per-viewer local state, so only the current user ever sees their own MCM — no extra work needed.

### 2. Header replacement

Replace the current `<header>` block (lines 490–562) with a conditional:

```tsx
{selectedIds.size > 0 ? <McmFolded ... /> : <header>...existing header...</header>}
```

- The existing header stays exactly as-is when no message is selected. When MCM is active, the header is not rendered — its buttons (participants, settings) are therefore not visible and not clickable, satisfying the requirement.
- After `clearSelection()` runs (cancel, send, page created, conversation change, unmount), the header reappears automatically because `selectedIds.size === 0`.

### 3. Folded MCM layout

Inline component (or JSX block) inside the same file. Height ≈ 2× current header (`py-3` → roughly `min-h-[6.5rem]`, matching two stacked rows).

```
┌────────────────────────────────────────────────────────┐
│ ← n selected                                  Cancel   │
│                                                        │
│ New page             Quote                    More …   │
└────────────────────────────────────────────────────────┘
```

Structure:

```tsx
<div className="border-b px-4 py-3 flex flex-col gap-2">
  {/* top row */}
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium">← {selectedIds.size} selected</span>
    <Button size="sm" variant="ghost" onClick={clearSelection}>Cancel</Button>
  </div>
  {/* bottom row: 3 slots — left, center, right */}
  <div className="grid grid-cols-3 items-center">
    <div className="justify-self-start">
      <Button size="sm" variant="ghost" disabled>New page</Button>
    </div>
    <div className="justify-self-center">
      <Button size="sm" variant="ghost" disabled>Quote</Button>
    </div>
    <div className="justify-self-end">
      <Button size="sm" variant="ghost" disabled>More …</Button>
    </div>
  </div>
</div>
```

- All buttons except `Cancel` are `disabled` and have no `onClick`.
- `Cancel` calls the existing `clearSelection()`.
- `← n selected` is a plain `<span>`, not a button.
- No icons required; label text only per spec.

### 4. Behavior notes

- No new state needed; MCM visibility is derived from `selectedIds.size`.
- The `translate-x` / hover / `CircleCheckBig` message-row styling from the previous step is untouched.
- All existing auto-deselect triggers (send, conversation change, unmount, page created) already cause the MCM to disappear because they call `clearSelection()`.
- Expanded state and per-button logic/visibility rules are out of scope for this prompt.

### Technical details

- No new imports required beyond `Button` (already imported).
- Keep the outer flex column layout so `ResizablePanelGroup` below still fills remaining space; the MCM being taller simply reduces chat area, as specified.
