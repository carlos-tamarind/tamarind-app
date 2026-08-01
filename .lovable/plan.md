# Search bar + Search Overlay Popup (SOP)

Scope: Navigation Panel search entry point plus a new search modal. No retrieval/API work — search itself is a no-op for now.

## Navigation Panel — unfolded

- In the panel header, to the right of the existing panel toggles (where the workspace name used to be), add a search "button" styled like a text input:
  - Full remaining width of the header (responsive), same rounded corners as other buttons, muted border/background.
  - Content left-to-right: Lucide `Search` icon + dimmed, light-weight "Search…" text.
  - Click opens the SOP. It never accepts typing directly.

## Navigation Panel — folded

- The existing `Search` rail button (already present) becomes functional: it opens the SOP and does NOT unfold the panel.

## Search Overlay Popup

New component `src/components/search/search-overlay.tsx`, built on the existing shadcn `Dialog` so Esc / click-outside / backdrop blur behave like every other modal.

- Centered, larger than other dialogs: ~55% viewport width (max ~900px) and ~35% viewport height minimum, no header text.
- Standard "X" close button in the top-right.
- Top ~1/5 of the modal is an oversized text input:
  - Placeholder "Search anything…", autofocus on open.
  - Right-aligned inside the input: `SlidersHorizontal` button, thin stroke, tooltip (2s delay) "Filter your search"; toggles the filter row.
  - Typing does nothing yet (state only).
- Below the input: filter row (visible by default), then a large empty results area reserved for future results. No dividers, no footer buttons.

## Filters

Mutually exclusive toggle chips in one horizontal row, "All" is default and the fallback when the active one is de-selected:

| Value | Icon | Label |
|---|---|---|
| all | none | All |
| conversation | `MessageSquareMore` | Conversations & messages |
| page | `FileText` | Pages |
| user | `User` | Users & conversations |

Selection is local state only; no query behaviour yet.

## Technical notes

- New files: `src/components/search/search-overlay.tsx` (modal + filters).
- Edited: `src/components/navigation-panel.tsx` — add header search button, wire the folded rail Search button, own the `searchOpen` state and render the overlay.
- No route, backend, or data-layer changes.
- Version bump to 0.1.443.
