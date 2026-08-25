import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MatchedConversationTopic } from "../types/match";
import { classifyMatches } from "./classifyMatches";

function match(
  overrides: Partial<MatchedConversationTopic> & Pick<MatchedConversationTopic, "id" | "similarity" | "is_candidate">,
): MatchedConversationTopic {
  return {
    conversation_id: "conv-1",
    name: overrides.is_candidate ? null : "Topic",
    description: null,
    embedding: [1, 0],
    first_seen_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: "2026-01-01T00:00:00.000Z",
    evidence_count: 1,
    historical_weight: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("classifyMatches", () => {
  it("returns tier 4 when there are no matches", () => {
    assert.deepEqual(classifyMatches([]), { tier: 4 });
  });

  it("routes strong matches to tier 1", () => {
    const route = classifyMatches([
      match({ id: "est-1", similarity: 0.65, is_candidate: false }),
      match({ id: "cand-1", similarity: 0.7, is_candidate: true }),
    ]);
    assert.equal(route.tier, 1);
    if (route.tier !== 1) return;
    assert.equal(route.strongEstablished.length, 1);
    assert.equal(route.strongCandidates.length, 1);
  });

  it("routes medium established and candidates to tier 2", () => {
    const route = classifyMatches([
      match({ id: "est-1", similarity: 0.55, is_candidate: false }),
      match({ id: "cand-1", similarity: 0.5, is_candidate: true }),
    ]);
    assert.equal(route.tier, 2);
    if (route.tier !== 2) return;
    assert.equal(route.mediumEstablished?.id, "est-1");
    assert.equal(route.mediumCandidates.length, 1);
    assert.equal(route.mediumCandidates[0].id, "cand-1");
  });

  it("routes medium-only candidates to tier 2", () => {
    const route = classifyMatches([
      match({ id: "cand-1", similarity: 0.45, is_candidate: true }),
    ]);
    assert.equal(route.tier, 2);
    if (route.tier !== 2) return;
    assert.equal(route.mediumEstablished, null);
    assert.equal(route.mediumCandidates[0].id, "cand-1");
  });

  it("routes below lower threshold to tier 3", () => {
    const route = classifyMatches([
      match({ id: "cand-1", similarity: 0.39, is_candidate: true }),
    ]);
    assert.deepEqual(route, { tier: 3 });
  });

  it("treats upper threshold as tier 1", () => {
    const route = classifyMatches([
      match({ id: "cand-1", similarity: 0.6, is_candidate: true }),
    ]);
    assert.equal(route.tier, 1);
  });

  it("treats similarity just below upper as tier 2 medium", () => {
    const route = classifyMatches([
      match({ id: "cand-1", similarity: 0.59, is_candidate: true }),
    ]);
    assert.equal(route.tier, 2);
  });
});
