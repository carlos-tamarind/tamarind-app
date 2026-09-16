-- Step 1: drop the dependent FK pinned to the old PK index
ALTER TABLE public.page_topic_embeddings
  DROP CONSTRAINT page_topic_embeddings_page_id_fkey;

-- Step 2: swap the page_topics primary key
ALTER TABLE public.page_topics
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.page_topics DROP CONSTRAINT page_topics_pkey;
ALTER TABLE public.page_topics ADD CONSTRAINT page_topics_page_id_key UNIQUE (page_id);
ALTER TABLE public.page_topics ADD CONSTRAINT page_topics_pkey PRIMARY KEY (id);

-- Step 3: repoint page_topic_embeddings
DROP POLICY IF EXISTS "Page readers view page topic embeddings" ON public.page_topic_embeddings;

ALTER TABLE public.page_topic_embeddings ADD COLUMN page_topic_id uuid;

UPDATE public.page_topic_embeddings e
SET page_topic_id = t.id
FROM public.page_topics t
WHERE t.page_id = e.page_id;

DELETE FROM public.page_topic_embeddings WHERE page_topic_id IS NULL;

ALTER TABLE public.page_topic_embeddings ALTER COLUMN page_topic_id SET NOT NULL;
ALTER TABLE public.page_topic_embeddings
  ADD CONSTRAINT page_topic_embeddings_page_topic_id_fkey
  FOREIGN KEY (page_topic_id) REFERENCES public.page_topics(id) ON DELETE CASCADE;
ALTER TABLE public.page_topic_embeddings
  ADD CONSTRAINT page_topic_embeddings_page_topic_id_key UNIQUE (page_topic_id);
ALTER TABLE public.page_topic_embeddings
  ADD CONSTRAINT page_topic_embeddings_topic_model_key UNIQUE (page_topic_id, embedding_model);

ALTER TABLE public.page_topic_embeddings DROP COLUMN page_id;

CREATE POLICY "Page readers view page topic embeddings"
ON public.page_topic_embeddings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.page_topics t
  WHERE t.id = page_topic_embeddings.page_topic_id
    AND public.can_read_page(t.page_id)
));

-- Step 4: trigger functions
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

  INSERT INTO public.page_topic_embeddings (page_topic_id, checksum)
  VALUES (NEW.id, v_checksum)
  ON CONFLICT (page_topic_id) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      embedding_status = 'QUEUED',
      attempts = 0,
      next_retry_at = NULL,
      last_error = NULL,
      updated_at = now();

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_page_topic_canonical_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.pages WHERE id = OLD.page_id;
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'page_topic', OLD.id);
    RETURN OLD;
  END IF;

  SELECT workspace_id INTO v_workspace_id FROM public.pages WHERE id = NEW.page_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'page_topic', NEW.id);
    RETURN NEW;
  END IF;

  -- UPDATE: content drift -> REMOVE then ADD
  IF NEW.topic_name IS DISTINCT FROM OLD.topic_name
     OR NEW.topic_description IS DISTINCT FROM OLD.topic_description THEN
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'page_topic', NEW.id);
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'page_topic', NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_page_topic_canonical_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_page_topic_embedding() FROM PUBLIC, anon, authenticated;

-- Step 5: backfill canonical rows
UPDATE public.canonical_topic_evidences e
SET source_id = t.id
FROM public.page_topics t
WHERE e.source_type = 'page_topic' AND t.page_id = e.source_id;

UPDATE public.canonical_topic_jobs j
SET source_id = t.id
FROM public.page_topics t
WHERE j.source_type = 'page_topic' AND t.page_id = j.source_id;

DELETE FROM public.canonical_topic_evidences
WHERE source_type = 'page_topic'
  AND source_id NOT IN (SELECT id FROM public.page_topics);

DELETE FROM public.canonical_topic_jobs
WHERE source_type = 'page_topic'
  AND source_id NOT IN (SELECT id FROM public.page_topics);