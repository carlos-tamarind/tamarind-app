-- Enum
CREATE TYPE public.page_semantic_job_status AS ENUM ('QUEUED','PROCESSING','RETRY_WAIT','COMPLETED','FAILED');

-- page_semantics
CREATE TABLE public.page_semantics (
  page_id uuid PRIMARY KEY REFERENCES public.pages(id) ON DELETE CASCADE,
  topic_name text NOT NULL CHECK (length(trim(topic_name)) > 0),
  topic_description text NOT NULL CHECK (length(trim(topic_description)) > 0),
  page_snapshot text NOT NULL CHECK (length(trim(page_snapshot)) > 0),
  page_snapshot_hash text NOT NULL CHECK (length(page_snapshot_hash) = 64),
  llm_model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.page_semantics TO authenticated;
GRANT ALL ON public.page_semantics TO service_role;
ALTER TABLE public.page_semantics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Page readers view page semantics"
ON public.page_semantics
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.pages p WHERE p.id = page_semantics.page_id));

CREATE OR REPLACE FUNCTION public.set_page_semantics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_page_semantics_updated_at
BEFORE UPDATE ON public.page_semantics
FOR EACH ROW EXECUTE FUNCTION public.set_page_semantics_updated_at();

-- page_semantic_jobs
CREATE TABLE public.page_semantic_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  page_snapshot_hash text NOT NULL,
  status public.page_semantic_job_status NOT NULL DEFAULT 'QUEUED',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.page_semantic_jobs TO authenticated;
GRANT ALL ON public.page_semantic_jobs TO service_role;
ALTER TABLE public.page_semantic_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Page readers view page semantic jobs"
ON public.page_semantic_jobs
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.pages p WHERE p.id = page_semantic_jobs.page_id));

CREATE UNIQUE INDEX uniq_page_semantic_jobs_inflight
ON public.page_semantic_jobs (page_id)
WHERE status IN ('QUEUED','PROCESSING','RETRY_WAIT');

CREATE INDEX idx_page_semantic_jobs_claimable
ON public.page_semantic_jobs (next_retry_at, created_at)
WHERE status IN ('QUEUED','RETRY_WAIT');

CREATE INDEX idx_page_semantic_jobs_queue
ON public.page_semantic_jobs (status, next_retry_at, created_at);

CREATE OR REPLACE FUNCTION public.set_page_semantic_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_page_semantic_jobs_updated_at
BEFORE UPDATE ON public.page_semantic_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_page_semantic_jobs_updated_at();

-- RPC: due pages
CREATE OR REPLACE FUNCTION public.list_pages_due_for_semantics(
  p_idle interval DEFAULT '00:05:00'::interval,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  page_id uuid,
  title text,
  plain_text text,
  page_snapshot text,
  page_snapshot_hash text
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    p.id AS page_id,
    p.title,
    p.plain_text,
    s.page_snapshot,
    s.page_snapshot_hash
  FROM public.pages p
  LEFT JOIN public.page_semantics s ON s.page_id = p.id
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
$$;

REVOKE ALL ON FUNCTION public.list_pages_due_for_semantics(interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_pages_due_for_semantics(interval, integer) TO service_role;

-- RPC: claim job
CREATE OR REPLACE FUNCTION public.claim_page_semantic_job(
  p_stale_after interval DEFAULT '00:10:00'::interval
)
RETURNS public.page_semantic_jobs
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  claimed public.page_semantic_jobs;
  locked_id uuid;
BEGIN
  UPDATE public.page_semantic_jobs j
  SET status = 'QUEUED', started_at = NULL, updated_at = now()
  WHERE j.status = 'PROCESSING'
    AND j.started_at IS NOT NULL
    AND j.started_at < now() - p_stale_after;

  SELECT j.id INTO locked_id
  FROM public.page_semantic_jobs j
  WHERE j.status IN ('QUEUED','RETRY_WAIT')
    AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
  ORDER BY j.created_at, j.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF locked_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.page_semantic_jobs j
  SET status = 'PROCESSING',
      started_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  WHERE j.id = locked_id
  RETURNING j.* INTO claimed;

  RETURN claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_page_semantic_job(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_page_semantic_job(interval) TO service_role;

-- RPC: enqueue
CREATE OR REPLACE FUNCTION public.enqueue_page_semantic_job(
  p_page_id uuid,
  p_hash text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing public.page_semantic_jobs;
BEGIN
  SELECT * INTO existing
  FROM public.page_semantic_jobs j
  WHERE j.page_id = p_page_id
    AND j.status IN ('QUEUED','PROCESSING','RETRY_WAIT')
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status = 'PROCESSING' THEN
      RETURN 'processing';
    END IF;

    UPDATE public.page_semantic_jobs
    SET page_snapshot_hash = p_hash,
        status = 'QUEUED',
        next_retry_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = existing.id;

    RETURN 'requeued';
  END IF;

  INSERT INTO public.page_semantic_jobs (page_id, page_snapshot_hash)
  VALUES (p_page_id, p_hash);

  RETURN 'enqueued';
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_page_semantic_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_page_semantic_job(uuid, text) TO service_role;

-- RPC: apply result
CREATE OR REPLACE FUNCTION public.apply_page_semantic_result(
  p_job_id uuid,
  p_topic_name text,
  p_topic_description text,
  p_page_snapshot text,
  p_page_snapshot_hash text,
  p_llm_model text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  j public.page_semantic_jobs;
  live_text text;
  live_hash text;
BEGIN
  SELECT * INTO j
  FROM public.page_semantic_jobs
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
    UPDATE public.page_semantic_jobs
    SET status = 'COMPLETED', completed_at = now(), last_error = NULL,
        next_retry_at = NULL, started_at = NULL, updated_at = now()
    WHERE id = p_job_id;
    RETURN 'drifted';
  END IF;

  live_hash := encode(extensions.digest(convert_to(live_text, 'UTF8'), 'sha256'), 'hex');

  IF live_hash <> p_page_snapshot_hash THEN
    UPDATE public.page_semantic_jobs
    SET status = 'COMPLETED', completed_at = now(), last_error = NULL,
        next_retry_at = NULL, started_at = NULL, updated_at = now()
    WHERE id = p_job_id;
    RETURN 'drifted';
  END IF;

  INSERT INTO public.page_semantics (
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

  UPDATE public.page_semantic_jobs
  SET status = 'COMPLETED', completed_at = now(), last_error = NULL,
      next_retry_at = NULL, started_at = NULL, updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_page_semantic_result(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_page_semantic_result(uuid, text, text, text, text, text) TO service_role;