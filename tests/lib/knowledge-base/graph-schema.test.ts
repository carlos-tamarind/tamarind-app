import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KnowledgeGraphResponseError,
  parseKnowledgeGraphResponse,
} from "@/lib/knowledge-base/graph-schema";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const payload = {
  nodes: [
    {
      id: A,
      name: "Pricing",
      description: "How we price plans",
      evidence_count: 4,
      last_activity_at: "2026-09-27T10:00:00+00:00",
    },
    {
      id: B,
      name: "Onboarding",
      description: "First-run experience",
      evidence_count: 1,
      last_activity_at: "2026-09-20T10:00:00+00:00",
    },
  ],
  context_edges: [{ source: A, target: B, kind: "conversation", weight: 2 }],
  semantic_links: [{ source: A, target: B, similarity: 0.42 }],
};

describe("parseKnowledgeGraphResponse", () => {
  it("maps the RPC payload to camelCase", () => {
    const graph = parseKnowledgeGraphResponse(payload);
    assert.deepEqual(graph.nodes[0], {
      id: A,
      name: "Pricing",
      description: "How we price plans",
      evidenceCount: 4,
      lastActivityAt: "2026-09-27T10:00:00+00:00",
    });
    assert.deepEqual(graph.contextEdges, [
      { source: A, target: B, kind: "conversation", weight: 2 },
    ]);
    assert.deepEqual(graph.semanticLinks, [{ source: A, target: B, similarity: 0.42 }]);
  });

  it("accepts an empty graph", () => {
    const graph = parseKnowledgeGraphResponse({ nodes: [], context_edges: [], semantic_links: [] });
    assert.deepEqual(graph, { nodes: [], contextEdges: [], semanticLinks: [] });
  });

  it("throws a descriptive error on a malformed payload", () => {
    assert.throws(
      () => parseKnowledgeGraphResponse({ ...payload, nodes: [{ id: "not-a-uuid" }] }),
      (err: unknown) =>
        err instanceof KnowledgeGraphResponseError &&
        err.message === "Knowledge graph response was malformed" &&
        err.issuePaths.some((path) => path.startsWith("nodes.0")),
    );
    assert.throws(() => parseKnowledgeGraphResponse(null), KnowledgeGraphResponseError);
  });
});
