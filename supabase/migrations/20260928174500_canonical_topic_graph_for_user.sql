CREATE OR REPLACE FUNCTION public.canonical_topic_visible_for_user(p_workspace_user_id uuid, p_topic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM canonical_topics t
    JOIN workspace_users wu ON wu.id = p_workspace_user_id AND wu.workspace_id = t.workspace_id
    WHERE t.id = p_topic_id
      AND EXISTS (SELECT 1 FROM canonical_topic_evidences e WHERE e.canonical_topic_id = t.id)
      AND NOT EXISTS (
        SELECT 1 FROM canonical_topic_evidences e
        WHERE e.canonical_topic_id = t.id
          AND NOT (
            CASE e.source_type
              WHEN 'conversation_topic' THEN public.is_conversation_participant_as(e.owning_entity_id, p_workspace_user_id)
              WHEN 'page_topic' THEN EXISTS (
                SELECT 1 FROM pages p WHERE p.id = e.owning_entity_id AND p.purged_at IS NULL
              ) AND public.can_read_page_as(e.owning_entity_id, p_workspace_user_id)
              ELSE false
            END
          )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_canonical_topic_graph_for_user(
  p_workspace_user_id uuid,
  p_workspace_id uuid,
  p_max_nodes integer DEFAULT 400,
  p_neighbors integer DEFAULT 5,
  p_min_similarity real DEFAULT 0.3
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int := LEAST(GREATEST(COALESCE(p_max_nodes, 400), 1), 1000);
  v_nb int := LEAST(GREATEST(COALESCE(p_neighbors, 5), 1), 20);
  v_min real := LEAST(GREATEST(COALESCE(p_min_similarity, 0.3), 0), 1);
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = p_workspace_user_id AND workspace_id = p_workspace_id) THEN
    RETURN jsonb_build_object('nodes', '[]'::jsonb, 'context_edges', '[]'::jsonb, 'semantic_links', '[]'::jsonb);
  END IF;

  WITH visible AS (
    SELECT t.* FROM canonical_topics t
    WHERE t.workspace_id = p_workspace_id
      AND EXISTS (SELECT 1 FROM canonical_topic_evidences e WHERE e.canonical_topic_id = t.id)
      AND NOT EXISTS (
        SELECT 1 FROM canonical_topic_evidences e
        WHERE e.canonical_topic_id = t.id
          AND NOT (
            CASE e.source_type
              WHEN 'conversation_topic' THEN public.is_conversation_participant_as(e.owning_entity_id, p_workspace_user_id)
              WHEN 'page_topic' THEN EXISTS (
                SELECT 1 FROM pages p WHERE p.id = e.owning_entity_id AND p.purged_at IS NULL
              ) AND public.can_read_page_as(e.owning_entity_id, p_workspace_user_id)
              ELSE false
            END
          )
      )
  ),
  kept AS (
    SELECT * FROM visible ORDER BY evidence_count DESC, id LIMIT v_max
  ),
  nodes AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', k.id, 'name', k.name, 'description', k.description,
      'evidence_count', k.evidence_count,
      'last_activity_at', COALESCE(k.last_evidence_at, k.updated_at)
    ) ORDER BY k.evidence_count DESC, k.id), '[]'::jsonb) AS j FROM kept k
  ),
  ctx AS (
    SELECT a.canonical_topic_id AS source, b.canonical_topic_id AS target,
           CASE a.source_type WHEN 'conversation_topic' THEN 'conversation' ELSE 'page' END AS kind,
           count(DISTINCT a.owning_entity_id) AS weight
    FROM canonical_topic_evidences a
    JOIN canonical_topic_evidences b
      ON b.source_type = a.source_type AND b.owning_entity_id = a.owning_entity_id
     AND a.canonical_topic_id < b.canonical_topic_id
    WHERE a.canonical_topic_id IN (SELECT id FROM kept)
      AND b.canonical_topic_id IN (SELECT id FROM kept)
    GROUP BY 1, 2, 3
  ),
  ctx_j AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'target', target, 'kind', kind, 'weight', weight)), '[]'::jsonb) AS j FROM ctx
  ),
  nn AS (
    SELECT DISTINCT LEAST(k.id, n.id) AS source, GREATEST(k.id, n.id) AS target, n.sim
    FROM kept k
    CROSS JOIN LATERAL (
      SELECT k2.id, (1 - (k.embedding <=> k2.embedding))::real AS sim
      FROM kept k2 WHERE k2.id <> k.id
      ORDER BY k.embedding <=> k2.embedding
      LIMIT v_nb
    ) n
    WHERE n.sim >= v_min
  ),
  nn_j AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'target', target, 'similarity', sim)), '[]'::jsonb) AS j FROM nn
  )
  SELECT jsonb_build_object('nodes', nodes.j, 'context_edges', ctx_j.j, 'semantic_links', nn_j.j)
  INTO v_result FROM nodes, ctx_j, nn_j;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.canonical_topic_visible_for_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_canonical_topic_graph_for_user(uuid, uuid, integer, integer, real) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_topic_visible_for_user(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_canonical_topic_graph_for_user(uuid, uuid, integer, integer, real) TO service_role;