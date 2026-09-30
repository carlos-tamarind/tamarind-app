# Knowledge Base

The Knowledge Base (KB) turns [canonical topics](../semantic/canonical_topics.md) into a navigable graph. Each node is one workspace-wide topic distilled from conversations and pages; each link means two topics were discussed in the same conversation. Selecting a node lists the evidence behind it in the nav panel, and every piece of evidence deep-links to the message or page it came from.

**Code:** [`src/components/knowledge-base/`](../../src/components/knowledge-base/), [`src/lib/knowledge-base/`](../../src/lib/knowledge-base/), server functions in [`src/lib/canonical-topics.functions.ts`](../../src/lib/canonical-topics.functions.ts).

## Opening it

The **Knowledge base** rail icon (`LibraryBig`), or **Open knowledge base** in the command palette, sets `?kb=true` and **always takes the whole main area**, closing any open conversation or page. The nav panel switches to its Knowledge base section. Clicking the rail icon again once the KB already owns the main area folds the nav panel, like the other sections.

## Layout rules

The KB shares the main area with at most one entity. Conversations always open on the left, pages on the right.

| URL state | Main area |
|-----------|-----------|
| `?kb=true` | KB, full width |
| `?kb=true&c=…` | Conversation (left, 50%) · KB (right, 50%) |
| `?kb=true&p=…` | KB (left, 50%) · Page (right, 50%) |
| `?c=…&p=…` | Conversation · Page — the KB is hidden (`kb` dropped) |

- **Evidence deep links** ([`withKnowledgeEvidence`](../../src/lib/workspace-search.ts)) open their entity next to the KB and clear the opposite slot, so the KB keeps its half.
- **Manual opens** from the Conversations or Pages lists keep the KB at 50% beside one entity. Opening the second entity (conversation *and* page) hides the KB (`withConversation` / `withPage` drop `kb` when both are set).
- **Close-on-drag** works as in any split: dragging the KB pane below ~20% clears `kb`; dragging the entity pane clears that entity. The overlay reads **Close knowledge base**.

| Param | Meaning |
|-------|---------|
| `kb` | `true` when the KB is open |
| `t` | Selected canonical topic id; kept while the KB is hidden so reopening restores the selection |

## Canvas

Built on React Flow (`@xyflow/react`) with a d3-force layout ([`layout.ts`](../../src/lib/knowledge-base/layout.ts)). It renders client-side only.

### Visual encoding

| Property | Meaning | Source |
|----------|---------|--------|
| Location | Semantically similar topics sit closer | Invisible springs along `semantic_links` (top-5 cosine neighbours, similarity ≥ 0.3), strength ∝ similarity |
| Size | Evidence volume — bigger means more accumulated evidence | `evidence_count`, sqrt scale → width 160–280px, title 13–18px ([`visuals.ts`](../../src/lib/knowledge-base/visuals.ts)) |
| Transparency | Recency — older topics fade, down to a floor | `last_activity_at` (`last_evidence_at ?? updated_at`), 30-day half-life, floor α 0.35 |
| Link | Shared context: both topics appear in the same conversation (page links become possible once a page can hold several topics) | `context_edges`, stroke width grows with the number of shared contexts |

The layout is deterministic: nodes start on a spiral in the RPC's order (largest first) and a fixed number of ticks runs with a seeded random source, so the same data always gives the same picture.

### Controls

A sticky toolbar in the top-right corner:

| Button | Icon | Action |
|--------|------|--------|
| Recenter | `Focus` | Fit every node back into view |
| Cursor mode | `MousePointer2` | Default. Click nodes to select; dragging the background does nothing |
| Hand mode | `Hand` | Drag the background to pan |
| Zoom in / out | `ZoomIn` / `ZoomOut` | Step zoom (0.1×–2×) |

Holding **⌘** (Ctrl on Windows/Linux) temporarily swaps cursor and hand modes. Wheel and pinch always zoom.

### Filter

A floating input at the top of the canvas filters nodes by case-insensitive keyword match on name and description. Matches stay crisp; everything else is dimmed and blurred. The right-aligned clear button restores the canvas.

### Selection

Clicking a node sets `?t=`:

1. The node is highlighted (primary ring), its linked nodes and links get a softer highlight, and everything else is dimmed and blurred — the same effect the filter uses.
2. The node expands to show the topic description and *Last activity: {date}*.
3. The nav panel loads the topic's evidence.

In cursor mode, clicking the background or pressing **Esc** clears the selection. In hand mode neither does.

### Legend

Bottom-right, non-interactive:

- `square-text` — *Nodes represent units of relevant semantic knowledge*
- `minus` — *Links represent shared context (page or conversation)*

