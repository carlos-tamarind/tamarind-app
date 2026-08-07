# Keyword Search: ILIKE Filter + Trigram Scoring

Substring searches currently disappear because all four keyword search functions use trigram similarity both to decide *whether* a row matches and to score it. The similarity threshold (0.3) drops legitimate substring matches before ranking runs. This change decouples the two: match with a plain substring filter, keep the similarity score for ranking.

## What changes

A single new database migration that replaces the four keyword search functions:

- Pages — matches page title or page text
- Conversations — matches conversation title
- Messages — matches normalized message text
- People — matches member display names (best match per conversation preserved)

For each one, only the match condition changes to a case-insensitive "contains" test. Scoring, matched-field reporting, ordering by score, and the result limit stay exactly as they are.

Also added: a small helper that escapes `%` and `_` in a user's query so those characters are searched literally instead of acting as wildcards.

## Technical details

- New migration file; the existing keyword migration is not edited.
- `CREATE OR REPLACE FUNCTION` for all four RPCs — signatures, return columns, `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`, `SET search_path = public, extensions` unchanged, so existing grants and access rules carry over. No new `GRANT`s needed.
- Helper: `public.escape_ilike_pattern(text)`, `LANGUAGE sql IMMUTABLE`, escaping `\`, `%`, `_`.
- Filter pattern used everywhere: `col ILIKE '%' || public.escape_ilike_pattern(p_query) || '%' ESCAPE '\'`.
- Pages keeps `title_score`/`content_score` + `greatest(...)` + `matched_field` CASE; people keeps `DISTINCT ON (conversation_id)`.
- Indexes: none added. The existing pg_trgm GIN indexes (`idx_pages_title_trgm`, `idx_pages_content_trgm`, `idx_conversations_title_trgm`, `idx_messages_normalized_trgm`, `idx_workspace_users_display_name_trgm`) already accelerate `ILIKE '%…%'` for patterns of 3+ characters, which matches the app's 3-char minimum query guard in `src/search/preprocessQuery.ts`. Noted in migration comments.

## Application code

No changes. RPC names, arguments (`p_workspace_id`, `p_query`, `p_limit`) and returned columns are identical, so `KeywordSearchStrategy.ts`, `SearchRequest` and the generated Supabase types stay valid.

## Verification

Manual smoke tests through the search overlay:

1. Search a known word inside a page title/body — it must now appear (primary fix).
2. Search a term present in several assets — stronger matches rank higher.
3. `all` scope returns at most 20 merged results; each scope respects its limit.
4. `pages`, `conversations`, `users` scopes return the expected asset types.
5. A query containing `%` or `_` matches literally; queries under 3 characters still return nothing.

## Version

Bump `APP_VERSION` in `src/lib/version.ts` from `0.1.455` to `0.1.456`.

## Not included

- No changes to semantic search or the search UI.
