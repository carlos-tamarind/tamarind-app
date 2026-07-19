## Update Page Settings Dialog

Refresh `src/components/page/page-settings-dialog.tsx` and its call site in `src/components/page/page-window.tsx` to align the details modal with the new VDM.

### Changes in `page-settings-dialog.tsx`

1. **Replace the visibility `<Select>`** in the "Who can see this page?" section with a read-only label styled like the Page ID box:
   - Classes: `rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground` plus a flex row for icon + text.
   - Content by current visibility:
     - `private` → `<Lock />` "Only you can access this page."
     - `conversation` → `<MessageSquare />` "You and all collaborators can access this page."
     - `workspace` → `<Globe />` "All members from this workspace can access this page."
     - `external` → keep a sensible fallback (reuse workspace copy).
   - Keep the "Who can see this page?" heading.
   - Remove the "Visibility on Workspace/Conversation pages cannot be changed…" helper text entirely.

2. **Hide the Collaborators section** when `visibility === "private" || visibility === "workspace"`. Only render it for `conversation` (and `external` if applicable).

3. **Add a footer with three secondary CTAs**, horizontally aligned (single row, evenly spaced, e.g. `flex gap-2` with each button `flex-1`):
   - Left **Publish**: only rendered when `visibility === "private"`. Calls a new `onPublish` prop.
   - Middle **Share**: rendered when `visibility !== "workspace"`. Calls a new `onShare` prop.
   - Right **Duplicate**: always rendered. Calls a new `onDuplicate` prop.
   - All use `<Button variant="secondary">`.
   - Each handler should close the settings dialog before opening the target dialog (handled in `page-window.tsx`).

4. **Drop now-unused props/imports**: remove `onVisibilityChange` prop, `Select*` imports, and the `Input`-based visibility select. Keep `Lock`, `Globe`, `MessageSquare` for the label icons.

### Changes in `page-window.tsx`

- Update the `<PageSettingsDialog>` usage:
  - Remove `onVisibilityChange`.
  - Add `onPublish={() => { setSettingsOpen(false); setPublishOpen(true); }}`.
  - Add `onShare={() => { setSettingsOpen(false); setShareOpen(true); }}`.
  - Add `onDuplicate={() => { setSettingsOpen(false); setDuplicateOpen(true); }}`.
- Leave the VDM (header) and all existing publish/share/duplicate flows untouched — the modal simply reuses the same handlers.

### Versioning

- Bump app version patch by 0.01 in `src/lib/version.ts` (0.1.30 → 0.1.31).

### Out of scope

- No server, RLS, or visibility-transition logic changes.
- No changes to VDM behavior or to the Publish/Share/Duplicate dialogs themselves.
