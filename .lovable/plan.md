## Plan: Navigation panel resize + folded state

Edit only `src/routes/_authenticated.w.$workspaceId.tsx`. No backend or other UI changes.

### 1. Resizable nav with collapse-to-folded

Replace the current fixed-size nav with a resizable + collapsible panel:

- `<ResizablePanel id="nav" defaultSize="22%" minSize="18%" maxSize="33%" collapsible collapsedSize="5%" onCollapse={() => setFolded(true)} onExpand={() => setFolded(false)}>`
- Drive `folded` state from a React `useState`, wired through `onCollapse`/`onExpand`. Drag below 18% → collapsed (folded, 5%). Drag right from folded → auto-expand.
- Main panel becomes `defaultSize` of remaining space with `minSize="40%"`.
- The grip handle: render `<ResizableHandle withHandle />` only when `!folded`; render plain `<ResizableHandle />` (no grip icon) when folded. The existing `withHandle` already shows `GripVertical` in the center — no change needed in `resizable.tsx`.

### 2. Expanded nav changes

- Change the "Open workspaces panel" button icon from `PanelLeftOpen` to `Menu` (Lucide).

### 3. Folded nav UI (when `folded === true`)

Replace the existing `<aside>` content with a vertical 5%-wide icon column. The whole middle section is a clickable button that calls `panelRef.expand()` (using a `useRef<ImperativePanelHandle>` on the nav panel).

Top → bottom:

1. **Top** — Workspaces panel toggle button. Same handler as expanded (`setRailOpen(true/false)`). Icon: `Menu`. Tooltip "Open workspaces panel".
2. **Middle (flex-1, clickable)** — Centered `PanelLeftOpen` icon. Clicking the area calls `panelRef.current?.expand()`. Tooltip "Expand navigation".
3. **Bottom-up** — `CirclePlus` button inside a `DropdownMenu` with two items:
   - "New conversation" → `setConvDialogOpen(true)`
   - "New page" → `handleNewPage()`
4. **Bottom-down** — Profile avatar button: same `setProfileOpen(true)` handler, just the `Avatar` with no name/email/logout shown. (Logout stays accessible via profile dialog / expanded view.)

All folded items use `Tooltip` on the right side; no text labels.

### 4. Workspaces rail interplay

Rail behavior unchanged — opening the rail works regardless of folded state. When folded + rail open, layout is rail (10%) + nav (5%) + main (85%).

### Technical notes

- `react-resizable-panels` v4: use `collapsible`, `collapsedSize="5%"`, `minSize="18%"`, `maxSize="33%"`, and `onCollapse`/`onExpand` callbacks. Get an imperative handle via `useRef` + `ref` prop on `ResizablePanel` to call `.expand()` from the folded middle-click.
- New Lucide imports: `Menu`, `CirclePlus`. Remove `PanelLeftOpen` usage from header (still used in folded middle).
- Use existing `DropdownMenu` from `@/components/ui/dropdown-menu` for the CirclePlus menu.
- Remove the existing `key={shell-rail}` remount trick on the outer group — no longer needed since the nav panel is the same instance across folded/expanded.
