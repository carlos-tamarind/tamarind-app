# Navigation Panel redesign (VS Code style)

Scope: only the Navigation Panel inside `src/routes/_authenticated.w.$workspaceId.tsx` (plus a small new component file for the panel). No other panel, window, or dialog changes.

## Unfolded state

- Remove the Conversations/Pages tab switcher and the workspace name label in the header.
- Header keeps the Workspaces-panel toggle and the fold button.
- New inner rail on the left edge of the panel, same width as the Workspaces rail (`w-14`), spanning only the body — it does not cover the panel header or the bottom account row.
- Rail buttons, top-aligned, icons at 22px:
  1. Conversations — `MessageSquareMore`, shows conversations, tooltip "Conversations"
  2. Pages — `FileText`, shows pages, tooltip "Pages"
  3. Knowledge — `LibraryBig`, no-op, tooltip "Knowledge base"
  4. Create / Open — `SquarePen`, opens the same "Create new" dropdown (New conversation / New page), tooltip "Create new"
- All rail tooltips use a 2s delay (own `TooltipProvider delayDuration={2000}` wrapper around the rail).
- Selected section marked by a black vertical bar on the left edge of the rail, the height of the button. Only rendered when unfolded.
- Default selection: Conversations.
- Clicking the already-selected rail button folds the panel.
- Create button, right-aligned above the list:
  - Conversations selected: `MessageSquarePlus` + "Cmd+N" (label switches to "Ctrl+N" on non-Mac)
  - Pages selected: `FilePlus2` + "Cmd+Shift+N" / "Ctrl+Shift+N"
  - Same click handlers as today.
- Bottom section (account + logout) unchanged.

## Folded state

- Header row shows the Workspaces toggle (left) and the unfold button (right).
- Middle area is no longer a big clickable unfold target; it holds the same rail buttons in the same order, plus:
  - 3. Search — `Search`, inserted between Pages and Knowledge, no-op, tooltip "Search"
- Clicking any rail button except Search and Create new also unfolds the panel and selects that section.
- "Create new" removed from the bottom section; the divider moves down so the bottom row contains only the account button.

## Global shortcuts

A `keydown` listener on `window`, active only inside the workspace shell (so logged-out routes are unaffected):

- `Cmd/Ctrl+N` → open New conversation dialog
- `Cmd/Ctrl+Shift+N` → open New page dialog

Both are ignored when any modal is open (guarded by the existing dialog state flags plus a check for `[data-state="open"][role="dialog"]`), and `preventDefault()` is called so the browser's own new-window shortcut does not fire.

## Section lists

Both lists become collapsible sections (shadcn `Collapsible`), each with an inline-size icon + uppercase label, all expanded by default, open/closed state kept in component state.

Conversations:
- `Bookmark` — PINNED CONVERSATIONS — empty for now (feature not implemented)
- `MessageSquareDot` — UNREAD MESSAGES (0) — empty for now; the count renders 0 until unread tracking exists
- `MessageSquare` — PRIVATE CONVERSATIONS — `type === "direct"`
- `MessagesSquare` — GROUP CONVERSATIONS — `type === "group"`

Pages:
- `Bookmark` — PINNED PAGES — empty for now
- `FolderLock` — PRIVATE LIBRARY — `visibility === "private"`
- `Folders` — FROM CONVERSATIONS — `visibility === "conversation"`
- `FolderTree` — PUBLIC PAGES — `visibility === "workspace"`
- `Archive` — ARCHIVED — empty for now

Not-yet-implemented sections render with an "Empty" hint so the structure is visible without faking data.

## Technical notes

- The panel markup moves out of the route file into `src/components/navigation-panel.tsx` to keep the route readable; behaviour and props (workspaceId, folded, panel ref, dialog setters, profile) stay the same.
- `listMyPages` already returns `visibility`, and `listMyConversations` returns `type`, so no backend or data-layer change is needed.
- Lucide has no `file-plus-corner` icon; `FilePlus2` (file with a corner plus) is the closest match and will be used.
- Version bumped to 0.1.44.
