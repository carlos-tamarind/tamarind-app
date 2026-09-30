import type { KnowledgeGraph } from "./types";

// Keeps only the nodes RLS agrees are readable, and every edge or link whose
// endpoints both survive. A non-empty `droppedIds` means the graph RPC and the
// RLS policy disagree about visibility — a drift signal, never shown to users.
export function reconcileGraphWithReadable(
  graph: KnowledgeGraph,
  readableIds: ReadonlySet<string>,
): { graph: KnowledgeGraph; droppedIds: string[] } {
  const droppedIds: string[] = [];
  const nodes = graph.nodes.filter((node) => {
    if (readableIds.has(node.id)) return true;
    droppedIds.push(node.id);
    return false;
  });
  if (droppedIds.length === 0) return { graph, droppedIds };

  const kept = new Set(nodes.map((node) => node.id));
  const bothKept = (edge: { source: string; target: string }) =>
    kept.has(edge.source) && kept.has(edge.target);

  return {
    graph: {
      nodes,
      contextEdges: graph.contextEdges.filter(bothKept),
      semanticLinks: graph.semanticLinks.filter(bothKept),
    },
    droppedIds,
  };
}
