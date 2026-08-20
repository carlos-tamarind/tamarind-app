-- 1A. Drop entity_annotations
DROP POLICY IF EXISTS "Members view annotations" ON public.entity_annotations;
DROP TRIGGER IF EXISTS trg_annot_lm ON public.entity_annotations;
DROP INDEX IF EXISTS public.idx_annot_source;
DROP INDEX IF EXISTS public.idx_annot_target;
DROP TABLE IF EXISTS public.entity_annotations;
DROP TYPE IF EXISTS public.annotation_type;

-- 1B. conversation entity type
INSERT INTO public.entity_types (key, display_name)
VALUES ('conversation', 'Conversation')
ON CONFLICT (key) DO NOTHING;

-- 1C. Reshape entities
DROP INDEX IF EXISTS public.idx_entities_source;
DROP INDEX IF EXISTS public.idx_entities_embedding;
DROP INDEX IF EXISTS public.idx_entities_title_fts;

ALTER TABLE public.entities
  DROP CONSTRAINT IF EXISTS entities_workspace_id_entity_type_id_source_id_key;

ALTER TABLE public.entities
  DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS embedding;

ALTER TABLE public.entities
  ALTER COLUMN id DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_entities_workspace_type
  ON public.entities (workspace_id, entity_type_id);

COMMENT ON TABLE public.entities IS
  'Identity registry for workspace assets. id equals the source row PK (pages.id, messages.id, etc.).';
COMMENT ON COLUMN public.entities.id IS
  'Same UUID as the source asset; not auto-generated.';