-- Canonical Topics — database foundations
-- Enums
CREATE TYPE public.canonical_topic_job_status AS ENUM ('QUEUED', 'PROCESSING', 'RETRY_WAIT', 'COMPLETED', 'QUARANTINED');
CREATE TYPE public.canonical_topic_job_type AS ENUM ('ADD', 'REMOVE');

-- Source-type registry
CREATE TABLE public.canonical_topic_source_types (
  source_type text PRIMARY KEY,
  table_name text NOT NULL,
  owning_entity_column text NOT NULL,
  owning_table_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.canonical_topic_source_types TO service_role;
ALTER TABLE public.canonical_topic_source_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.canonical_topic_source_types FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.canonical_topic_source_types (source_type, table_name, owning_entity_column, owning_table_name) VALUES
  ('page_topic', 'page_topics', 'page_id', 'pages'),
  ('conversation_topic', 'conversation_topics', 'conversation_id', 'conversations');

-- Canonical topics
CREATE TABLE public.canonical_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name <> ''),
  description text NOT NULL CHECK (description <> ''),
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  evidence_count integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  regenerated_at timestamptz,
  generation_model text,
  last_evidence_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canonical_topics TO service_role;
ALTER TABLE public.canonical_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can read canonical topics" ON public.canonical_topics FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE INDEX idx_canonical_topics_workspace_id ON public.canonical_topics (workspace_id);
CREATE INDEX idx_canonical_topics_embedding ON public.canonical_topics USING hnsw (embedding vector_cosine_ops);

-- Canonical topic evidences
CREATE TABLE public.canonical_topic_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_topic_id uuid NOT NULL REFERENCES public.canonical_topics(id) ON DELETE CASCADE,
  source_type text NOT NULL REFERENCES public.canonical_topic_source_types(source_type),
  source_id uuid NOT NULL,
  owning_entity_id uuid NOT NULL,
  similarity real,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_topic_id, source_type, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canonical_topic_evidences TO service_role;
ALTER TABLE public.canonical_topic_evidences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can read canonical topic evidences" ON public.canonical_topic_evidences FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.canonical_topics t
    WHERE t.id = canonical_topic_evidences.canonical_topic_id
      AND public.is_workspace_member(t.workspace_id)
  )
);
CREATE INDEX idx_canonical_topic_evidences_source ON public.canonical_topic_evidences (source_type, source_id);
CREATE INDEX idx_canonical_topic_evidences_topic ON public.canonical_topic_evidences (canonical_topic_id);

-- Validation trigger for evidence inserts
CREATE OR REPLACE FUNCTION public.validate_canonical_topic_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg public.canonical_topic_source_types;
  v_owning_entity_id uuid;
  v_source_workspace_id uuid;
  v_topic_workspace_id uuid;
BEGIN
  SELECT * INTO v_reg FROM public.canonical_topic_source_types WHERE source_type = NEW.source_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown canonical topic source type: %', NEW.source_type;
  END IF;

  EXECUTE format(
    'SELECT %I FROM public.%I WHERE id = $1',
    v_reg.owning_entity_column,
    v_reg.table_name
  ) USING NEW.source_id INTO v_owning_entity_id;

  IF v_owning_entity_id IS NULL THEN
    RAISE EXCEPTION 'Source row not found for % %', NEW.source_type, NEW.source_id;
  END IF;

  EXECUTE format(
    'SELECT workspace_id FROM public.%I WHERE id = $1',
    v_reg.owning_table_name
  ) USING v_owning_entity_id INTO v_source_workspace_id;

  SELECT workspace_id INTO v_topic_workspace_id FROM public.canonical_topics WHERE id = NEW.canonical_topic_id;
  IF v_topic_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Canonical topic not found: %', NEW.canonical_topic_id;
  END IF;

  IF v_source_workspace_id IS DISTINCT FROM v_topic_workspace_id THEN
    RAISE EXCEPTION 'Workspace mismatch for canonical topic evidence';
  END IF;

  NEW.owning_entity_id := v_owning_entity_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_canonical_topic_evidence
  BEFORE INSERT ON public.canonical_topic_evidences
  FOR EACH ROW EXECUTE FUNCTION public.validate_canonical_topic_evidence();

-- Canonical topic jobs
CREATE TABLE public.canonical_topic_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_type text NOT NULL REFERENCES public.canonical_topic_source_types(source_type),
  source_id uuid NOT NULL,
  job_type public.canonical_topic_job_type NOT NULL,
  status public.canonical_topic_job_status NOT NULL DEFAULT 'QUEUED',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canonical_topic_jobs TO service_role;
ALTER TABLE public.canonical_topic_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.canonical_topic_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_canonical_topic_jobs_claimable ON public.canonical_topic_jobs (status, next_retry_at, created_at, id)
  WHERE status IN ('QUEUED', 'RETRY_WAIT');
CREATE UNIQUE INDEX uniq_canonical_topic_jobs_source_inflight
  ON public.canonical_topic_jobs (source_type, source_id)
  WHERE status = 'PROCESSING';

