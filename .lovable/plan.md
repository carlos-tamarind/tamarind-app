## Goal

Dividers become plain straight lines, and all panel header bars (plus the workspaces/navigation footer bar) line up at the same height.

## 1. Remove the grip icons from panel dividers

Three resizable dividers currently render a centered grip pill:

- Workspaces rail | Navigation → main split (`src/routes/_authenticated.w.$workspaceId.tsx`, the `<ResizableHandle withHandle={!folded} />`)
- Conversation | Pages split (same file, the split-view `<ResizableHandle withHandle />`)
- Conversation history | new message box (`src/components/conversation/conversation-window.tsx`, `<ResizableHandle withHandle />`)

Fix: drop the `withHandle` prop from all three so only the 1px line renders. Drag behaviour and the invisible wider hit area stay untouched.

## 2. Level the panel header dividers

Today each header sizes itself from its padding, so the bottom borders sit at different heights:

```text
workspaces rail   h-10           -> 40px
navigation        px-3 py-2      -> ~40px
conversation      px-4 py-3      -> ~56px
pages             px-3 py-1.5    -> ~36px
```

Fix: give every header a single shared height — `h-14` (56px), matching the tallest (conversation) so nothing gets cramped, as suggested. Concretely, replace vertical padding with `h-14 shrink-0 items-center` on:

- rail header spacer (`h-10 border-b`)
- navigation header, both folded and expanded variants
- conversation header (no-selection state)
- pages header

Horizontal padding stays as-is per panel.

## 3. Level the footer divider

The workspaces rail footer (`border-t py-2`) and the navigation footer (`border-t px-2 py-2`) also differ. Both get the same fixed height (`h-14 shrink-0`) so the top border of each footer sits on one continuous line.

## Notes

- Only presentation classes change; no logic, data, or layout structure changes.
- App version bumped one patch step per project convention.
- Result verified in the preview with a screenshot at the current viewport.
