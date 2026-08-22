DO $mig$
BEGIN
  EXECUTE $q$UPDATE public.message_semantics SET embedding_status = 'QUEUED' WHERE embedding_status::text = 'NEW'$q$;
  EXECUTE $q$ALTER TABLE public.message_semantics ALTER COLUMN embedding_status DROP DEFAULT$q$;
  EXECUTE $q$DROP FUNCTION IF EXISTS public.cti_is_next_processable(uuid, uuid)$q$;
  EXECUTE $q$DROP INDEX IF EXISTS public.idx_message_semantics_queue$q$;
  EXECUTE $q$DROP INDEX IF EXISTS public.idx_message_semantics_status_processed$q$;
  EXECUTE $q$DROP INDEX IF EXISTS public.message_semantics_embedding_status_idx$q$;
  EXECUTE $q$DROP INDEX IF EXISTS public.idx_message_semantics_message_status$q$;
  EXECUTE $q$ALTER TYPE public.embedding_status RENAME TO embedding_status_old$q$;
  EXECUTE $q$CREATE TYPE public.embedding_status AS ENUM ('QUEUED','PROCESSING','EMBEDDED','FAILED','SKIPPED')$q$;
  EXECUTE $q$ALTER TABLE public.message_semantics ALTER COLUMN embedding_status TYPE public.embedding_status USING embedding_status::text::public.embedding_status$q$;
  EXECUTE $q$ALTER TABLE public.message_semantics ALTER COLUMN embedding_status SET DEFAULT 'QUEUED'::public.embedding_status$q$;
  EXECUTE $q$DROP TYPE public.embedding_status_old$q$;
  EXECUTE $q$CREATE INDEX idx_message_semantics_queue ON public.message_semantics USING btree (next_retry_at, created_at) WHERE (embedding_status = 'QUEUED'::public.embedding_status)$q$;
  EXECUTE $q$CREATE INDEX idx_message_semantics_status_processed ON public.message_semantics USING btree (embedding_status, last_processed_at)$q$;
  EXECUTE $q$CREATE INDEX message_semantics_embedding_status_idx ON public.message_semantics USING btree (embedding_status)$q$;
  EXECUTE $q$CREATE INDEX idx_message_semantics_message_status ON public.message_semantics USING btree (message_id, embedding_status)$q$;
END
$mig$;

CREATE OR REPLACE FUNCTION public.cti_is_next_processable(_conversation_id uuid, _message_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.messages e
    JOIN public.messages m ON m.id = _message_id
    WHERE e.conversation_id = _conversation_id
      AND e.id <> m.id
      AND (e.created_at, e.id) < (m.created_at, m.id)
      AND (
        EXISTS (
          SELECT 1 FROM public.conversation_topic_jobs je
          WHERE je.message_id = e.id
            AND je.status NOT IN ('COMPLETED','QUARANTINED')
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.message_semantics s
            WHERE s.message_id = e.id
              AND s.embedding_status IN ('QUEUED','PROCESSING','EMBEDDED')
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.conversation_topic_jobs jc
            WHERE jc.message_id = e.id
              AND jc.status IN ('COMPLETED','QUARANTINED')
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.cti_is_next_processable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cti_is_next_processable(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cti_is_next_processable(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cti_is_next_processable(uuid, uuid) TO service_role;