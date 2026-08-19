-- =========================
-- PART 1: renames
-- =========================
ALTER TABLE public.page_embeddings RENAME TO page_chunk_embeddings;
ALTER TABLE public.page_semantics RENAME TO page_topics;
ALTER TABLE public.page_semantic_jobs RENAME TO page_topic_jobs;

ALTER TABLE public.page_chunk_embeddings RENAME CONSTRAINT page_embeddings_pkey TO page_chunk_embeddings_pkey;
ALTER TABLE public.page_chunk_embeddings RENAME CONSTRAINT page_embeddings_chunk_model_key TO page_chunk_embeddings_chunk_model_key;
ALTER TABLE public.page_chunk_embeddings RENAME CONSTRAINT page_embeddings_embedded_requires_vector TO page_chunk_embeddings_embedded_requires_vector;
ALTER TABLE public.page_chunk_embeddings RENAME CONSTRAINT page_embeddings_chunk_id_fkey TO page_chunk_embeddings_chunk_id_fkey;
ALTER TABLE public.page_chunk_embeddings RENAME CONSTRAINT page_embeddings_attempts_check TO page_chunk_embeddings_attempts_check;

ALTER TABLE public.page_topics RENAME CONSTRAINT page_semantics_pkey TO page_topics_pkey;
ALTER TABLE public.page_topics RENAME CONSTRAINT page_semantics_page_id_fkey TO page_topics_page_id_fkey;
ALTER TABLE public.page_topics RENAME CONSTRAINT page_semantics_topic_name_check TO page_topics_topic_name_check;
ALTER TABLE public.page_topics RENAME CONSTRAINT page_semantics_topic_description_check TO page_topics_topic_description_check;
ALTER TABLE public.page_topics RENAME CONSTRAINT page_semantics_page_snapshot_check TO page_topics_page_snapshot_check;
ALTER TABLE public.page_topics RENAME CONSTRAINT page_semantics_page_snapshot_hash_check TO page_topics_page_snapshot_hash_check;

ALTER TABLE public.page_topic_jobs RENAME CONSTRAINT page_semantic_jobs_pkey TO page_topic_jobs_pkey;
ALTER TABLE public.page_topic_jobs RENAME CONSTRAINT page_semantic_jobs_page_id_fkey TO page_topic_jobs_page_id_fkey;
ALTER TABLE public.page_topic_jobs RENAME CONSTRAINT page_semantic_jobs_attempts_check TO page_topic_jobs_attempts_check;

ALTER INDEX public.idx_page_embeddings_queue RENAME TO idx_page_chunk_embeddings_queue;
ALTER INDEX public.idx_page_embeddings_claimable RENAME TO idx_page_chunk_embeddings_claimable;
ALTER INDEX public.idx_page_embeddings_vector RENAME TO idx_page_chunk_embeddings_vector;
ALTER INDEX public.uniq_page_semantic_jobs_inflight RENAME TO uniq_page_topic_jobs_inflight;
ALTER INDEX public.idx_page_semantic_jobs_claimable RENAME TO idx_page_topic_jobs_claimable;
ALTER INDEX public.idx_page_semantic_jobs_queue RENAME TO idx_page_topic_jobs_queue;

ALTER FUNCTION public.set_page_embeddings_updated_at() RENAME TO set_page_chunk_embeddings_updated_at;
ALTER FUNCTION public.set_page_semantics_updated_at() RENAME TO set_page_topics_updated_at;
ALTER FUNCTION public.set_page_semantic_jobs_updated_at() RENAME TO set_page_topic_jobs_updated_at;

ALTER TRIGGER trg_page_embeddings_updated_at ON public.page_chunk_embeddings RENAME TO trg_page_chunk_embeddings_updated_at;
ALTER TRIGGER trg_page_semantics_updated_at ON public.page_topics RENAME TO trg_page_topics_updated_at;
ALTER TRIGGER trg_page_semantic_jobs_updated_at ON public.page_topic_jobs RENAME TO trg_page_topic_jobs_updated_at;

DROP POLICY IF EXISTS "Page readers view page embeddings" ON public.page_chunk_embeddings;
DROP POLICY IF EXISTS "Page readers view page semantics" ON public.page_topics;
DROP POLICY IF EXISTS "Page readers view page semantic jobs" ON public.page_topic_jobs;

CREATE POLICY "Page readers view page chunk embeddings"
ON public.page_chunk_embeddings
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.page_chunks c
  WHERE c.id = page_chunk_embeddings.chunk_id
    AND public.can_read_page(c.page_id)
));

CREATE POLICY "Page readers view page topics"
ON public.page_topics
FOR SELECT
TO authenticated
USING (public.can_read_page(page_topics.page_id));

CREATE POLICY "Page readers view page topic jobs"
ON public.page_topic_jobs
FOR SELECT
TO authenticated
USING (public.can_read_page(page_topic_jobs.page_id));

