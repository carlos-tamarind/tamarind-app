# Merged search results in the search overlay

Scope: strategy timeout, result merging/ranking, and a redesigned results UI in the search overlay. No database or RPC changes.

## Strategy timeout

- Add `MAX_SEARCH_STRATEGY_TIMEOUT_MS = 2000` to `src/search/config.ts`.
- In `SearchOrchestrator`, race each strategy against the timeout. A strategy that exceeds it resolves as an empty list and is logged as timed out; the other strategy still returns normally.

## Merging and ranking

- The search server function returns, alongside the per-strategy lists, a single merged list.
- Every result is tagged with the strategy that produced it (`keyword` | `semantic`).
- Deduplication key: asset type + asset id. When the same asset comes from both strategies, keep the entry with the higher score (and its strategy tag).
- Sort merged results by score descending, capped at the existing request limit.

## Overlay layout

- The dialog is sized to its content: search input, filter chips, dev toggles, plus a small amount of breathing room. No fixed 35vh block.
- When results arrive the dialog grows smoothly (animated height transition) up to a max of roughly 130% of the current default height, after which the results area scrolls. No pagination.
- The existing spinner ("Searching…") is kept as-is.
- The current JSON debug results sections are removed entirely.

## Results

- Header line above the list: "X results".
- Each result is a full-width clickable row, separated by a thin divider — no table, no card borders.
- Row structure:
  - Bold line: asset icon (same icons as the filter chips) + title.
  - Italic line: snippet, shown only when the matched field is content.
  - Dev only, small thin text: strategy label ("Keyword match" / "Semantic match") + " · " + score.
- Clicking a row navigates to the asset and closes the overlay:
  - page → `/w/$workspaceId?p=<pageId>`
  - conversation → `/w/$workspaceId?c=<conversationId>`
  - message → `/w/$workspaceId?c=<conversationId>` (parent conversation)
- Empty state: "No results. Try a different search or remove a filter."
- Error state: "Something went wrong. Try again."

## Dev vs production

- Keyword/Semantic toggles and the per-result strategy/score line render only in development (`import.meta.env.DEV`); in production both toggles are hidden and both strategies stay enabled.

## Persistence fix

- Today the overlay resets query, scope and results when it closes, and the debounce fires a fresh empty search on reopen, wiping the previous view after 1–2s.
- Keep query, scope, and the last merged results in state that survives closing the overlay for the session, and skip the automatic re-search on reopen unless the query or filters change.

## Technical notes

- Edited: `src/search/config.ts`, `src/search/types.ts` (strategy tag + merged list type), `src/search/SearchOrchestrator.ts` (timeout + merge/dedupe), `src/lib/search.functions.ts` (return merged list), `src/hooks/use-search-request.ts` (merged results, error state, reopen behaviour), `src/components/search/search-overlay.tsx` (new layout and result rows).
- Version bump in `src/lib/version.ts` to 0.1.459.
