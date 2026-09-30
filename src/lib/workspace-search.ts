import { z } from "zod";

export const workspaceSearchSchema = z.object({
  c: z.string().uuid().optional(),
  p: z.string().uuid().optional(),
  m: z.string().uuid().optional(),
  k: z.string().uuid().optional(),
  // Knowledge base open, and its selected canonical topic.
  kb: z.boolean().optional(),
  t: z.string().uuid().optional(),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

// The KB shares the main area with at most one entity: once both a
// conversation and a page are open, it steps aside.
function hideKnowledgeBaseIfFull(next: WorkspaceSearch): WorkspaceSearch {
  return next.c && next.p ? { ...next, kb: undefined } : next;
}

export function withConversation(
  prev: WorkspaceSearch,
  conversationId: string | undefined,
  messageId?: string,
): WorkspaceSearch {
  return hideKnowledgeBaseIfFull({
    ...prev,
    c: conversationId,
    m: conversationId ? messageId : undefined,
  });
}

export function withPage(
  prev: WorkspaceSearch,
  pageId: string | undefined,
  chunkId?: string,
): WorkspaceSearch {
  return hideKnowledgeBaseIfFull({
    ...prev,
    p: pageId,
    k: pageId ? chunkId : undefined,
  });
}

// Opening the KB always takes the whole main area.
export function withKnowledgeBase(prev: WorkspaceSearch): WorkspaceSearch {
  return { ...prev, kb: true, c: undefined, m: undefined, p: undefined, k: undefined };
}

export function withoutKnowledgeBase(prev: WorkspaceSearch): WorkspaceSearch {
  return { ...prev, kb: undefined };
}

export function withTopic(prev: WorkspaceSearch, topicId: string | undefined): WorkspaceSearch {
  return { ...prev, t: topicId };
}

export type KnowledgeEvidenceTarget =
  | { kind: "conversation"; conversationId: string; messageId?: string }
  | { kind: "page"; pageId: string };

// Evidence opens next to the KB: conversations on the left, pages on the right.
// The other slot is cleared so the KB keeps its half.
export function withKnowledgeEvidence(
  prev: WorkspaceSearch,
  target: KnowledgeEvidenceTarget,
): WorkspaceSearch {
  if (target.kind === "conversation") {
    return {
      ...prev,
      kb: true,
      c: target.conversationId,
      m: target.messageId,
      p: undefined,
      k: undefined,
    };
  }
  return { ...prev, kb: true, p: target.pageId, k: undefined, c: undefined, m: undefined };
}
