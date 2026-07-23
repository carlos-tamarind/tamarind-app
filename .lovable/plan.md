# Modal overflow fix (Conversation & Page details)

Long names currently push boxes past the dialog's right edge. Fix by allowing text to wrap/break inside each box and constraining flex/grid children so they can actually shrink.

## Changes

### `src/components/conversation/conversation-settings-dialog.tsx`
- **Created by** box: allow wrapping — add `break-words` (and remove any implicit `whitespace-nowrap`) on the inner text div.
- **Participants** list items: add `break-words` so long display names wrap; keep the `(you)` suffix inline.
- **Pages** list: the page button currently uses `truncate` (single-line ellipsis). Replace with wrapping: drop `truncate`, add `whitespace-normal break-words text-left`. Keep `block w-full`.
- Ensure the outer `<li>` / button chain has `min-w-0` where needed so wrapping actually kicks in inside the bordered box.

### `src/components/page/page-settings-dialog.tsx`
- **Page ID** box: it's a mono string with no spaces — switch from default to `break-all` so a long ID wraps instead of overflowing.
- **Owner** value: add `break-words`.
- **Visibility** label box: the row uses `flex items-center gap-2`; add `min-w-0` on the row and let the text span wrap (`break-words`), keep the icon `shrink-0`.
- **Collaborators** list items: add `break-words` for long display names.

### `src/lib/version.ts`
- Bump `APP_VERSION` from `0.1.34` → `0.1.35`.

## Out of scope
- No changes to server functions, data fetching, or dialog widths.
- No changes to the message contextual menu or other unrelated UI.

## Technical notes
- Tailwind utilities used: `break-words` (overflow-wrap: anywhere-ish for normal text), `break-all` (for the opaque page ID), `whitespace-normal` (to undo `truncate`'s `whitespace-nowrap`), `min-w-0` (so flex children can shrink below content size), `shrink-0` (to keep icons at intrinsic size).
- Dialog max width (`max-w-md`) is left unchanged; the fix is purely about children respecting that bound.
