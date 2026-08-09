# Conversation topics: database groundwork

Analysis of the attached spec, plus the gaps that must be filled for it to work in this project. Database-only; no application code.

## What the spec asks for

- New `conversation_topics` table (id, conversation_id, name, description, embedding vector(1536), first_seen_at, last_seen_at, evidence_count, is_candidate, historical_weight, created_at, updated_at).
- Checks: `evidence_count > 0`, `historical_weight >= 0`.
- Indexes: `idx_conversation_topics_conversation_id`, `idx_conversation_topics_conversation_candidate`.
- New nullable `conversations.current_topic_id` FK to `conversation_topics.id`.

## Gaps found in the spec (I will resolve them as follows)

1. **No access rules.** Every other table here is protected, and this project's setup gives no default access to new tables. Without explicit grants and a read policy the app sees zero rows. I'll grant access to signed-in users and admin/back-office code, turn on row-level security, and allow only participants of the parent conversation to read/write a conversation's topics — reusing the existing `is_conversation_participant` check already used by messages and embeddings.
2. **Circular reference.** `conversation_topics.conversation_id` points at `conversations`, and `conversations.current_topic_id` points back. The topic FK stays cascade-on-delete; the pointer column on `conversations` becomes `ON DELETE SET NULL` so deleting a topic never blocks or deletes a conversation. Table is created before the column is added.
3. **No vector index.** `embedding` is unusable for similarity search at scale without one. I'll add an HNSW cosine index, matching the pattern already used for message embeddings.
4. **`updated_at` never advances.** The column defaults to `now()` but nothing maintains it. I'll attach the same update trigger used on other tables.
5. **Duplicate topics per conversation.** The spec has no uniqueness rule. I'll leave it unconstrained (candidate topics can legitimately repeat before promotion) unless you want a unique name per conversation.

## Migration outline

```text
1. CREATE TABLE public.conversation_topics (+ PK, FK cascade, both CHECKs)
2. GRANT to authenticated + service_role
3. ENABLE ROW LEVEL SECURITY
4. POLICY: participants of the parent conversation can read and write
5. INDEX idx_conversation_topics_conversation_id
6. INDEX idx_conversation_topics_conversation_candidate (conversation_id, is_candidate)
7. INDEX HNSW on embedding (vector_cosine_ops)
8. TRIGGER to maintain updated_at
9. ALTER TABLE public.conversations
     ADD COLUMN current_topic_id uuid NULL
     REFERENCES public.conversation_topics(id) ON DELETE SET NULL
10. INDEX on conversations(current_topic_id)
```

After the migration runs, the generated database types pick up the new table and column automatically.

## Not in scope

Topic extraction, embedding generation, promotion logic, and any UI. This is schema only.

## Version

Bump `src/lib/version.ts` to 0.2.1.
