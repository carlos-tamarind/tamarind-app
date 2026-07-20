## Implement MCM "Copy to clipboard"

In `src/components/conversation/conversation-window.tsx`:

1. Add `handleCopySelection` handler:
   - Build sorted selected messages (same ordering pattern as `handleQuoteSelection`).
   - For each message, derive plain text from `m.rawText` by parsing HTML into a temporary element and reading `innerText` (falls back to `textContent`).
   - Join messages with a blank line (`\n\n`).
   - `await navigator.clipboard.writeText(text)`.
   - Show sonner toast: `toast("Messages copied successfully.")` (import `toast` from `sonner`).
   - Call `clearSelection()` (existing effect folds the MCM automatically).

2. Wire the expanded-menu "Copy {plural} to clipboard" button's `onClick` from `noop` to `handleCopySelection`.

3. Bump `src/lib/version.ts`: 0.1.31 → 0.1.32.

### Out of scope
- No other MCM actions, no UI restructuring, no server changes.
