# Search & unread-messages database migration

One migration covering the unread-message column, the trigram extension, four fuzzy-search indexes, and a foreign-key verification.

## 1. Unread messages support

Add `last_read_at` (timestamptz, not null, defaults to now) to `conversation_participants`. No app code reads it yet; it prepares the Unread feature.

## 2. Trigram extension

Enable `pg_trgm` (currently not installed) in the `extensions` schema, which is where Supabase keeps extensions.

## 3. Trigram indexes

Four GIN trigram indexes for substring/fuzzy matching:

- `pages.title`
- `pages.plain_text` — note: the requested column `content_plain` does not exist. This table stores the searchable text in `plain_text` (a generated column from the TipTap document), so the index goes there.
- `message_semantics.normalized_text`
- `conversations.title`

## 4. Foreign keys — already in place

Checked against the live database; all six exist, though two use different column names than the request assumed:

| Requested | Actual |
|---|---|
| conversation_participants(conversation_id) | exists → conversations(id) |
| conversation_participants(user_id) | exists as `workspace_user_id` → workspace_users(id) |
| page_collaborators(page_id) | exists → pages(id) |
| page_collaborators(user_id) | exists as `workspace_user_id` → workspace_users(id) |
| messages(conversation_id) | exists → conversations(id) |
| messages(author_id) | exists as `author_workspace_user_id` → workspace_users(id) |

Membership in this app is modelled through `workspace_users`, not directly through `auth.users`, so no new keys are created.

## Technical notes

- Indexes are created with `IF NOT EXISTS`; `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
- No table is created, so no new GRANT/RLS work is needed.
- No application code changes and no version bump in this task.
