-- 1. Soft-delete columns
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS purged_at timestamptz NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS purged_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_pages_purged_at
  ON public.pages (purged_at) WHERE purged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_purged_at
  ON public.messages (purged_at) WHERE purged_at IS NOT NULL;

-- 2. Purgeable-type registry
CREATE TABLE IF NOT EXISTS public.purgeable_entity_types (
  entity_type_key text PRIMARY KEY,
  table_name text NOT NULL,
  purge_order integer NOT NULL DEFAULT 100
);

GRANT SELECT ON public.purgeable_entity_types TO service_role;
GRANT ALL ON public.purgeable_entity_types TO service_role;

ALTER TABLE public.purgeable_entity_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purgeable_entity_types_no_access" ON public.purgeable_entity_types;
CREATE POLICY "purgeable_entity_types_no_access"
  ON public.purgeable_entity_types FOR SELECT TO authenticated
  USING (false);

INSERT INTO public.purgeable_entity_types (entity_type_key, table_name, purge_order)
VALUES ('message', 'messages', 10), ('page', 'pages', 20)
ON CONFLICT (entity_type_key) DO UPDATE
  SET table_name = EXCLUDED.table_name, purge_order = EXCLUDED.purge_order;

-- 3. Trash clears pins
CREATE OR REPLACE FUNCTION public.unpin_on_page_purge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pinned_entities p
  WHERE p.entity_id = NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.unpin_on_page_purge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pages_unpin_on_purge ON public.pages;
CREATE TRIGGER trg_pages_unpin_on_purge
AFTER UPDATE OF purged_at ON public.pages
FOR EACH ROW
WHEN (OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL)
EXECUTE FUNCTION public.unpin_on_page_purge();

-- 4. Generic purge RPC
CREATE OR REPLACE FUNCTION public.purge_due_entities(p_entity_ids uuid[] DEFAULT NULL)
RETURNS TABLE(entity_type text, id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.entity_type_key, t.table_name
    FROM public.purgeable_entity_types t
    ORDER BY t.purge_order, t.entity_type_key
  LOOP
    RETURN QUERY EXECUTE format(
      'DELETE FROM public.%I d
         WHERE d.purged_at IS NOT NULL
           AND d.purged_at <= now()
           AND ($1 IS NULL OR d.id = ANY($1))
       RETURNING %L::text, d.id',
      r.table_name, r.entity_type_key
    ) USING p_entity_ids;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_due_entities(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_due_entities(uuid[]) TO service_role;