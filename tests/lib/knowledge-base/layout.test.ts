import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { layoutKnowledgeGraph } from "@/lib/knowledge-base/layout";

const input = {
  nodes: ["a", "b", "c", "d", "lonely"].map((id) => ({ id, width: 180, height: 44 })),
  semanticLinks: [
    { source: "a", target: "b", similarity: 0.9 },
    { source: "c", target: "d", similarity: 0.9 },
    { source: "a", target: "missing", similarity: 0.9 },
  ],
  contextEdges: [{ source: "b", target: "c", kind: "conversation" as const, weight: 1 }],
};

describe("layoutKnowledgeGraph", () => {
  it("is deterministic", () => {
    const first = layoutKnowledgeGraph(input);
    const second = layoutKnowledgeGraph(input);
    assert.deepEqual([...first.entries()], [...second.entries()]);
  });

  it("positions every node, isolated ones included, with finite coordinates", () => {
    const positions = layoutKnowledgeGraph(input);
    assert.equal(positions.size, input.nodes.length);
    for (const { x, y } of positions.values()) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
    }
  });

  it("pulls strongly similar topics closer than unrelated ones", () => {
    const p = layoutKnowledgeGraph(input);
    const dist = (u: string, v: string) =>
      Math.hypot(p.get(u)!.x - p.get(v)!.x, p.get(u)!.y - p.get(v)!.y);
    assert.ok(dist("a", "b") < dist("a", "lonely"));
  });
});
