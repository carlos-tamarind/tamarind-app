# Tamarind — product memory for CV tailoring

This file is a **current-state brief** of Tamarind (https://www.tamarind.so, app version ~0.3.x). It is written so another agent can understand product complexity and translate it into CV highlights. It is not marketing copy and not a substitute for architecture docs.

**Product one-liner:** multi-tenant SaaS for institutional team knowledge — conversations capture work, pages distill it, a semantic pipeline turns the valuable parts into searchable memory.

**Problem it solves:** teams generate knowledge in chats, reviews, and ad-hoc discussion; most of it evaporates. Tamarind keeps that knowledge in-workspace, ranked by quality, retrievable by keyword *and* meaning, and beginning to surface related memory proactively.

**Stage:** post-core-MVP, pre-knowledge-graph UI. Collaboration (workspaces, chat, pages, search, pins, trash) is live. The semantic layer is substantially built (indexing, topics, hybrid search, conversation nudges). Several next-layer surfaces (knowledge base, AI-authored pages, decision tracking, “what next”) are schema- or pipeline-ready but not productized.

---

## 1. Tech stack and why it exists

| Layer | Technology | Used for |
|-------|------------|----------|
| Language | TypeScript (strict, ESM) | Entire app: UI, server functions, semantic workers, SQL-adjacent types |
| UI | React 19 | Workspace shell, conversations, pages, search overlay, command palette |
| Routing | TanStack Router (file-based) | SSR routes, search-param navigation (`?c=`, `?p=`, `?m=`, `?k=`), auth guards |
| Data fetching | TanStack React Query | Server-function RPC, cache invalidation, polling for suggestions |
| Full-stack | TanStack Start + Nitro | SSR, typed `createServerFn` RPC, Cloudflare Worker deploy |
| Bundler / hosting | Vite 7, Cloudflare Workers (`nodejs_compat`) | Edge SSR; `waitUntil()` for non-blocking message semantics |
| Database | Supabase PostgreSQL | Multi-tenant store; source of truth in SQL migrations |
| Auth | Supabase Auth + Lovable OAuth | Email/password, Google/Apple/Microsoft; JWT sessions |
| Authorization | Postgres RLS + helper functions | Tenant isolation; conversation/page visibility; service-role workers |
| Vectors | pgvector + HNSW (cosine) | Message and page-chunk embeddings; ANN semantic search in-DB |
| Search (keyword) | `pg_trgm` + ILIKE RPCs | Titles, page plaintext, normalized messages, people |
| Realtime | Supabase Realtime | Live message INSERT/UPDATE; page viewing presence |
| Background jobs | pg_cron + pg_net → secret-gated HTTP | Embedding, CTI, page chunking/embedding/semantics, suggestions, purge, canonical topics |
| Embeddings | OpenAI `text-embedding-3-small` (1536-d) | Indexing + query embedding; provider is swappable |
| LLM | OpenAI Responses (`gpt-5.4-nano`) via a generic `llmProvider` | Page topics, CTI classification/promotion, suggestion judge |
| Tokenizer | `gpt-tokenizer` (cl100k_base) | Page chunk sizes and re-analysis token-diff gates |
| Editor | TipTap (ProseMirror) | Chat composer + page editor; mentions, slash commands, quotes, task lists |
| UI kit | Tailwind CSS 4, shadcn/ui (Radix), cmdk, Lucide, Sonner | Design-system shell; command palette; toasts |
| Layout | `react-resizable-panels` | Collapsible nav, split conversation/page panes |
| Validation | Zod | Server-function inputs, embedding/LLM request schemas |
| Package manager | Bun | Install, lockfile, scripts |
| Types from DB | Generated `src/integrations/supabase/types.ts` | Schema as typed contract |

**Deliberate non-choices (complexity signal):** no Elasticsearch/OpenSearch, no Redis/Bull queues, no separate vector DB, no custom WebSocket server, no Supabase Edge Functions for workers. Queue state, ANN search, and ACL all live in Postgres. Workers run on the same Cloudflare Worker as the app.

---

## 2. Architecture (high level)

### Shape

Browser React UI talks to **typed server functions** (TanStack Start) for almost all domain data. The browser Supabase client is used only for **auth** and **Realtime**. Server functions attach the user JWT, validate it, and query Postgres under RLS. Trusted side-effects (message insert, semantic pipeline, cron workers) use a **service-role** admin client.

```
Browser (React + React Query + Supabase client)
    │  server functions (JWT)
    ▼
Cloudflare Worker (TanStack Start)
    ├── src/lib/*.functions.ts     domain RPC
    ├── src/search/                hybrid retrieval
    ├── src/semantic/              indexing + LLM workers (server-only)
    └── REST /api/*                beacon save + secret-gated cron
            │
            ▼
Supabase: Auth JWT · PostgreSQL+RLS+pgvector · Realtime · pg_cron/pg_net
            │
            ▼
OpenAI: embeddings + LLM (workers only)
```

### Multi-tenancy

**Workspace** is the tenant. A user can belong to many workspaces. Isolation is enforced by RLS (`is_workspace_member`, conversation participation, page visibility / collaborator checks). Plan tier (`free` / `pro` / `enterprise`) exists on the workspace with a feature-key map (`src/lib/features.ts`); only `invites.create` is strictly enforced server-side today. Semantic search and AI suggestions are defined as pro/enterprise capabilities but not yet gated on the live paths.

### Database (conceptual)

Core collaboration: `workspaces`, `workspace_users` (roles: admin / member / viewer), `workspace_invites`, `conversations` + `conversation_participants`, `messages`, `pages` + `page_collaborators`.

Knowledge / search: `message_semantics` + `message_embeddings`; `page_chunks` + `page_chunk_embeddings`; `page_topics` + `page_topic_jobs` + `page_topic_embeddings`; `conversation_topics` + `conversation_topic_evidences` + `conversation_topic_jobs`; `conversation_suggestions` + jobs.

Identity graph (schema-ready): `entities` (shared UUID with source rows), `entity_types`, `entity_relations`. Pins (`pinned_entities`) already use the entity registry. Application code does **not** yet read/write `entity_relations`.

Trash: `purged_at` on pages and messages; `purgeable_entity_types` + `purge_due_entities()` RPC. Pages hard-delete after grace; messages scrub in place so a `[Message deleted]` tombstone remains.

### Auth and access

- Sign-in: email/password, Google/Apple/Microsoft OAuth, password reset.
- First-ever install: `/bootstrap` creates admin + workspace (service role).
- Thereafter: email invites (24h token, role chosen at invite).
- Defense in depth: RLS + server-function assertions (`assertWorkspaceAdmin`, participant/page checks) + plan feature keys.
- Page visibility: `private` (owner + collaborators), `conversation` (thread participants), `workspace` (all members). `external` is schema-only.

### Realtime

- Messages: live INSERT/UPDATE overlay on the open thread (no custom socket layer).
- Pages: **presence** (who is viewing), not live co-editing. Content saves via debounced server functions + Beacon API on tab close.
- Semantic job status is not pushed to the client.

### Background processing

Two patterns:

1. **Inline** — after `sendMessage`, Cloudflare `waitUntil()` normalizes/scores the message without blocking the user.
2. **Cron workers** — pg_cron every minute (purge hourly) POSTs to secret-protected `/api/public/internal/*` endpoints. Each worker has its own secret, claim RPC (`SKIP LOCKED`), retry/backoff, and circuit-break on 429/5xx.

Workers: message embedding → CTI (conversation topic identification) → page chunking → page embedding (chunks + topic strings) → page semantics (LLM topic) → conversation suggestions → purge.

---

## 3. Interface — how people use the app

Tamarind is a **workspace shell**, closer to a knowledge IDE than a chat app or a wiki. After login the user lands in `/w/$workspaceId`.

**Chrome**

- **Workspace rail** (⌘⇧\\): switch tenants; settings.
- **Nav panel** (⌘\\): icon rail + lists. Conversations, Pages, Search (⌘F), Knowledge base (placeholder), Create.
- **Main area:** empty home, a conversation, a page, or a **split pane** of both (`?c=` and `?p=`). Drag a pane below ~20% width to close it.
- **Status bar:** workspace + open assets, save/sync, version, theme, ⌘K.
- **Command palette (⌘K):** new conversation/page, search, jump to recent assets, nav toggles, theme, logout, switch workspace.
- Theme: light / dark / system.

**Home:** if the user has authored messages or edited pages, “Pick up where you left” (recent activity). Otherwise, search + create CTAs.

**Conversations (how chat is used)**

- Create a DM (find-or-create 1:1) or a group; pick members.
- Rich-text composer (TipTap): bold/italic/underline, lists, code, @people/@conversations, @@pages. ⌘↵ sends; Enter is newline. Drafts live in `sessionStorage`.
- Message grouping by author/day; hover or select to quote, copy, create a page, append to an existing page, or delete (own messages; undo for 1 hour).
- Deep link `?m=` scrolls/flashes a message (loads neighbors if outside the newest 200).
- Header **Map** opens a semantic topic minimap (established topics + evidence messages).
- Private **suggestion nudge** (top-right) when the pipeline finds a related message or page passage; click opens `?c=&m=` or `?p=&k=`; thumbs up/down + dismiss.
- Settings: rename, participants, linked pages. Pin from the nav.

**Pages (how docs are used)**

- Blank page, conversation-scoped page, or **page from selected messages** (quotes become documentation; an announcement is posted in the thread).
- TipTap editor: headings, lists, task lists, code, quotes, slash commands (`/`), same mention model as chat.
- Autosave + status bar + Beacon flush on close; localStorage draft backup; unsaved-navigation warning.
- Visibility chip; share to members/conversations; duplicate; backlinks.
- Presence avatars of current viewers.
- Passage deep link `?k=` (semantic search hit on a chunk) scrolls/flashes that passage.
- Owner trash: 30-day Deleted section with Undo / Erase now. Share/pin/duplicate blocked while trashed.

**Search (⌘F overlay, not a route)**

- Query across pages, conversations, messages, and people in the current workspace.
- Scope chips: All / Conversations & messages / Pages / Users & conversations.
- Hybrid: keyword (trigram) + semantic (vectors) in parallel, merged and grouped. Cap 20 results. Selecting a row navigates (pages can land on a chunk; messages land on the parent thread at that message).

**Knowledge base rail item:** UI stub (“coming soon”). The data to fill it is largely already being produced in the background.

---

## 4. Current features (what the product can do today)

### Workspaces, identity, access

- Multi-workspace membership; switch from rail or palette.
- Roles: workspace admin / member / viewer; conversation-level roles exist for group admin.
- Email invites with role + 24h expiry; revoke pending invites.
- Profile (display name) per workspace.
- Plan-tier feature map (free/pro/enterprise) ready; billing/payments **not** implemented.

### Collaboration

- Direct and group conversations (channel type exists in schema; UI treats it like group).
- Realtime messaging, mentions, quote-reply, session drafts.
- Soft-delete messages with author Undo (1h), then permanent placeholder; quotes of deleted messages show the placeholder.
- Pages with visibility, collaborators (implicit on edit), share, duplicate, backlinks.
- Create page from messages; append selected messages onto an existing editable page.
- Pin conversations and pages (entity-backed; pins auto-drop when access is revoked or a page is trashed).
- Nav sections for pages: Pinned, Private library, From conversations, Public (workspace) pages, Deleted.
- Keyboard-first UX (palette, search, nav, composer send).

### Retrieval

- Hybrid workspace search (keyword + semantic overlay).
- Message and page-chunk deep links from search.
- Recent activity on the empty home.

### Durability / ops surfaces users feel

- Page autosave + tab-close beacon.
- Trash/recover/purge for pages (30 days) and messages (1 hour undo, then scrub).
- Light/dark/system theming.

### Explicitly not productized yet (do not claim as shipped UX)

- Knowledge base section (placeholder).
- Live co-editing of pages.
- External page sharing / public internet links.
- Page templates picker; import origin; AI-generated page origin.
- Billing, usage meters, self-serve plan upgrades.
- Cross-workspace search or sharing.
- Graph UI over `entity_relations`.
- Page topic name/description in the page chrome (computed in the background, not shown).
- Page-topic vectors in user search (embedded, not wired into `search_pages_semantic`).
- Plan-enforced semantic search / AI feature gates.

---

## 5. AI and the semantic layer (the differentiator)

Tamarind is not “chat with an LLM.” It is a **knowledge pipeline**: filter noise, score institutional value, embed, cluster into topics, retrieve by meaning, and occasionally nudge a person toward a related artifact. LLM calls are selective judges/labelers on top of embeddings, not the primary store.

### 5.1 Message intelligence (chat → memory)

On send (non-blocking):

1. **Normalize** — HTML→text, lists/code protection, shortcut expansion (`imo` → `in my opinion`), PII redaction (email/phone/card patterns). Skip gates drop attachments, empty/emoji/punctuation-only, and low-value acks (`ok`, `thanks`, `lgtm`, …).
2. **Score (heuristic MVP v1)** — 16 weighted rules on the message plus up to 4 prior messages (length, technical terms, explanations, lists, URLs, code, commands, **decision language**, proposals, “was this a reply to a question?”, consecutive same-author bursts). Sigmoid → `[0,1]`; **embed if ≥ 0.65**. Decision-language and code-block rules are the heaviest weights.
3. **Persist** `message_semantics` with checksum dedup. High score → `QUEUED`; else `SKIPPED` (kept for audit, never embedded).

Cron **embedding worker**: claim batches, OpenAI `text-embedding-3-small`, write `message_embeddings` (HNSW). Finalize enqueues a CTI job.

### 5.2 Conversation Topic Identification (CTI)

After a message is embedded, a per-message job (processed **in conversation order**) matches the vector against that conversation’s topics:

- Strong / medium / weak cosine bands (0.60 / 0.40).
- Reinforce established topics, accumulate unnamed/named **candidates**, promote candidates via LLM once evidence ≥ 3 (merge vs new named topic).
- `historical_weight` is a monotonic accumulator; **recency decay is scoring-only** (72h half-life) when choosing `conversations.current_topic_id` (15% hysteresis so the “current topic” does not flicker).
- User-facing: **semantic map** overlay lists established topics and jumps to evidence messages.

This is a homegrown topic model: embeddings + thresholds + optional LLM, not a third-party clustering service.

### 5.3 Page intelligence

- After 5 minutes idle, **structural chunking** of TipTap JSON (~300 tokens, header glue, checksum identity so unchanged passages keep IDs).
- **Page embedding worker** vectors those chunks (and, separately, canonical `topic_name: topic_description` strings).
- **Page semantic worker** asks the LLM for a topic name + description when content is new or has drifted by ≥ 300 tokens; snapshot-hash guards prevent writing stale analysis over a page that changed mid-job.

User-facing today: chunk vectors power **semantic page search** and **passage deep links**. Topic labels are stored for later surfaces (knowledge base, related-page suggestions) but not shown on the page itself.

### 5.4 Hybrid search (query time)

`executeSearch` preprocesses the query, embeds it (2s timeout; on failure keyword still runs), and runs keyword + semantic strategies in parallel (2s each). Merge is max-score dedupe, not RRF/cross-encoder.

- Keyword: trigram similarity over page titles/content, conversation titles, normalized messages, people.
- Semantic: HNSW cosine over message vectors and page-chunk vectors; score blends similarity + recency (+ message quality score). Threshold 0.3 at query time.
- RLS / SECURITY INVOKER so users only retrieve what they can already read. Suggestion worker uses `_for_user` SECURITY DEFINER variants with explicit-user ACL helpers (service role has no `auth.uid()`).

### 5.5 Conversation suggestions (proactive memory)

A cron worker, **per participant × conversation**:

- Gates: recent embedded activity, debounce, no negative-feedback cooldown, current topic score ≥ 0.8, topic “focus” (winner uniquely closest for a majority of last 10 embedded messages).
- Retrieve related **messages and page chunks** via ACL-aware ANN using the **winner topic embedding** (not the raw last message).
- LLM **judge** (`gpt-5.4-nano`) must be selective: high similarity ≠ useful; persist only `suggest` with confidence ≥ 0.85.
- UI: private nudge with generated `notification_text`, click-through deep link, shown/dismissed/clicked tracking, thumbs feedback (negative starts cooldown).

This is the first closed loop of “the semantic layer talking back to the user.”

### 5.6 Provider design

`embeddingProvider` and `llmProvider` are generic facades (OpenAI today, swap-ready). Workers share retry taxonomy: transient → `RETRY_WAIT` with exponential backoff then 24h cooldown; permanent → `FAILED`/`QUARANTINED`; checksum/hash **drift** is a skip/requeue, not a failure. CTI quarantines a bad message so it cannot freeze a conversation’s topic queue.

---

## 6. Schema-ready substrate (built, not yet a product surface)

These exist in migrations and/or workers. Treat them as **leverage for upcoming work**, not as shipped features:

| Substrate | State | Natural product use |
|-----------|--------|---------------------|
| `entities` + `entity_relations` (quoted_from, derived_from_message, cited_in, child_of, attached_to, linked_by_user) | Registry syncs on insert/delete of pages, messages, conversations, users, page chunks. Relations unused by app code | Knowledge graph, backlinks beyond page mentions, provenance |
| `page_topics` + `page_topic_embeddings` | Written by workers; topic vectors **not** in user search | Knowledge base cards, related pages, topic browse |
| `page_origin: ai`, `page_type: generated/template/imported` | Enums only | AI-drafted docs, templates, imports |
| `page_visibility: external` | Enum + feature key `pages.externalShare` | Public/share-link docs |
| Feature keys `search.semantic`, `ai.suggestions` | Defined, not enforced on live paths | Packaging / monetization |
| Decision-language heuristic in scoring | Affects embed/skip only | Decision log, “decisions in this thread” |
| Conversation `channel` type | Schema; UI ≈ group | Slack-like channels |
| `pages` Realtime publication | Table published; UI uses presence, not content sync | Future live editing |

---

## 7. Inferred post-MVP (high-value, grounded in what exists)

These are **not a committed roadmap**. They are the next product moves an agent should assume are plausible, high-leverage, and aligned with this kind of SaaS. Prefer work that **consumes the semantic layer already being computed** rather than new greenfield models.

### 7.1 Knowledge base (nav stub → real product)

Turn the placeholder into a workspace memory explorer:

- Browse **conversation topics** and **page topics** as first-class objects (name, description, recency, evidence count).
- Jump from a topic to evidence messages (`?m=`) and page passages (`?k=`).
- Cluster / graph view using `entities` + `entity_relations` once those writes are wired (message→page “derived_from_message”, quotes, mentions).
- Filters: decisions, proposals, code-heavy threads (reuse scoring rule hits, not only vectors).
- This is the natural home for “institutional memory” positioning and the strongest CV-adjacent product story after hybrid search.

### 7.2 Suggestions on pages (symmetric to conversation nudges)

While editing or viewing a page:

- “Related conversation” / “related passage” chips from page-topic embedding vs message/page ANN (same judge pattern as conversation suggestions).
- “This page is drifting from its topic” if snapshot hash and live text diverge — prompt to retitle, split, or archive.
- Suggest **backlinks** and @@mentions from entities already linked in the graph.
- Stale-knowledge warnings: a page whose topic now mismatches the live current topic of its linked conversation.

### 7.3 AI inside conversations (assist, don’t replace chat)

Ground every action in **current topic + last-N evidenced messages + retrieved chunks**, not a generic chatbot with the whole DB:

- **Summarize this thread / this topic** (established topics already have evidence lists).
- **Extract decisions, owners, and open questions** (decision heuristic is already a scoring rule; CTI evidence is the corpus).
- **Draft a page from this topic** (`page_origin: ai`) — the create-from-messages path is the UX precedent.
- **Reply assist** that cites retrieved memory with deep links, never unsourced claims.
- Inline **“related memory”** in the composer (lighter-weight than the current corner nudge).

### 7.4 “What should I do next?” (workspace copilot on the semantic layer)

Empty-state / status-bar / palette action that answers from **structured memory**, not a blank prompt:

Inputs already available: current topic per open conversation, pending suggestions, recent activity, pinned entities, page topics, scoring-derived decision language, trash/aging pages.

Outputs that fit the product: “You were discussing X — there is a page passage on Y”; “This decision was never written to a page”; “Three threads share topic Z — consider a workspace page”; “You have a high-confidence related message you dismissed.”

Implementation sketch: retrieve (ANN + topics + recents) → LLM planner with a tight tool/schema (open conversation, open page at chunk, create page, pin) → same deep-link navigation as search. This is the flagship post-MVP AI feature and the cleanest “RAG + agents on a real ACL’d corpus” CV narrative.

### 7.5 Other value-adding moves (SaaS-shaped)

- **Monetize the semantic layer:** enforce `search.semantic` and `ai.suggestions` on free vs pro; usage-aware embedding/LLM budgets.
- **Decision tracker:** surface messages that hit `HEUR_MSG_DECISIONS`, link them to pages, show a workspace decision log in the knowledge base.
- **Wire `page_topic_embeddings` into search** and add a Topics scope chip.
- **Populate `entity_relations` on existing actions** (create page from messages, quotes, @@mentions, share) so the graph is a side-effect of work people already do.
- **Import:** Slack/email/docs → `page_origin: import` / conversation ingest, then the same normalize→score→embed path (the skip gates and PII redaction are designed for messy chat).
- **Notifications / digest:** daily “memory that might matter” from suggestion jobs + decaying topic scores (email or in-app).
- **Eval harness:** golden queries for hybrid search; suggestion precision from thumbs feedback (feedback_type is already stored).
- **Live page presence → light collaboration** (cursors or follow-mode) before full CRDT co-editing.
- **External share** and guest viewer using existing visibility enum + `pages.externalShare`.
- **Admin/insights:** topic health, embed coverage (% messages SKIPPED vs EMBEDDED), suggestion accept rate — sells the pipeline to buyers.

### 7.6 What not to over-index on

Generic “add ChatGPT in a sidebar” without retrieval + ACL is off-brand. Tamarind’s value is **selective memory** (most messages never embed) plus **permission-aware retrieval**. Post-MVP AI should stay on that rails.

---

## 8. Notes for translating this into a CV

**Level the work at:** full-stack product engineering on a multi-tenant knowledge SaaS; not a CRUD demo and not a thin GPT wrapper.

**Complexity that is fair to claim (shipped):**

- End-to-end TypeScript app on TanStack Start / React 19, deployed to Cloudflare Workers, with SSR, typed RPC, and edge `waitUntil`.
- Multi-tenant Postgres with RLS, workspace roles, page ACLs, and service-role background jobs.
- Hybrid search in Postgres (trigram + pgvector HNSW), query embedding, merge, and deep links to messages/passages.
- Production-shaped async pipelines: claim/lock queues, retries, drift guards, idempotent checksums, secret-gated cron, circuit-breaking.
- Heuristic quality model to decide *what* is worth embedding (cost/noise control), then embeddings + LLM only where they add signal (CTI, page topics, suggestion judge).
- Realtime chat + rich-text knowledge docs (TipTap) in a split-pane, keyboard-centric workspace UI.
- Proactive, per-user, ACL-aware suggestions with an LLM relevance gate and explicit feedback loop.

**Do not claim as launched:** knowledge-base product, billing, live co-authoring, public page sharing, graph UI, in-page AI, or a general “what next” copilot. Those are the natural sequel, and the substrate is already in the database.

**Story arc for highlights:** *Built the collaboration surface (workspaces, realtime conversations, documents) and the memory system underneath it (normalize → score → embed → topic → retrieve → nudge), with the next product layer being a knowledge base and a semantic-layer copilot rather than a greenfield chatbot.*
