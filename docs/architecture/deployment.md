# Deployment

Tamarind deploys as a Cloudflare Worker with Supabase as the backend database and auth provider.

## Architecture

```
Cloudflare Workers (TanStack Start SSR)
  ├── src/server.ts          Worker entry point
  ├── wrangler.jsonc         Worker configuration
  └── Environment variables  Secrets and config

Supabase Project
  ├── PostgreSQL + RLS       Database
  ├── Auth                   JWT sessions
  ├── Realtime               Live subscriptions
  ├── pg_cron + pg_net       Embedding, CTI, page-chunking, page-embedding, page-semantic, suggestion, and purge schedulers
  └── Migrations             supabase/migrations/
```

## Cloudflare Workers

**Config:** [`wrangler.jsonc`](../../wrangler.jsonc)

```jsonc
{
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts"
}
```

**Entry point:** [`src/server.ts`](../../src/server.ts) — wraps TanStack Start with SSR error handling.

**Build:** Vite 7 with `@lovable.dev/vite-tanstack-config` and `@cloudflare/vite-plugin`.

## Environment Variables

### Client-side (VITE_ prefix)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `VITE_DEBUG_LOGS` | Enable debug logging and dev worker endpoint |

### Server-side

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL (server) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (beacon save route) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for RLS bypass |
| `OPENAI_API_KEY` | OpenAI embeddings API |
| `EMBEDDING_WORKER_SECRET` | Embedding cron endpoint authentication |
| `CTI_WORKER_SECRET` | CTI cron endpoint authentication |
| `PAGE_CHUNKING_WORKER_SECRET` | Page chunking cron endpoint authentication |
| `PAGE_EMBEDDING_WORKER_SECRET` | Page embedding cron endpoint authentication |
| `PAGE_SEMANTIC_WORKER_SECRET` | Page semantic cron endpoint authentication |
| `CONVERSATION_SUGGESTIONS_WORKER_SECRET` | Conversation suggestion cron endpoint authentication |
| `PURGE_WORKER_SECRET` | Purge (trash erase) cron endpoint authentication |
| `PLATFORM_OWNER_EMAILS` | Comma-separated, lowercase allowlist of platform-owner emails permitted to issue workspace bootstrap invites. Server-only; never stored in the database |

Set server-side variables as Cloudflare Worker secrets. Client-side variables are embedded at build time.

## Build & Deploy Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite dev` | Local development server |
| `build` | `vite build` | Production build |
| `build:dev` | `vite build --mode development` | Development-mode build |
| `preview` | `vite preview` | Preview production build |
| `lint` | `eslint .` | Lint codebase |
| `format` | `prettier --write .` | Format codebase |

Package manager: Bun (primary, `bun.lock`).

## Local Development

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.example .env.local  # if available, or create .env.local manually

# Start dev server
bun dev
```

Required in `.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (for embedding pipeline)
- `EMBEDDING_WORKER_SECRET` (for embedding cron endpoint testing)
- `CTI_WORKER_SECRET` (for CTI cron endpoint testing)
- `PAGE_CHUNKING_WORKER_SECRET` (for page chunking cron endpoint testing)
- `PAGE_EMBEDDING_WORKER_SECRET` (for page embedding cron endpoint testing)
- `PAGE_SEMANTIC_WORKER_SECRET` (for page semantic cron endpoint testing)
- `CONVERSATION_SUGGESTIONS_WORKER_SECRET` (for conversation suggestion cron endpoint testing)
- `PURGE_WORKER_SECRET` (for purge cron endpoint testing)

## Supabase Setup

1. Create a Supabase project
2. Run migrations from [`supabase/migrations/`](../../supabase/migrations/)
3. Enable Realtime publication for `messages` and `pages` (configured in initial migration)
4. Enable pg_cron and pg_net extensions (migration `20260730075844`)
5. Schedule the embedding worker cron job (see [Cron & Background Jobs](cron/readme.md))

