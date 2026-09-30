import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  withConversation,
  withKnowledgeBase,
  withKnowledgeEvidence,
  withPage,
  withTopic,
} from "@/lib/workspace-search";

const C = "00000000-0000-4000-8000-00000000000c";
const P = "00000000-0000-4000-8000-00000000000d";
const T = "00000000-0000-4000-8000-00000000000e";

describe("knowledge base search helpers", () => {
  it("opening the KB clears every entity but keeps the selected topic", () => {
    assert.deepEqual(withKnowledgeBase({ c: C, m: C, p: P, k: P, t: T }), {
      kb: true,
      t: T,
      c: undefined,
      m: undefined,
      p: undefined,
      k: undefined,
    });
  });

  it("keeps the KB beside a single manually opened entity", () => {
    assert.equal(withConversation({ kb: true }, C).kb, true);
    assert.equal(withPage({ kb: true }, P).kb, true);
  });

  it("hides the KB once a conversation and a page are both open", () => {
    assert.equal(withPage({ kb: true, c: C }, P).kb, undefined);
    assert.equal(withConversation({ kb: true, p: P }, C).kb, undefined);
  });

  it("evidence targets take their side and clear the opposite slot", () => {
    const conv = withKnowledgeEvidence(
      { kb: true, p: P, k: P, t: T },
      { kind: "conversation", conversationId: C, messageId: C },
    );
    assert.deepEqual(conv, { kb: true, t: T, c: C, m: C, p: undefined, k: undefined });

    const page = withKnowledgeEvidence({ kb: true, c: C, m: C, t: T }, { kind: "page", pageId: P });
    assert.deepEqual(page, { kb: true, t: T, p: P, k: undefined, c: undefined, m: undefined });
  });

  it("withTopic sets and clears the selection", () => {
    assert.equal(withTopic({ kb: true }, T).t, T);
    assert.equal(withTopic({ kb: true, t: T }, undefined).t, undefined);
  });
});
