export const KB_CONFIG = {
  // Passed to get_canonical_topic_graph_for_user; the RPC clamps to [1, 1000].
  MAX_NODES: 400,
  SEMANTIC_NEIGHBORS: 5,
  SEMANTIC_MIN_SIMILARITY: 0.3,

  // Ids per `.in()` request on the RLS cross-check, keeping URLs short.
  RLS_CHECK_BATCH_SIZE: 100,

  MAX_EVIDENCE_ITEMS: 200,

  // Recency → node alpha.
  RECENCY_HALF_LIFE_DAYS: 30,
  MIN_NODE_ALPHA: 0.35,

  // Evidence volume → node size.
  MIN_NODE_WIDTH: 160,
  MAX_NODE_WIDTH: 280,
  MIN_TITLE_FONT_PX: 13,
  MAX_TITLE_FONT_PX: 18,

  GRAPH_STALE_TIME_MS: 60_000,
} as const;
