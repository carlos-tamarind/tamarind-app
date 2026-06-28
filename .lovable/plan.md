## Goal
Make the Workspaces rail and Navigation panel toggle independently, simplify their headers, and slim the rail to 5%.

## Changes to `src/routes/_authenticated.w.$workspaceId.tsx`

### 1. Independent panel state (no cross-collapsing)
- Remove the `key={shell-${railOpen ? "rail" : "norail"}}` on the outer `ResizablePanelGroup`. Re-keying remounts the group and resets the Navigation panel's width every time the rail opens/closes, which is why toggling the rail also affects the nav. With the key gone, the navigation panel keeps its current size whether folded or expanded, and the rail mounts/unmounts beside it.
- The folded/unfolded state of the navigation is driven only by its own `onResize` threshold — opening or closing the rail never calls `setFolded`, so the navigation stays in whatever state the user left it in.

### 2. Workspaces rail (when `railOpen`)
- Width: change `defaultSize`/`minSize`/`maxSize` from `"10%"` to `"5%"`.
- Remove the top close button (`PanelLeftClose` + tooltip). Keep the bordered top strip empty so the divider/spacing matches the navigation header height.
- Leave the workspace list + Settings footer unchanged.

### 3. Navigation panel header — expanded state
Currently shows: `Menu` (toggle rail) + workspace name.
- Keep the `Menu` button. Update its tooltip text to:
  - `railOpen` → "Close Workspaces panel"
  - else → "Open Workspaces panel"
- Add a second button immediately to the right of `Menu`, using the `PanelLeftClose` Lucide icon, that calls `navPanelRef.current?.collapse()` to fold the navigation. Tooltip: "Close Navigation panel".
- Workspace name stays right-aligned via `ml-auto`.

### 4. Navigation panel — folded state
- Keep the existing top `Menu` button (workspace toggle); apply the same updated tooltip strings as in step 3 ("Open/Close Workspaces panel").
- Change the middle expand button's `aria-label` and tooltip from "Expand navigation" to "Open Navigation panel".
- Bottom CirclePlus + profile avatar unchanged.

### 5. Imports
- No new icons needed; `Menu`, `PanelLeftClose`, `PanelLeftOpen`, `CirclePlus` are already imported.

## Result
- Clicking the workspace toggle only shows/hides the 5% rail; the navigation keeps its current width and folded/unfolded state.
- Folding/unfolding the navigation never touches the rail.
- Workspace toggle is always present at the top of the navigation (both states) with the requested tooltips.
- A dedicated fold button (`PanelLeftClose`) appears in the expanded navigation header.
- The folded-state expand button uses the new "Open Navigation panel" tooltip.
