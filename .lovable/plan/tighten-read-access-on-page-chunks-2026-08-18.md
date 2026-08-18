# Tighten read access on page chunks

## What the finding means

The read rule on `page_chunks` currently only asks "does a page with this id exist?". It never checks whether the person asking belongs to the page's workspace or is allowed to see that page. So any signed-in user of the product could read the text chunks of any page, including someone else's private page.

## Proposed fix

Replace the read rule so it mirrors the rule already used on the pages themselves:

- the reader must be a member of the page's workspace, and
- the page must be visible to them: workspace/external pages, their own private pages, or conversation pages where they are a participant or a collaborator.

No table, column, or data changes — only the read rule is rewritten.

## Does this affect the chunking / embedding workers?

No. The background workers connect with the service role key (`supabaseAdmin` in `src/semantic/pages/page-chunks/**` and `page-embeddings/**`), and the service role bypasses row-level security entirely. Reading due pages, writing chunks, claiming embedding batches, and all cron-triggered endpoints keep working unchanged.

The only readers affected are browser/end-user queries hitting `page_chunks` directly. Today the app has no such query — chunks are only touched by server-side worker code — so there is no expected user-facing change.

## Technical detail

New SELECT policy body for `page_chunks` (role `authenticated`):

```text
EXISTS (
  SELECT 1 FROM pages p
  WHERE p.id = page_chunks.page_id
    AND is_workspace_member(p.workspace_id)
    AND (
      p.visibility IN ('workspace','external')
      OR (p.visibility = 'private'
          AND p.owner_workspace_user_id = current_workspace_user_id(p.workspace_id))
      OR (p.visibility = 'conversation'
          AND ((p.conversation_id IS NOT NULL AND is_conversation_participant(p.conversation_id))
               OR is_page_collaborator(p.id)))
    )
)
```

Writes stay service-role only; existing grants unchanged. Applied as a single migration that drops and recreates the policy.

## Scope note

This plan covers only `page_chunks`. The sibling findings on `page_embeddings`, `page_semantics`, and `page_semantic_jobs` have the same weakness and can be fixed the same way — say the word and I will include them in the same migration.
