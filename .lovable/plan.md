## Revamp the Visibility Dropdown Menu (VDM)

Scope: only the page-header dropdown in `src/components/page/page-window.tsx`. No backend, schema, or business-logic changes. Bump patch version.

### 1. Replace VDM contents

In `src/components/page/page-window.tsx`, replace the current three visibility items (Private / Workspace / Conversation) in the `DropdownMenuContent` (around lines 706–728) with up to three new items: **Publish**, **Share**, **Duplicate**.

Visibility rules for each item (only render when condition is true — hidden items are not shown at all, not disabled):

- **Publish** — visible only when `visibility === "private"`. (Owner-only enforcement stays on the server via `setPageVisibility`; per spec the item itself is visible whenever the page is private.)
- **Share** — always visible. No-op `onSelect` for now.
- **Duplicate** — always visible. No-op `onSelect` for now.

Each item shows an icon + label; add a `title` tooltip on Publish with the hint "Makes the page public for the whole workspace".

Icons:
- Publish → `Globe` (lucide, already imported)
- Share → `Share2` (lucide)
- Duplicate → `Copy` (lucide)

### 2. Publish behavior

Wire the Publish item's `onSelect` to `setPublishOpen(true)`, reusing the existing "Publish page" confirmation dialog already present (lines 796–819) and its existing `applyVisibility("workspace")` call. No changes to that dialog.

### 3. Keep the trigger button as-is

The dropdown trigger button (icon reflecting current visibility, positioned left of the page options button) stays unchanged, including `VisibilityIcon`.

### 4. Dead-code cleanup (minimal)

`handleVisibilityChange` is no longer referenced after removing the old items — remove it. Keep `applyVisibility` (still used by the Publish confirmation dialog) and keep `setPageVisibility` import.

The `PageSettingsDialog` visibility selector is out of scope for this prompt (a later prompt will reuse the VDM there); leave it untouched.

### 5. Version bump

Update `src/lib/version.ts` `APP_VERSION` from `"0.1.23"` to `"0.1.24"` per the patch-increment rule.

### Out of scope

- Share and Duplicate implementations (later prompts).
- Reusing the VDM inside the Page details modal (later prompt).
- Collaborator management, ownership transfer, conversation participant removal.