## Embedding Worker Cron

After deploying, configure pg_cron to call the worker endpoint:

```sql
SELECT cron.schedule(
  'run-embedding-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.example.com/api/public/internal/run-embedding-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-embedding-worker-secret', 'your-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace the URL and secret with your deployment values.

## CTI Worker Cron

After deploying, configure a separate pg_cron job for the CTI worker:

```sql
SELECT cron.schedule(
  'run-cti-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.example.com/api/public/internal/run-cti-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cti-worker-secret', 'your-cti-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace the URL and secret with your deployment values. The worker now runs the full CTI engine (topic matching, optional LLM, and atomic apply+commit).

## Page Chunking Worker Cron

After deploying, configure a separate pg_cron job for the page chunking worker:

```sql
SELECT cron.schedule(
  'run-page-chunking-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.example.com/api/public/internal/run-page-chunking-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-page-chunking-worker-secret', 'your-page-chunking-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace the URL and secret with your deployment values. The worker chunks idle pages and queues `page_chunk_embeddings` as `QUEUED`; it does not call OpenAI.

## Page Embedding Worker Cron

After deploying, configure a separate pg_cron job for the page embedding worker:

```sql
SELECT cron.schedule(
  'run-page-embedding-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.example.com/api/public/internal/run-page-embedding-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-page-embedding-worker-secret', 'your-page-embedding-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Use a dedicated secret — do not reuse `EMBEDDING_WORKER_SECRET`, so a leak or rotation stays scoped to one endpoint. The worker claims `QUEUED`/`RETRY_WAIT` rows via `claim_page_chunk_embedding_batch`, embeds the matching chunk text, and persists the vector only while the row is still `PROCESSING` with an unchanged checksum.

## Page Semantic Worker Cron

After deploying, configure a separate pg_cron job for the page semantic worker:

```sql
SELECT cron.schedule(
  'run-page-semantic-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.example.com/api/public/internal/run-page-semantic-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-page-semantic-worker-secret', 'your-page-semantic-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Use a dedicated secret (`PAGE_SEMANTIC_WORKER_SECRET`) — do not reuse any other worker secret. Each tick sweeps due pages (`list_pages_due_for_topics`) then claims LLM jobs via `claim_page_topic_job`.

## Conversation Suggestion Worker Cron

```sql
SELECT cron.schedule(
  'run-conversation-suggestion-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.example.com/api/public/internal/run-conversation-suggestion-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-conversation-suggestions-worker-secret', 'your-conversation-suggestions-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Use a dedicated secret (`CONVERSATION_SUGGESTIONS_WORKER_SECRET`). Each tick sweeps due participant×conversation pairs (`list_conversation_suggestion_jobs_due`) then claims LLM jobs via `claim_conversation_suggestion_job`.





## Purge Worker Cron

Runs hourly (a 30-day trash grace period does not need a 60s tick):

```sql
SELECT cron.schedule(
  'run-purge-worker',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.example.com/api/public/internal/run-purge-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-worker-secret', 'your-purge-secret-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Use a dedicated secret (`PURGE_WORKER_SECRET`) — never reuse another worker secret. Enable the job only after a build containing the production route is live; earlier ticks simply log 404s. Each tick calls the service-role `purge_due_entities()` RPC, which walks `purgeable_entity_types` in `purge_order` — no table names are hardcoded in the worker.

## Database Migrations

Migrations are SQL files in [`supabase/migrations/`](../../supabase/migrations/). Apply via Supabase CLI or dashboard:

```bash
supabase db push
```

TypeScript types are generated from the schema into [`src/integrations/supabase/types.ts`](../../src/integrations/supabase/types.ts).

## Related Docs

- [Architecture Overview](architecture/overview.md) — System layers
- [Cron & Background Jobs](cron/readme.md) — Worker scheduling
- [API Routes](api/readme.md) — HTTP endpoints
