# Workspace & Navigation Panel visual pass

Presentation-only changes. No data, routing or backend work.

## Workspace Panel (WP)

- Width when open becomes exactly the Navigation Panel rail width: 56px (`w-14`), matching the rail in both folded and unfolded states.
- Background changes to a slightly darker grey than the app background (a muted surface token, not near-black).
- Gains a subtle elevation/shadow so it visually sits above the Navigation Panel.

## Navigation Panel (NP)

### Rail

- One single rail width in both folded and unfolded states: 56px. The folded panel is pinned to that width, which is the smallest size where the two header toggles (Workspaces show/hide + NP fold/unfold) still fit side by side with a small gap between them.
- NP (rail + body) gets a light grey background, lighter than the WP, plus a subtle elevation over the central content area.

### Lists

- Remove the leading page icon from each page row in the Pages list (visibility icon on the right stays).
- Folder/section headers: bolder label, +2px font size, more vertical spacing between sections, and a thin dimmed divider under each section label — for both Conversations and Pages.

### Icon alignment (folders = visibility)

Each page folder shares the icon of the visibility it represents, applied everywhere visibility is shown:

| Visibility / folder | New icon |
|---|---|
| Private library / Private | `FileLock` |
| From conversations / Conversation | `MessageSquareLock` |
| Public pages / Workspace | `Building2` |

Files touched for this: navigation panel, page window header, page settings dialog, new page dialog, duplicate page dialog, and the workspace route's page list icons.

### Misc

- "New page" in the create dropdown uses `FilePlusCorner` instead of the current file icon.

## Technical notes

- Files: `src/components/navigation-panel.tsx`, `src/routes/_authenticated.w.$workspaceId.tsx`, `src/components/page/page-window.tsx`, `page-settings-dialog.tsx`, `new-page-dialog.tsx`, `duplicate-page-dialog.tsx`.
- All new greys/elevation come from existing semantic tokens (`muted`, `card`, shadow utilities) — no hardcoded colours.
- Version bump to 0.1.447.
