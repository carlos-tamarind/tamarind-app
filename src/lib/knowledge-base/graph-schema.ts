import { z } from "zod";

import type { KnowledgeGraph } from "./types";

// Shape of get_canonical_topic_graph_for_user's jsonb result. Parsed at runtime
// because the generated types only say `Json`.
const rpcGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      description: z.string(),
      evidence_count: z.number(),
      last_activity_at: z.string(),
    }),
  ),
  context_edges: z.array(
    z.object({
      source: z.string().uuid(),
      target: z.string().uuid(),
      kind: z.enum(["conversation", "page"]),
      weight: z.number(),
    }),
  ),
  semantic_links: z.array(
    z.object({
      source: z.string().uuid(),
      target: z.string().uuid(),
      similarity: z.number(),
    }),
  ),
});

export class KnowledgeGraphResponseError extends Error {
  constructor(public readonly issuePaths: string[]) {
    super("Knowledge graph response was malformed");
  }
}

export function parseKnowledgeGraphResponse(raw: unknown): KnowledgeGraph {
  const parsed = rpcGraphSchema.safeParse(raw);
  if (!parsed.success) {
    throw new KnowledgeGraphResponseError(
      parsed.error.issues.map((issue) => issue.path.join(".") || "(root)"),
    );
  }
  const { nodes, context_edges, semantic_links } = parsed.data;
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description,
      evidenceCount: node.evidence_count,
      lastActivityAt: node.last_activity_at,
    })),
    contextEdges: context_edges,
    semanticLinks: semantic_links,
  };
}
