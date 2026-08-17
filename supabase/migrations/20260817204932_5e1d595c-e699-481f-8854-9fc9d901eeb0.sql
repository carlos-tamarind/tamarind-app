CREATE INDEX IF NOT EXISTS idx_pages_last_modified_at ON public.pages (last_modified_at);

CREATE OR REPLACE FUNCTION public.list_pages_due_for_chunking(
  p_idle interval DEFAULT '5 minutes',
  p_limit int DEFAULT 20
)
RETURNS SETOF public.pages
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.pages p
  WHERE p.last_modified_at <= now() - p_idle
    AND (
      (
        length(trim(coalesce(p.plain_text, ''))) > 0
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.page_chunks c WHERE c.page_id = p.id
          )
          OR (
            SELECT max(c.updated_at)
            FROM public.page_chunks c
            WHERE c.page_id = p.id
          ) < p.last_modified_at
        )
      )
      OR (
        length(trim(coalesce(p.plain_text, ''))) = 0
        AND EXISTS (
          SELECT 1 FROM public.page_chunks c WHERE c.page_id = p.id
        )
      )
    )
  ORDER BY p.last_modified_at ASC, p.id ASC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.list_pages_due_for_chunking(interval, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_pages_due_for_chunking(interval, int) FROM anon;
REVOKE ALL ON FUNCTION public.list_pages_due_for_chunking(interval, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_pages_due_for_chunking(interval, int) TO service_role;