-- Updated-at triggers
CREATE OR REPLACE FUNCTION public.set_canonical_topics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.set_canonical_topic_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_canonical_topics_updated_at
  BEFORE UPDATE ON public.canonical_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_canonical_topics_updated_at();

CREATE TRIGGER trg_canonical_topic_evidences_updated_at
  BEFORE UPDATE ON public.canonical_topic_evidences
  FOR EACH ROW EXECUTE FUNCTION public.set_canonical_topics_updated_at();

CREATE TRIGGER trg_canonical_topic_jobs_updated_at
  BEFORE UPDATE ON public.canonical_topic_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_canonical_topic_jobs_updated_at();

-- RPC: match canonical topics
CREATE OR REPLACE FUNCTION public.match_canonical_topics(
  p_workspace_id uuid,
  p_embedding vector(1536),
  p_limit integer DEFAULT 10
) RETURNS TABLE (
  id uuid,
  name text,
  description text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.description,
    1 - (t.embedding <=> p_embedding) AS similarity
  FROM public.canonical_topics t
  WHERE t.workspace_id = p_workspace_id
  ORDER BY t.embedding <=> p_embedding
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.match_canonical_topics(uuid, vector(1536), integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_canonical_topics(uuid, vector(1536), integer) TO service_role;

-- RPC: enqueue canonical topic job
CREATE OR REPLACE FUNCTION public.enqueue_canonical_topic_job(
  p_workspace_id uuid,
  p_job_type public.canonical_topic_job_type,
  p_source_type text,
  p_source_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  INSERT INTO public.canonical_topic_jobs (workspace_id, source_type, source_id, job_type)
  VALUES (p_workspace_id, p_source_type, p_source_id, p_job_type)
  RETURNING id INTO v_job_id;
  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_canonical_topic_job(uuid, public.canonical_topic_job_type, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_canonical_topic_job(uuid, public.canonical_topic_job_type, text, uuid) TO service_role;

-- RPC: claim canonical topic job
CREATE OR REPLACE FUNCTION public.claim_canonical_topic_job(
  p_stale_after interval DEFAULT '00:10:00'::interval
) RETURNS public.canonical_topic_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.canonical_topic_jobs;
  locked_id uuid;
BEGIN
  UPDATE public.canonical_topic_jobs j
  SET status = 'QUEUED', started_at = NULL, updated_at = now()
  WHERE j.status = 'PROCESSING'
    AND j.started_at IS NOT NULL
    AND j.started_at < now() - p_stale_after;

  SELECT j.id INTO locked_id
  FROM public.canonical_topic_jobs j
  WHERE j.status IN ('QUEUED', 'RETRY_WAIT')
    AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
    AND NOT EXISTS (
      SELECT 1 FROM public.canonical_topic_jobs j2
      WHERE j2.source_type = j.source_type
        AND j2.source_id = j.source_id
        AND j2.status = 'PROCESSING'
    )
  ORDER BY j.created_at, j.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF locked_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.canonical_topic_jobs j
  SET status = 'PROCESSING',
      started_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  WHERE j.id = locked_id
  RETURNING j.* INTO claimed;

  RETURN claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_canonical_topic_job(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_canonical_topic_job(interval) TO service_role;

-- RPC: apply add and commit
CREATE OR REPLACE FUNCTION public.apply_canonical_topic_add_and_commit(
  p_job_id uuid,
  p_result jsonb DEFAULT '{}'::jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  j public.canonical_topic_jobs;
  v_topic_id uuid;
  v_name text;
  v_description text;
  v_embedding vector(1536);
  v_embedding_model text;
  v_owning_entity_id uuid;
  v_similarity real;
  v_decision text;
  v_existing_id uuid;
  v_match_threshold double precision := 0.92;
  v_matched_id uuid;
  v_should_update_embedding boolean;
BEGIN
  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(j.workspace_id::text, 1));

  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id FOR UPDATE;
  IF j.status <> 'PROCESSING' THEN
    RETURN 'not_processing';
  END IF;

  v_name := NULLIF(p_result->>'name', '');
  v_description := NULLIF(p_result->>'description', '');
  v_embedding := CASE WHEN p_result ? 'embedding' AND p_result->>'embedding' IS NOT NULL THEN (p_result->>'embedding')::vector ELSE NULL END;
  v_embedding_model := COALESCE(NULLIF(p_result->>'embedding_model', ''), 'text-embedding-3-small');
  v_owning_entity_id := (p_result->>'owning_entity_id')::uuid;
  v_similarity := COALESCE((p_result->>'similarity')::real, 0);
  v_decision := COALESCE(p_result->>'decision', 'create');
  v_existing_id := (p_result->>'canonical_topic_id')::uuid;

  IF v_name IS NULL OR v_description IS NULL OR v_embedding IS NULL OR v_owning_entity_id IS NULL THEN
    RAISE EXCEPTION 'Missing required fields in add result for job %', p_job_id;
  END IF;

  -- If the caller asked to create, re-run the nearest-match check under the lock.
  IF v_decision = 'create' THEN
    SELECT t.id INTO v_matched_id
    FROM public.canonical_topics t
    WHERE t.workspace_id = j.workspace_id
      AND 1 - (t.embedding <=> v_embedding) >= v_match_threshold
    ORDER BY t.embedding <=> v_embedding
    LIMIT 1;

    IF v_matched_id IS NOT NULL THEN
      v_decision := 'reinforce';
      v_existing_id := v_matched_id;
    END IF;
  END IF;

  IF v_decision = 'reinforce' AND v_existing_id IS NOT NULL THEN
    SELECT embedding INTO v_embedding
    FROM public.canonical_topics
    WHERE id = v_existing_id
    FOR UPDATE;

    v_should_update_embedding := (p_result->>'update_embedding')::boolean;

    UPDATE public.canonical_topics
    SET
      name = CASE WHEN p_result ? 'name' THEN v_name ELSE name END,
      description = CASE WHEN p_result ? 'description' THEN v_description ELSE description END,
      embedding = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN v_embedding ELSE embedding END,
      embedding_model = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN v_embedding_model ELSE embedding_model END,
      evidence_count = evidence_count + 1,
      regenerated_at = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN now() ELSE regenerated_at END,
      generation_model = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN v_embedding_model ELSE generation_model END,
      last_evidence_at = now(),
      updated_at = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_topic_id;
  ELSE
    INSERT INTO public.canonical_topics (
      workspace_id, name, description, embedding, embedding_model,
      evidence_count, generated_at, generation_model, last_evidence_at
    ) VALUES (
      j.workspace_id, v_name, v_description, v_embedding, v_embedding_model,
      1, now(), v_embedding_model, now()
    )
    RETURNING id INTO v_topic_id;
  END IF;

  INSERT INTO public.canonical_topic_evidences (
    canonical_topic_id, source_type, source_id, owning_entity_id, similarity
  ) VALUES (
    v_topic_id, j.source_type, j.source_id, v_owning_entity_id, v_similarity
  );

  UPDATE public.canonical_topic_jobs
  SET status = 'COMPLETED', completed_at = now(), result = p_result, updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_canonical_topic_add_and_commit(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_canonical_topic_add_and_commit(uuid, jsonb) TO service_role;

-- RPC: apply remove and commit
CREATE OR REPLACE FUNCTION public.apply_canonical_topic_remove_and_commit(
  p_job_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.canonical_topic_jobs;
  affected_topic_id uuid;
  deleted_count integer;
BEGIN
  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id FOR UPDATE;
  IF j.status <> 'PROCESSING' THEN
    RETURN 'not_processing';
  END IF;

  FOR affected_topic_id IN
    DELETE FROM public.canonical_topic_evidences
    WHERE source_type = j.source_type AND source_id = j.source_id
    RETURNING canonical_topic_id
  LOOP
    UPDATE public.canonical_topics
    SET evidence_count = evidence_count - 1,
        updated_at = now()
    WHERE id = affected_topic_id;

    DELETE FROM public.canonical_topics
    WHERE id = affected_topic_id AND evidence_count <= 0;
  END LOOP;

  UPDATE public.canonical_topic_jobs
  SET status = 'COMPLETED', completed_at = now(), updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_canonical_topic_remove_and_commit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_canonical_topic_remove_and_commit(uuid) TO service_role;

-- Enqueue triggers
CREATE OR REPLACE FUNCTION public.enqueue_page_topic_canonical_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_page_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.pages WHERE id = OLD.page_id;
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'page_topic', OLD.page_id);
    RETURN OLD;
  END IF;

  SELECT workspace_id INTO v_workspace_id FROM public.pages WHERE id = NEW.page_id;
  v_page_id := NEW.page_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'page_topic', v_page_id);
    RETURN NEW;
  END IF;

  -- UPDATE: content drift -> REMOVE then ADD
  IF NEW.topic_name IS DISTINCT FROM OLD.topic_name
     OR NEW.topic_description IS DISTINCT FROM OLD.topic_description THEN
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'page_topic', v_page_id);
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'page_topic', v_page_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_page_topic_canonical_job
  AFTER INSERT OR UPDATE OR DELETE ON public.page_topics
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_page_topic_canonical_job();

CREATE OR REPLACE FUNCTION public.enqueue_conversation_topic_canonical_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_candidate THEN
      SELECT workspace_id INTO v_workspace_id FROM public.conversations WHERE id = OLD.conversation_id;
      PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'conversation_topic', OLD.id);
    END IF;
    RETURN OLD;
  END IF;

  SELECT workspace_id INTO v_workspace_id FROM public.conversations WHERE id = NEW.conversation_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_candidate THEN
      PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'conversation_topic', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.is_candidate IS FALSE AND NEW.is_candidate IS TRUE THEN
    -- promotion
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'conversation_topic', NEW.id);
  ELSIF OLD.is_candidate IS TRUE AND NEW.is_candidate IS FALSE THEN
    -- demotion
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'conversation_topic', NEW.id);
  ELSIF NEW.is_candidate AND (
       NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description) THEN
    -- content drift on established topic
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'conversation_topic', NEW.id);
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'conversation_topic', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversation_topic_canonical_job
  AFTER INSERT OR UPDATE OR DELETE ON public.conversation_topics
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_conversation_topic_canonical_job();