## Fixes

### 1. Conversation composer — resizable + bigger by default
In `src/components/conversation/conversation-window.tsx`:
- The inner `ResizablePanelGroup` is currently set with `orientation="vertical"`, but the shadcn `Resizable` wrapper (react-resizable-panels) expects the `direction` prop. With the wrong prop, the panel group falls back to horizontal and the composer ends up at a fixed sliver. Switch to `direction="vertical"`.
- Update the composer panel sizes to: `defaultSize={20}`, `minSize={15}`, `maxSize={35}`. Match the messages panel to `defaultSize={80}`, `minSize={65}`.
- Verify the parent container chain (`flex-1 min-h-0`) actually gives the group a measured height so the percentages are meaningful.

### 2. "Open workspaces panel" button does nothing
In `src/routes/_authenticated.w.$workspaceId.tsx`:
- The outer `ResizablePanelGroup` uses `key={shell-${railOpen ? "rail" : "norail"}}` to force a remount when the rail toggles, but the `onLayoutChanged` handler reads `layout.rail` and, during the first measurement after the remount, can briefly see `rail < 1`, which calls `setRailOpen(false)` and immediately closes the panel that was just opened.
- Fix by guarding `onLayoutChanged`: ignore the callback while the rail is animating in (e.g. only auto-collapse when the user actually drags below the threshold, not on mount). Concretely, skip the auto-collapse for one frame after toggling, or change the logic to "collapse only if rail was previously ≥ minSize and the user dragged below threshold" by tracking the previous size in a ref.
- Also pass `direction="horizontal"` to the outer group (same prop fix as #1) so resizing reports correct values.

### 3. Mention icons invisible (white on white)
The SVG icons inherit `currentColor`, but the `.mention-*` chip styling only exists inside `.ProseMirror`. In sent message bubbles (rendered as plain `prose` HTML, not ProseMirror) there is no chip background and the icon color depends on the bubble's text color — on the light bubble it can blend in, and the chip itself has no background, so it reads as plain text without an icon.

In `src/styles.css`:
- Add a global rule (not scoped to `.ProseMirror`) for `.mention-member`, `.mention-page`, `.mention-conversation` giving them the same inline-flex chip styling, an explicit dark text color (`color: #000`), and the muted background. Keep the existing `.ProseMirror`-scoped rules or let them inherit from the new global rule.
- Force `.mention-icon { color: #000; stroke: currentColor; }` so the SVG always renders black regardless of surrounding text color (covers both light and dark message bubbles for now, per the user's "leave them black" instruction).

No server / data changes; this is purely UI/CSS.