# Tamarind Documentation

Tamarind is an institutional knowledge and collaboration SaaS. Teams capture knowledge in conversations, distill it into rich-text pages, and search across workspace content using hybrid keyword and semantic retrieval.

This documentation describes the **current architecture** of the codebase. It does not speculate about unimplemented features unless explicitly noted as schema-ready.

## Documentation Map

### Architecture

Core system design, data model, and cross-cutting concerns.

| Document | Description |
|----------|-------------|
| [Overview](architecture/overview.md) | Stack, entry points, routing, server functions |
| [Database](architecture/database.md) | Schema, tables, relationships, RLS, indexes |
| [Auth](architecture/auth.md) | Authentication, authorization, workspaces, invites |
| [Realtime](architecture/realtime.md) | Supabase Realtime subscriptions and presence |

### Semantic Pipeline

Message normalization, scoring, and embedding subsystem.

| Document | Description |
|----------|-------------|
| [Overview](semantic/readme.md) | Subsystem purpose and links to detail docs |
| [Pipeline](semantic/pipeline.md) | End-to-end two-phase processing flow |
| [Normalization](semantic/msg_normalization.md) | Text cleanup and skip gates |
| [Scoring](semantic/msg_scoring.md) | MVP v1 heuristic quality model |
| [Embedding](semantic/msg_embedding.md) | Batch worker, OpenAI provider, retry logic |

Developer entry point for the module: [`src/semantic/README.md`](../src/semantic/README.md)

### Search & Retrieval

Hybrid keyword and semantic search over workspace pages, conversations, messages, and people.

| Document | Description |
|----------|-------------|
| [Overview](search/readme.md) | Subsystem purpose, architecture, and strategy summary |
| [Pipeline](search/pipeline.md) | End-to-end query flow from UI to merged results |
| [Keyword Search](search/keyword.md) | Trigram-based keyword strategy and RPCs |
| [Semantic Search](search/semantic.md) | Vector similarity over message and page-chunk embeddings |
| [User Search](search/user_search.md) | How users open search, filter, and act on results |

### Interface

User-facing UI, routing, and feature areas.

| Document | Description |
|----------|-------------|
| [Overview](interface/readme.md) | UI stack, component organization, data layer |
| [User Interface](interface/user_interface.md) | Workspace shell layout and navigation |
| [Workspaces & Permissions](interface/workspaces_permissions.md) | Roles, plans, feature gating |
| [User Onboarding](interface/user_onboarding.md) | Bootstrap, login, invites |
| [Conversations](interface/conversations.md) | Chat UI and server functions |
| [Pages](interface/pages.md) | TipTap editor, sharing, autosave |

### API, Background Jobs & Deployment

| Document | Description |
|----------|-------------|
| [API Routes](api/readme.md) | REST endpoints distinct from server functions |
| [Cron & Background Jobs](cron/readme.md) | Inline semantics processing and embedding worker |
| [Deployment](deployment.md) | Cloudflare Workers, Supabase, environment variables |

## Key Directories

```
src/
├── routes/           # File-based TanStack Router pages and API handlers
├── components/       # UI feature components (conversation, page, editor, search, ui)
├── lib/              # Server functions (*.functions.ts), auth, features
├── search/           # Search orchestration, strategies, request building
├── semantic/         # Message normalization, scoring, embedding pipeline
├── integrations/     # Supabase and Lovable OAuth clients
└── server.ts         # Cloudflare Worker entry point

supabase/
└── migrations/       # PostgreSQL schema (source of truth for database.md)
```

## Tech Stack Summary

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
| UI | Tailwind CSS 4, shadcn/ui (Radix) |
| Embeddings | OpenAI `text-embedding-3-small` |
