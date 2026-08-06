# Semantic Search — Database Migration

Database-only step preparing semantic search. No app code changes; only the generated database types file is refreshed afterwards.

## What gets added

1. Read access to message embeddings for signed-in users, restricted so a person can only see embeddings from conversations they take part in (mirrors the existing rule on message semantics). Today the embeddings table has row-level security on with no policies, so it returns nothing to normal users.
2. A new semantic search function for messages: takes a workspace, a query vector, a result limit, and tunable knobs (similarity threshold, weights for similarity / quality / recency, recency half-life). It returns the best-matching messages with a combined score.

## Technical details

- `GRANT SELECT ON public.message_embeddings TO authenticated;` plus policy `"Participants view message embeddings"` (SELECT) using an EXISTS join `message_semantics -> messages` and `public.is_conversation_participant(m.conversation_id)`.
- `public.search_messages_semantic(uuid, vector(1536), int, float4, float4, float4, float4, float4)` — `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`, `SET search_path = public, extensions`, exactly the CTE structure supplied: `nearest` (HNSW order by `<=>`, over-fetch `p_limit * 3`, `is_active = true`, workspace filter), `filtered` (threshold), `scored` (weighted score + `ROW_NUMBER()` dedupe per message), final select of `rn = 1`.
- Returns `asset_id, conversation_id, title (NULL), match_text, matched_field ('content'::public.search_matched_field), score`.
- One correction to the supplied SQL: `quality_score` is `numeric`, so the weighted expression resolves to `double precision`; the score expression is cast with `::float4` so it matches the declared return column. Behaviour is unchanged.
- `GRANT EXECUTE ON FUNCTION public.search_messages_semantic(...) TO authenticated;`
- Reuses the existing `public.search_matched_field` enum and the existing HNSW index `idx_message_embeddings_vector`.

## After the migration

- Regenerate `src/integrations/supabase/types.ts` so the new function signature is typed.

## Not included

- No changes to `src/search/*`, no strategy wiring, no version bump.
