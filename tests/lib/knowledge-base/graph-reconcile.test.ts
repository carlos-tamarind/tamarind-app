import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reconcileGraphWithReadable } from "@/lib/knowledge-base/graph-reconcile";
import type { KnowledgeGraph } from "@/lib/knowledge-base/types";

function node(id: string) {
  return { id, name: id, description: id, evidenceCount: 1, lastActivityAt: "2026-09-27" };
}

const graph: KnowledgeGraph = {
  nodes: [node("a"), node("b"), node("c")],
  contextEdges: [
    { source: "a", target: "b", kind: "conversation", weight: 1 },
    { source: "b", target: "c", kind: "conversation", weight: 3 },
  ],
  semanticLinks: [
    { source: "a", target: "c", similarity: 0.5 },
    { source: "c", target: "b", similarity: 0.7 },
  ],
};

describe("reconcileGraphWithReadable", () => {
  it("returns the graph unchanged when every node is readable", () => {
    const result = reconcileGraphWithReadable(graph, new Set(["a", "b", "c"]));
    assert.deepEqual(result.droppedIds, []);
    assert.equal(result.graph, graph);
  });

  it("drops unreadable nodes with their edges and links in both directions", () => {
    const result = reconcileGraphWithReadable(graph, new Set(["a", "c"]));
    assert.deepEqual(result.droppedIds, ["b"]);
    assert.deepEqual(
      result.graph.nodes.map((n) => n.id),
      ["a", "c"],
    );
    assert.deepEqual(result.graph.contextEdges, []);
    assert.deepEqual(result.graph.semanticLinks, [{ source: "a", target: "c", similarity: 0.5 }]);
  });

  it("never adds readable ids the RPC did not return", () => {
    const result = reconcileGraphWithReadable(graph, new Set(["a", "b", "c", "z"]));
    assert.deepEqual(
      result.graph.nodes.map((n) => n.id),
      ["a", "b", "c"],
    );
  });

  it("empties the graph when nothing is readable", () => {
    const result = reconcileGraphWithReadable(graph, new Set());
    assert.deepEqual(result.droppedIds, ["a", "b", "c"]);
    assert.deepEqual(result.graph, { nodes: [], contextEdges: [], semanticLinks: [] });
  });
});