lucide-react 0.575 doesn't ship `square-text`, so the canvas defines it locally with `createLucideIcon`.

### States

- **Loading** — a small skeleton cluster in the middle of the canvas.
- **Empty** — *No knowledge yet*: no topic is visible to this user yet.
- **Error** — *Couldn't load the knowledge base*.

## Nav panel: evidence

[`KnowledgeNavSection`](../../src/components/knowledge-base/knowledge-nav-section.tsx) shows a hint until a node is selected. With a selection:

- The topic title and an evidence filter stay **sticky** at the top while the list scrolls.
- Each piece of evidence is a clickable bubble with the source's icon and title, a date and a snapshot trimmed to three lines.
  - **Conversation evidence** is one bubble per supporting message (`conversation_topic_evidences` → `messages`), snapshot from `message_semantics.normalized_text` (falling back to the raw text). It deep-links with `?c=…&m=…`, which scrolls to and flashes the message. Trashed messages are skipped.
  - **Page evidence** is one bubble per page, snapshot from `page_topics.page_snapshot`. It deep-links with `?p=…` (there is no page-topic → chunk link, so no passage is flashed).
- The bubble for the entity currently open is highlighted.
- Titles come from the already loaded conversation and page lists, so the server never resolves them twice.
- The filter matches title and snapshot; it resets when another topic is selected.
- If the topic can no longer be read ("Topic not found"), the selection is cleared.

## Server functions

### `getKnowledgeGraph({ workspaceId })`

1. Resolves the caller's `workspace_users.id` **from the session** (never from input); non-members get *Not a member of this workspace*.
2. Calls `get_canonical_topic_graph_for_user` through `supabaseAdmin` (the function is `service_role`-only) with `max_nodes = 400`, `neighbors = 5`, `min_similarity = 0.3`. One statement returns nodes, context edges and semantic links; embeddings never leave the database.
3. Validates the `jsonb` result with zod ([`graph-schema.ts`](../../src/lib/knowledge-base/graph-schema.ts)); a malformed payload fails loudly.
4. **RLS cross-check** — see [Visibility](#visibility).

### `getKnowledgeTopicEvidence({ workspaceId, canonicalTopicId })`

Reads **only** through the user-scoped client (`context.supabase`), so RLS re-checks visibility on every statement: evidence attached mid-request makes later reads come back empty rather than leak. Hidden and nonexistent topics both answer *Topic not found*. Items are sorted newest first and capped at 200.

Constants live in [`config.ts`](../../src/lib/knowledge-base/config.ts).

## Visibility

**Premise:** a user only sees a topic whose evidence comes *entirely* from conversations and pages they can access. One inaccessible source hides the whole topic, with its links and evidence.

- **RLS is the final authority.** `can_read_canonical_topic` on `canonical_topics` / `canonical_topic_evidences` implements the premise (see [Canonical Topics → Access Control](../semantic/canonical_topics.md#access-control)).
- **The graph RPC is cross-checked against it.** After the RPC returns, `getKnowledgeGraph` re-reads the node ids through RLS (batches of 100) and keeps only the intersection ([`reconcileGraphWithReadable`](../../src/lib/knowledge-base/graph-reconcile.ts)); links touching a dropped node go with it. A topic is displayed only if both implementations agree, so any drift fails closed.
- **Drift log.** If RLS removes a node the RPC returned, the server logs `[knowledge-base] visibility drift between graph RPC and RLS` with the workspace, count and topic ids — never names or descriptions. Nothing changes in the UI. A non-empty drift log is a bug to raise against the database functions.
- `canonical_topic_visible_for_user` exists in the database but the app doesn't use it; RLS already decides.

Timings for the RPC, the RLS cross-check and the evidence reads are logged with `DebugLogger` (development, or `VITE_DEBUG_LOGS=true`).

## Known behaviours

- **Stale topic text.** A topic that loses evidence is flagged `needs_regeneration`, but nothing regenerates it yet. Until then its name and description may still paraphrase a removed source. Tracked as a follow-up.
- **Mixed topics are hidden.** Topics merged from both shared and private sources are hidden from anyone who can't read the private part, which can make the graph sparse. Audience-aware merging is a post-MVP investigation.
- **Trashed pages hide topics.** Trashing sets `pages.purged_at` to the purge date, so every topic with evidence from a trashed page is hidden from everyone — the owner included — until the page is recovered or purged (30 days).
- **Node cap.** At most 400 topics (largest evidence first) are drawn.

## Related docs

- [Canonical Topics](../semantic/canonical_topics.md) — how topics and evidence are produced, and their RLS
- [Database](../architecture/database.md) — `get_canonical_topic_graph_for_user` reference
- [User Interface](user_interface.md) — workspace shell, main-area params, close-on-drag