GRANT SELECT ON public.page_chunk_embeddings TO authenticated;
GRANT SELECT ON public.page_topics TO authenticated;
GRANT SELECT ON public.page_topic_jobs TO authenticated;
GRANT ALL ON public.page_chunk_embeddings TO service_role;
GRANT ALL ON public.page_topics TO service_role;
GRANT ALL ON public.page_topic_jobs TO service_role;

ALTER FUNCTION public.claim_page_embedding_batch(integer, interval) RENAME TO claim_page_chunk_embedding_batch;
ALTER FUNCTION public.list_pages_due_for_semantics(interval, integer) RENAME TO list_pages_due_for_topics;
ALTER FUNCTION public.claim_page_semantic_job(interval) RENAME TO claim_page_topic_job;
ALTER FUNCTION public.enqueue_page_semantic_job(uuid, text) RENAME TO enqueue_page_topic_job;
ALTER FUNCTION public.apply_page_semantic_result(uuid, text, text, text, text, text) RENAME TO apply_page_topic_result;

CREATE OR REPLACE FUNCTION public.claim_page_chunk_embedding_batch(p_batch_size integer DEFAULT 20, p_stale_after interval DEFAULT '00:10:00'::interval)
 RETURNS SETOF public.page_chunk_embeddings
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT s.id
    FROM (
      SELECT pe.id, 0 AS stage, pe.next_retry_at, pe.created_at
      FROM public.page_chunk_embeddings pe
      WHERE pe.embedding_status = 'PROCESSING'
        AND pe.updated_at < now() - p_stale_after
      UNION ALL
      SELECT pe.id, 1 AS stage, pe.next_retry_at, pe.created_at
      FROM public.page_chunk_embeddings pe
      WHERE pe.embedding_status IN ('QUEUED', 'RETRY_WAIT')
        AND (pe.next_retry_at IS NULL OR pe.next_retry_at <= now())
    ) s
    ORDER BY s.stage, s.next_retry_at NULLS FIRST, s.created_at
    LIMIT p_batch_size
  ),
  locked AS (
    SELECT pe.id
    FROM public.page_chunk_embeddings pe
    WHERE pe.id IN (SELECT id FROM candidates)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.page_chunk_embeddings pe
  SET embedding_status = 'PROCESSING',
      updated_at = now()
  WHERE pe.id IN (SELECT id FROM locked)
  RETURNING pe.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_pages_due_for_topics(p_idle interval DEFAULT '00:05:00'::interval, p_limit integer DEFAULT 20)
 RETURNS TABLE(page_id uuid, title text, plain_text text, page_snapshot text, page_snapshot_hash text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    p.id AS page_id,
    p.title,
    p.plain_text,
    s.page_snapshot,
    s.page_snapshot_hash
  FROM public.pages p
  LEFT JOIN public.page_topics s ON s.page_id = p.id
  WHERE p.last_modified_at <= now() - p_idle
    AND (
      (
        length(trim(coalesce(p.plain_text, ''))) > 0
        AND (
          s.page_id IS NULL
          OR encode(extensions.digest(convert_to(p.plain_text, 'UTF8'), 'sha256'), 'hex') <> s.page_snapshot_hash
        )
      )
      OR (
        length(trim(coalesce(p.plain_text, ''))) = 0
        AND s.page_id IS NOT NULL
      )
    )
  ORDER BY p.last_modified_at ASC, p.id ASC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$function$;

CREATE OR REPLACE FUNCTION public.claim_page_topic_job(p_stale_after interval DEFAULT '00:10:00'::interval)
 RETURNS public.page_topic_jobs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed public.page_topic_jobs;
  locked_id uuid;
BEGIN
  UPDATE public.page_topic_jobs j
  SET status = 'QUEUED', started_at = NULL, updated_at = now()
  WHERE j.status = 'PROCESSING'
    AND j.started_at IS NOT NULL
    AND j.started_at < now() - p_stale_after;

  SELECT j.id INTO locked_id
  FROM public.page_topic_jobs j
  WHERE j.status IN ('QUEUED','RETRY_WAIT')
    AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
  ORDER BY j.created_at, j.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF locked_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.page_topic_jobs j
  SET status = 'PROCESSING',
      started_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  WHERE j.id = locked_id
  RETURNING j.* INTO claimed;

  RETURN claimed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_page_topic_job(p_page_id uuid, p_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.page_topic_jobs;
BEGIN
  SELECT * INTO existing
  FROM public.page_topic_jobs j
  WHERE j.page_id = p_page_id
    AND j.status IN ('QUEUED','PROCESSING','RETRY_WAIT')
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status = 'PROCESSING' THEN
      RETURN 'processing';
    END IF;

    UPDATE public.page_topic_jobs
    SET page_snapshot_hash = p_hash,
        status = 'QUEUED',
        next_retry_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = existing.id;

    RETURN 'requeued';
  END IF;

  INSERT INTO public.page_topic_jobs (page_id, page_snapshot_hash)
  VALUES (p_page_id, p_hash);

  RETURN 'enqueued';
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_page_topic_result(p_job_id uuid, p_topic_name text, p_topic_description text, p_page_snapshot text, p_page_snapshot_hash text, p_llm_model text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  j public.page_topic_jobs;
  live_text text;
  live_hash text;
BEGIN
  SELECT * INTO j
  FROM public.page_topic_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF j.status <> 'PROCESSING' THEN
    RETURN 'not_processing';
  END IF;

  SELECT p.plain_text INTO live_text FROM public.pages p WHERE p.id = j.page_id;

  IF live_text IS NULL OR length(trim(live_text)) = 0 THEN
    UPDATE public.page_topic_jobs
    SET status = 'COMPLETED', completed_at = now(), last_error = NULL,
        next_retry_at = NULL, started_at = NULL, updated_at = now()
    WHERE id = p_job_id;
    RETURN 'drifted';
  END IF;

  live_hash := encode(extensions.digest(convert_to(live_text, 'UTF8'), 'sha256'), 'hex');

  IF live_hash <> p_page_snapshot_hash THEN
    UPDATE public.page_topic_jobs
    SET status = 'COMPLETED', completed_at = now(), last_error = NULL,
        next_retry_at = NULL, started_at = NULL, updated_at = now()
    WHERE id = p_job_id;
    RETURN 'drifted';
  END IF;

  INSERT INTO public.page_topics (
    page_id, topic_name, topic_description, page_snapshot, page_snapshot_hash, llm_model
  ) VALUES (
    j.page_id, p_topic_name, p_topic_description, p_page_snapshot, p_page_snapshot_hash, p_llm_model
  )
  ON CONFLICT (page_id) DO UPDATE
  SET topic_name = EXCLUDED.topic_name,
      topic_description = EXCLUDED.topic_description,
      page_snapshot = EXCLUDED.page_snapshot,
      page_snapshot_hash = EXCLUDED.page_snapshot_hash,
      llm_model = EXCLUDED.llm_model;

  UPDATE public.page_topic_jobs
  SET status = 'COMPLETED', completed_at = now(), last_error = NULL,
      next_retry_at = NULL, started_at = NULL, updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_page_chunk_embedding_batch(integer, interval) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_pages_due_for_topics(interval, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_page_topic_job(interval) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_page_topic_job(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_page_topic_result(uuid, text, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_page_chunk_embedding_batch(integer, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_pages_due_for_topics(interval, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_page_topic_job(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_page_topic_job(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_page_topic_result(uuid, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.search_pages_semantic(p_workspace_id uuid, p_embedding vector, p_limit integer, p_similarity_threshold real DEFAULT 0.3, p_weight_similarity real DEFAULT 0.85, p_weight_recency real DEFAULT 0.15, p_recency_half_life_days real DEFAULT 180, p_embedding_model text DEFAULT 'text-embedding-3-small'::text)
 RETURNS TABLE(asset_id uuid, title text, match_text text, matched_field public.search_matched_field, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH nearest AS (
    SELECT
      p.id                AS page_id,
      p.title             AS page_title,
      p.last_modified_at,
      c.content,
      (1 - (pe.embedding <=> p_embedding)) AS semantic_similarity
    FROM public.page_chunk_embeddings pe
    JOIN public.page_chunks c ON c.id = pe.chunk_id
    JOIN public.pages p ON p.id = c.page_id
    WHERE p.workspace_id = p_workspace_id
      AND pe.embedding_status = 'EMBEDDED'
      AND pe.embedding_model = p_embedding_model
    ORDER BY pe.embedding <=> p_embedding
    LIMIT p_limit * 3
  ),
  filtered AS (
    SELECT *
    FROM nearest
    WHERE semantic_similarity >= p_similarity_threshold
  ),
  scored AS (
    SELECT
      f.page_id,
      f.page_title,
      f.content,
      (
        p_weight_similarity * f.semantic_similarity
        + p_weight_recency * exp(
            -EXTRACT(EPOCH FROM (now() - f.last_modified_at))
            / 86400.0
            / p_recency_half_life_days
          )
      )::float4 AS final_score,
      ROW_NUMBER() OVER (
        PARTITION BY f.page_id
        ORDER BY (
          p_weight_similarity * f.semantic_similarity
          + p_weight_recency * exp(
              -EXTRACT(EPOCH FROM (now() - f.last_modified_at))
              / 86400.0
              / p_recency_half_life_days
            )
        ) DESC
      ) AS rn
    FROM filtered f
  )
  SELECT
    s.page_id    AS asset_id,
    s.page_title AS title,
    s.content    AS match_text,
    'content'::public.search_matched_field AS matched_field,
    s.final_score AS score
  FROM scored s
  WHERE s.rn = 1
  ORDER BY s.final_score DESC
  LIMIT p_limit;
$function$;

-- =========================
-- PART 2: page_topic_embeddings
-- =========================
CREATE TABLE public.page_topic_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid NOT NULL UNIQUE REFERENCES public.page_topics(page_id) ON DELETE CASCADE,
  embedding vector(1536),
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_status public.page_embedding_status NOT NULL DEFAULT 'QUEUED',
  checksum text NOT NULL CHECK (length(checksum) = 64),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at timestamptz,
  last_error text,
  embedded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_topic_embeddings_page_model_key UNIQUE (page_id, embedding_model),
  CONSTRAINT page_topic_embeddings_embedded_requires_vector
    CHECK (embedding_status <> 'EMBEDDED' OR embedding IS NOT NULL)
);

GRANT SELECT ON public.page_topic_embeddings TO authenticated;
GRANT ALL ON public.page_topic_embeddings TO service_role;

ALTER TABLE public.page_topic_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Page readers view page topic embeddings"
ON public.page_topic_embeddings
FOR SELECT
TO authenticated
USING (public.can_read_page(page_topic_embeddings.page_id));

CREATE INDEX idx_page_topic_embeddings_claimable
  ON public.page_topic_embeddings (next_retry_at, created_at)
  WHERE embedding_status IN ('QUEUED', 'RETRY_WAIT');

CREATE INDEX idx_page_topic_embeddings_queue
  ON public.page_topic_embeddings (embedding_status, next_retry_at, created_at);

CREATE INDEX idx_page_topic_embeddings_vector
  ON public.page_topic_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding_status = 'EMBEDDED';

CREATE OR REPLACE FUNCTION public.set_page_topic_embeddings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_page_topic_embeddings_updated_at
BEFORE UPDATE ON public.page_topic_embeddings
FOR EACH ROW EXECUTE FUNCTION public.set_page_topic_embeddings_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_page_topic_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_checksum text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.topic_name IS NOT DISTINCT FROM OLD.topic_name
     AND NEW.topic_description IS NOT DISTINCT FROM OLD.topic_description THEN
    RETURN NEW;
  END IF;

  v_checksum := encode(
    extensions.digest(
      convert_to(coalesce(NEW.topic_name, '') || ': ' || coalesce(NEW.topic_description, ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.page_topic_embeddings (page_id, checksum)
  VALUES (NEW.page_id, v_checksum)
  ON CONFLICT (page_id) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      embedding_status = 'QUEUED',
      attempts = 0,
      next_retry_at = NULL,
      last_error = NULL,
      updated_at = now();

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_page_topics_enqueue_embedding
AFTER INSERT OR UPDATE OF topic_name, topic_description ON public.page_topics
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_page_topic_embedding();

CREATE OR REPLACE FUNCTION public.claim_page_topic_embedding_batch(p_batch_size integer DEFAULT 20, p_stale_after interval DEFAULT '00:10:00'::interval)
 RETURNS SETOF public.page_topic_embeddings
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT s.id
    FROM (
      SELECT te.id, 0 AS stage, te.next_retry_at, te.created_at
      FROM public.page_topic_embeddings te
      WHERE te.embedding_status = 'PROCESSING'
        AND te.updated_at < now() - p_stale_after
      UNION ALL
      SELECT te.id, 1 AS stage, te.next_retry_at, te.created_at
      FROM public.page_topic_embeddings te
      WHERE te.embedding_status IN ('QUEUED', 'RETRY_WAIT')
        AND (te.next_retry_at IS NULL OR te.next_retry_at <= now())
    ) s
    ORDER BY s.stage, s.next_retry_at NULLS FIRST, s.created_at
    LIMIT p_batch_size
  ),
  locked AS (
    SELECT te.id
    FROM public.page_topic_embeddings te
    WHERE te.id IN (SELECT id FROM candidates)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.page_topic_embeddings te
  SET embedding_status = 'PROCESSING',
      updated_at = now()
  WHERE te.id IN (SELECT id FROM locked)
  RETURNING te.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_page_topic_embedding_batch(integer, interval) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_page_topic_embedding_batch(integer, interval) TO service_role;

INSERT INTO public.page_topic_embeddings (page_id, checksum, embedding_model)
SELECT
  t.page_id,
  encode(extensions.digest(convert_to(coalesce(t.topic_name,'') || ': ' || coalesce(t.topic_description,''), 'UTF8'), 'sha256'), 'hex'),
  'text-embedding-3-small'
FROM public.page_topics t
ON CONFLICT (page_id) DO NOTHING;