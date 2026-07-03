## Fix WKS/NVT panel state coupling

### Root cause

The Workspaces rail is conditionally mounted (`{railOpen && <ResizablePanel …/>}` at line 184). Mounting/unmounting a `ResizablePanel` inside a `ResizablePanelGroup` forces react-resizable-panels to recompute the layout across all remaining panels. That recomputation changes the Navigation panel's percentage — sometimes pushing it under the 17% threshold (auto-fold) or above it (auto-unfold). The `onResize` handler on the nav panel then flips `folded`, which looks like "clicking WKS also toggles NVT".

The behavior is non-deterministic because the group tries to preserve prior stored sizes, so the outcome depends on the sequence of previous resizes.

### Fix

Keep the rail panel **always mounted** and toggle it with the imperative `collapse()`/`expand()` API — same pattern already used for the nav panel. This leaves the nav panel's size untouched when WKS toggles, so `folded` never flips as a side effect.

### Changes in `src/routes/_authenticated.w.$workspaceId.tsx`

1. Add a ref for the rail panel:
   ```tsx
   const railPanelRef = useRef<PanelImperativeHandle>(null);
   ```

2. Remove the `{railOpen && (...)}` conditional wrapper (lines 184 and 238). Render the rail `ResizablePanel` unconditionally with:
   - `panelRef={railPanelRef}`
   - `defaultSize="0%"` (starts closed, matching current `useState(false)`)
   - `collapsible`, `collapsedSize="0%"`, `minSize="5%"`, `maxSize="5%"`
   - `onResize={(size) => setRailOpen(size.asPercentage > 0)}` so `railOpen` stays in sync (drives tooltip labels and the corresponding `ResizableHandle` visibility if any).

3. Replace both WKS button `onClick` handlers (lines 263 and 342):
   ```tsx
   onClick={() => {
     const p = railPanelRef.current;
     if (!p) return;
     if (p.isCollapsed()) p.expand(); else p.collapse();
   }}
   ```
   Do NOT touch `navPanelRef` or `folded` here.

4. Add a `ResizableHandle` between the rail and the nav panel. To avoid a visible handle when the rail is collapsed, render it conditionally on `railOpen` (safe because it's just a divider element, not a `ResizablePanel`, so its mount/unmount does not trigger layout redistribution).

5. Confirm the nav panel's `onResize` remains as-is — with the rail no longer mounting/unmounting, it will only fire on genuine user drags or explicit `navPanelRef.collapse()`/`expand()` calls.

### QA checklist to run after the edit

Load `/w/:workspaceId` and verify each transition leaves the *other* panel unchanged:

| Start (WKS, NVT) | Click        | Expected end state          |
| ---------------- | ------------ | --------------------------- |
| closed, expanded | WKS          | open, expanded              |
| closed, folded   | WKS          | open, folded                |
| open, expanded   | WKS          | closed, expanded            |
| open, folded     | WKS          | closed, folded              |
| closed, expanded | NVT (close)  | closed, folded              |
| open, expanded   | NVT (close)  | open, folded                |
| closed, folded   | NVT (open)   | closed, expanded            |
| open, folded     | NVT (open)   | open, expanded              |

Also verify:
- Repeating WKS toggle 5× in a row with NVT folded keeps NVT folded every time.
- Repeating WKS toggle 5× in a row with NVT expanded keeps NVT expanded every time.
- Manually dragging the nav-panel handle below 17% still folds it (existing threshold behavior intact).
- Manually dragging back above 17% unfolds it.
- Tooltip labels on the WKS button reflect the current `railOpen` state after each click.

Run the QA with Playwright by driving the two buttons and screenshotting each end state.
