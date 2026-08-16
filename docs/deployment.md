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
  ├── pg_cron + pg_net       Embedding + CTI worker schedulers
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

Replace the URL and secret with your deployment values. Do not enable this against production traffic until the CTI engine is implemented (the current stub completes jobs without topic mutations).

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
