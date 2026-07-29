## Goal

A stateless `generate-embeddings` endpoint: takes normalized texts, returns OpenAI embedding vectors. No DB access, no status updates, no retries, no business logic.

## Platform note

This project is TanStack Start, where backend HTTP endpoints are file routes under `src/routes/api/` rather than Supabase Edge Functions. Same behavior, same access to Secrets (`OPENAI_API_KEY`). Nothing in the contract changes.

It will NOT go under `/api/public/*` — that prefix bypasses auth on the published site and would expose OpenAI spend to anyone. It stays at `POST /api/generate-embeddings`, callable from our own backend/pipeline.

## Files

**`src/routes/api/generate-embeddings.ts`** — thin route: parse JSON body, delegate, return JSON.

**`src/semantic/embedding/embeddings.server.ts`** (new folder) — the logic:

1. **Validate** with Zod:
   - `model`: `string | null` (missing treated as null)
   - `messages`: array of `{ id: string, normalized_text: string }`
   - Note: the shape in the request wraps the array in an object (`"messages": { [ ... ] }`), which isn't valid JSON — implemented as a plain array.
2. **Model resolution**: `null` → `text-embedding-3-small`. Any value outside `text-embedding-3-small` / `text-embedding-3-large` → **400**.
3. **400 cases**: empty `messages` array; any `normalized_text` empty or whitespace-only; malformed body.
4. **Single upstream call**: one `POST https://api.openai.com/v1/embeddings` with `{ model, input: [...texts in input order] }`, `Authorization: Bearer <OPENAI_API_KEY>`, `Content-Type: application/json`.
5. **Non-2xx from OpenAI**: propagate upstream status and error body to the caller. No retry, no de-batching.
6. **Success mapping**: index `data[]` by its `index`, pair with `messages[index].id`, return:

```text
{
  "model": "<model_id_used>",
  "results": [ { "id": "...", "embedding": [...], "dimensions": <vector length> } ],
  "usage": { "prompt_tokens": n, "total_tokens": n }
}
```

`dimensions` is the actual returned vector length (1536 for `-small`, 3072 for `-large`). `usage` is passed through.

## Logging

Using the existing `DebugLogger` (`src/lib/debugLogger.ts`), scope `"generate-message-embedding"`:

- **Success** — `DebugLogger.table({ scope, event: "EMBEDDING_SUCCESSFUL", data: { totalMessages, totalTokens: usage.prompt_tokens, model: res.model } })`
- **Failure** (validation 400, missing key, OpenAI non-2xx, network/parse error) — `DebugLogger.log({ scope, event: "EMBEDDING_FAILURE", message: "<status>: <error description>", level: "error" })`

Note: `DebugLogger.enabled` is driven by `import.meta.env.DEV` / `VITE_DEBUG_LOGS`, both of which are readable in the server bundle, so logging works server-side in dev without changes.

## Technical details

- `OPENAI_API_KEY` read from `process.env` inside the handler; missing → 500 with a clear message. Key never logged or returned.
- No Supabase client imported in either file.
- Typed request/response/error shapes exported for the future worker task.
- Verification: one real POST with two short strings — check status, ordering, vector length, and the emitted log lines.
- App version bumped one patch step per project convention.

## Out of scope

Queue/worker, `message_semantics` status transitions, writes to `message_embeddings`, retry/backoff — later tasks.
