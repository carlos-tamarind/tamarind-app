# Topic evidence: database groundwork

Analysis of the attached spec for the new table linking topics to the messages that support them. Database-only; no application code.

## What the spec asks for

- New table storing one row per (topic, message) pair, with the cosine similarity that made the message count as evidence and a creation timestamp.
- Deleting a topic or a message removes its evidence rows.
- A message can support many topics, but only once per topic.
- Similarity must stay between 0 and 1.
- Three indexes: by topic, by message, and by topic + creation time.

## Gaps found in the spec (resolved as follows)

1. **Table name is inconsistent in the spec.** The description says `conversation_topic_evidences` (plural) while the index block uses the singular. Resolved: the table is plural, `conversation_topic_evidences`; index names stay as written in the spec (`idx_conversation_topic_evidence_*`).
2. **No access rules.** As with `conversation_topics`, new tables here get no default access, so without explicit grants and policies the app sees zero rows. I'll grant signed-in users and back-office code, enable row-level security, and scope access to participants of the conversation the topic belongs to — reusing the existing participant check, resolved through the topic's parent conversation.
3. **No workspace column.** Not needed: access is derived through the topic, and the topic is already tied to a conversation.
4. **No `updated_at`.** Correct as-is — evidence rows are immutable facts, so only `created_at` is kept and no update trigger is added.
5. **Redundant index.** The by-topic index and the topic+created index overlap; the spec asks for both, so both are created as specified.
6. **`evidence_count` on topics is not auto-maintained.** No trigger will sync the counter from this table; the pipeline keeps owning that value.

## Migration outline

```text
1. CREATE TABLE public.conversation_topic_evidences
     id            uuid PK default gen_random_uuid()
     topic_id      uuid NOT NULL -> conversation_topics(id) ON DELETE CASCADE
     message_id    uuid NOT NULL -> messages(id) ON DELETE CASCADE
     similarity    real NOT NULL CHECK (similarity >= 0 AND similarity <= 1)
     created_at    timestamptz NOT NULL default now()
     UNIQUE (topic_id, message_id)
2. GRANT to authenticated + service_role
3. ENABLE ROW LEVEL SECURITY
4. POLICIES: participants of the topic's conversation can read and write
5. INDEX idx_conversation_topic_evidence_topic_id
6. INDEX idx_conversation_topic_evidence_message_id
7. INDEX idx_conversation_topic_evidence_topic_created (topic_id, created_at)
```

After the migration runs, the generated database types are regenerated so the new table is available in code.

## Not in scope

Evidence creation, similarity computation, topic promotion logic, retrieval helpers, and any UI. Schema only.

## Version

Bump `src/lib/version.ts` to 0.2.2.
