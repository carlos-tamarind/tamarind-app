## Goal
Add an "expanded" state to the Message Contextual Menu (MCM) that appears when the user has selected one or more messages in a conversation. In folded state, keep the current two contextual buttons plus Cancel and add a "More …" button. Clicking "More …" expands the MCM into a larger dropdown-style panel that reveals every available option; clicking "Less …" folds it back to its exact original layout.

## Scope
- File: `src/components/conversation/conversation-window.tsx` — the selection bar (currently lines ~490–517) is the only surface changing.
- No changes to message selection, sending, backend, or other panels.
- All new option handlers are visual placeholders (buttons render, hint tooltips work, click does nothing yet). "More …" always renders enabled — the conditional visibility logic is deferred to a later prompt.

## Behavior

Folded state (unchanged visual footprint):
- Top row: `← N selected` on the left, `Cancel` on the right.
- Bottom row (3-column grid, as today):
  - Left: `New page` (existing button, kept as-is)
  - Center: `Quote` (existing button, kept as-is)
  - Right: `More …` button (replaces the currently-disabled `More …` placeholder — always enabled per this prompt)

Expanded state:
- Same top row (`← N selected` + `Cancel` in the same positions).
- Replaces the 3-column folded row with a vertical list of all options styled as a compact dropdown-menu-like panel that "steals" vertical space from the messages area (the message list stays scrollable; the MCM panel simply grows in place above it, inside the existing `border-b` container).
- Options, top-to-bottom, left-aligned with icon + label:
  1. Create new page — hint: "Creates a new page using the selected message as placeholder."
  2. Add to page — hint: "Adds the contents of the selected message to an existing page."
  3. Quote message — hint: "Quotes the selected message inside the new message area."
  4. Copy message to clipboard
  5. Delete message (rendered in destructive tone)
- Bottom-right corner of the panel: `Less …` button.
- Every label containing the word "message" is pluralized to "messages" when `selectedIds.size > 1` (Quote message(s), Copy message(s) to clipboard, Delete message(s)).
- Hints are Tooltip components using the existing `TooltipProvider` on hover of each option (options 1–3 per spec; add none for 4–5 unless spec dictates — spec only lists hints for 1–3, so only those three get tooltips).

State machine:
- `mcmExpanded: boolean` local state, initialized to `false`.
- Reset to `false` whenever `selectedIds` becomes empty (Cancel, message deselection to zero, conversation change).
- `More …` click → `setMcmExpanded(true)`.
- `Less …` click → `setMcmExpanded(false)`; folded layout re-renders with the same two contextual buttons (`New page`, `Quote`) as before — this is guaranteed because the folded JSX is a single static layout, not derived from prior expanded selections.
- `Cancel` behavior identical in both states: `clearSelection()` (already implemented) and implicitly folds (since selection is now empty).

## Design notes
- Reuse `Button` (`variant="ghost"`, `size="sm"`), `Tooltip`, and existing token classes. No new component files.
- Expanded panel: `flex flex-col` list of full-width ghost buttons with left-aligned icon+label, subtle hover (`hover:bg-muted/60`), and a trailing row containing `Less …` right-aligned. Destructive delete uses `text-destructive`.
- Icons from `lucide-react` already available in the bundle: `FilePlus`, `FileText`, `Quote`, `Copy`, `Trash2`, `ChevronDown` (More), `ChevronUp` (Less). Import only the new ones (`FileText`, `Quote`, `Copy`, `Trash2`, `ChevronDown`, `ChevronUp`).
- Keep everything inside the existing `border-b` selection container so the messages list below is untouched and remains resizable/scrollable.

## Technical details
- Add `const [mcmExpanded, setMcmExpanded] = useState(false);` near the other selection state.
- Extend `clearSelection` to also call `setMcmExpanded(false)`, and add an `useEffect` that resets it when `selectedIds.size === 0`.
- Update the `selectedIds.size > 0` branch of the JSX to conditionally render folded vs expanded layouts.
- Pluralization helper inline: `const plural = selectedIds.size > 1 ? "messages" : "message";`.
- All new option `onClick` handlers are no-ops (`() => {}`) for now; buttons stay enabled so the UI is interactive per the spec ("just placeholders").

## QA plan
- Select one message → folded MCM shows `New page`, `Quote`, `More …`, `Cancel`. Labels singular.
- Select multiple → same folded layout; expanded labels use "messages".
- Click `More …` → panel expands with 5 options + `Less …` bottom-right; `Cancel` still top-right.
- Hover options 1–3 → tooltips show the specified hints.
- Click `Less …` → folds back to exact original layout (`New page`, `Quote`, `More …`).
- Click `Cancel` in either state → selection clears and menu disappears.
- Deselect last message manually → menu disappears and next reopen starts folded.
- Switch conversations while expanded → new conversation starts with no selection and folded default.
