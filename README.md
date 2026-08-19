# Tamarind

**Institutional knowledge and collaboration for teams.**

Tamarind helps teams capture, organize, and retrieve the knowledge that emerges from everyday work. Conversations become searchable memory. Pages distill decisions into lasting documentation. A semantic pipeline ensures the valuable parts of team communication are preserved and findable.

[www.tamarind.so](https://www.tamarind.so)

## What Tamarind Does

Teams generate knowledge constantly — in Slack threads, standups, design reviews, and ad-hoc discussions. Most of it disappears. Tamarind gives that knowledge a home:

- **Conversations** capture team communication with rich-text messaging, @mentions, and realtime delivery
- **Pages** distill conversation knowledge into structured, editable documents with backlinks and sharing
- **Semantic pipeline** automatically identifies high-value messages, normalizes them, and generates vector embeddings for search
- **Workspaces** isolate team environments with role-based access and plan-tier capabilities

## Current Features

| Area | Capabilities |
|------|-------------|
| **Workspaces** | Multi-workspace support, role-based access (admin/member/viewer), email invites |
| **Conversations** | Direct and group chats, @mentions, quote/create-page from messages, collapsible composer, session drafts |
| **Pages** | TipTap rich-text editor, slash commands, visibility controls, autosave, share and duplicate |
| **Search** | Hybrid keyword + semantic overlay (⌘F); command palette (⌘K) |
| **Shell** | Nav + workspace rails, status bar, light/dark/system theme |
| **Realtime** | Live message delivery, page viewing presence |
| **Semantic pipeline** | Message normalization, heuristic quality scoring, OpenAI vector embeddings |
| **Auth** | Email/password, Google/Apple/Microsoft OAuth, password reset, invite-based onboarding |

## Product Vision

Tamarind is building toward a contextual knowledge graph for teams. The current codebase includes schema and infrastructure for capabilities not yet fully wired:

- **Deeper semantic search** — hybrid overlay is live; plan-gated strategy enforcement and message-level deep links are not (`search.semantic` feature key, `message_embeddings` with HNSW index)
- **Knowledge graph** — unified entity model linking pages, messages, and users with annotations and relations (`entities`, `entity_annotations`, `entity_relations` tables)
- **AI-assisted pages** — generate documentation from conversation context (`page_origin: ai`, `ai.suggestions` feature flag)
- **Decision tracking** — scoring rules already detect decision language in messages; future UI will surface and link decisions
- **Cross-workspace knowledge** — institutional memory that spans team boundaries with controlled sharing

These are grounded in existing schema and feature flags, not speculative roadmap items.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Frontend | React 19, TanStack Router, TanStack React Query |
| Full-stack | TanStack Start (SSR + server functions) |
| Deployment | Cloudflare Workers |
| Database | Supabase (PostgreSQL + RLS + pgvector) |
| Auth | Supabase Auth + Lovable OAuth |
| Realtime | Supabase Realtime |
| Editor | TipTap |
| UI | Tailwind CSS 4, shadcn/ui, cmdk |
| Embeddings | OpenAI text-embedding-3-small |

## Getting Started

```bash
# Install dependencies
bun install

# Configure environment (see docs/deployment.md)
cp .env.example .env.local

# Start development server
bun dev
```

Required environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. See [Deployment](docs/deployment.md) for the full list.

## Documentation

Architecture and subsystem documentation lives in [`docs/`](docs/README.md):

- [Architecture](docs/architecture/overview.md) — System design, database, auth, realtime
- [Semantic Pipeline](docs/semantic/readme.md) — Message normalization, scoring, embedding
- [Interface](docs/interface/readme.md) — UI, theming, hotkeys, conversations, pages, onboarding
- [Search](docs/search/readme.md) — Hybrid keyword and semantic retrieval
- [API Routes](docs/api/readme.md) — REST endpoints
- [Deployment](docs/deployment.md) — Environment and hosting setup

## Project Structure

```
src/
├── routes/           # File-based TanStack Router pages and API handlers
├── components/       # UI feature components
├── lib/              # Server functions, auth, features
├── semantic/         # Message intelligence pipeline
├── integrations/     # Supabase and OAuth clients
└── server.ts         # Cloudflare Worker entry point

supabase/
└── migrations/       # PostgreSQL schema
docs/                 # Architecture documentation
```

## License

Proprietary. All rights reserved.
