# Pages in Semantic Search — Database Migration

Database-only step so page-chunk embeddings can back semantic search. No app logic changes beyond regenerating database types and the version bump.

## What gets added

A new search function for pages: it takes a workspace, a query vector, a result limit, and the same tunable knobs used for message search (similarity threshold, weights, recency half-life). It returns the best-matching pages with a combined score, one row per page.

Ranking: 0.85 × cosine similarity + 0.15 × recency decay on the page's last modified date (180-day half-life), keeping scores in the 0–1 range. No page quality signal is invented.

## Technical details

- New migration file under `supabase/migrations/` defining `public.search_pages_semantic(uuid, vector(1536), int, float4, float4, float4, float4)` — `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`, `SET search_path = public, extensions`, mirroring the structure of `search_messages_semantic`.
- Defaults: `p_similarity_threshold` 0.3, `p_weight_similarity` 0.85, `p_weight_recency` 0.15, `p_recency_half_life_days` 180. No quality weight parameter.
- Query chain: `page_embeddings pe → page_chunks c → pages p`, filtered by `p.workspace_id = p_workspace_id`, `pe.embedding_status = 'EMBEDDED'`, and `pe.embedding_model = 'text-embedding-3-small'` (passed as a parameter defaulting to that value, matching the current chunking/embedding config).
- CTEs: `nearest` (HNSW `ORDER BY pe.embedding <=> p_embedding`, over-fetch `p_limit * 3`, matching the existing partial index `idx_page_embeddings_vector`), `filtered` (threshold), `scored` (weighted score plus `ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY score DESC)` to keep the best chunk per page), final select of `rn = 1` ordered by score, `LIMIT p_limit`.
- Recency uses `p.last_modified_at`; the score expression is cast `::float4` to match the declared return column.
- Returns `asset_id` (page id), `title` (page title), `match_text` (winning chunk content), `matched_field` (`'content'::public.search_matched_field`), `score`.
- Reads run under the caller's identity, so the existing `page_embeddings` / `page_chunks` read policies (workspace membership + page visibility via `can_read_page`) apply unchanged. Workers are unaffected — they use the service role.
- `GRANT EXECUTE ON FUNCTION public.search_pages_semantic(...) TO authenticated;`

## After the migration

- Regenerate `src/integrations/supabase/types.ts` so the new function signature is typed.
- Bump `APP_VERSION` in `src/lib/version.ts` to `0.2.18`.

## Not included

- No new tables, columns, or indexes.
- No SQL backfill — existing pages are picked up by `list_pages_due_for_chunking` and embedded by the current workers.
- No changes to `src/search/*` strategies or wiring; that is a follow-up step.
