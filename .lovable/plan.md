# Keyword Search RPCs

Add the trigram-based keyword search functions used by the search overlay, plus the supporting enum and index. No app code changes, no version bump.

## What gets added

1. Enum `search_matched_field` with values `title`, `content`, `name`.
2. Trigram GIN index on member display names (`workspace_users.display_name`) so people search is fast.
3. Four search functions, each taking a workspace, a query string and a result limit, returning ranked matches with a similarity score:
   - Pages — matches page titles and page text, reporting which one matched better.
   - Conversations — matches conversation titles.
   - Messages — matches normalized message text, returning the message and its conversation.
   - People — matches member display names, returning the best-matching person per conversation.

## Technical details

- All four functions: `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`, `SET search_path = public, extensions`, so existing row-level access rules still apply to the caller.
- `GRANT EXECUTE ON FUNCTION ... TO authenticated` for each function.
- Ranking uses `pg_trgm` `similarity()` and the `%` operator; `pg_trgm` and the page/message/conversation trigram indexes are already in place.
- Index created as `idx_workspace_users_display_name_trgm` using `extensions.gin_trgm_ops`.
- SQL is applied exactly as specified in the request.

## Not included

- No changes to `src/search/*` or the search overlay yet — wiring the UI to these functions is a separate step.
