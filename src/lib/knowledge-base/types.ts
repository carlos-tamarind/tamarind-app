export type KnowledgeNode = {
  id: string;
  name: string;
  description: string;
  evidenceCount: number;
  lastActivityAt: string;
};

export type KnowledgeContextEdge = {
  source: string;
  target: string;
  kind: "conversation" | "page";
  weight: number;
};

export type KnowledgeSemanticLink = {
  source: string;
  target: string;
  similarity: number;
};

export type KnowledgeGraph = {
  nodes: KnowledgeNode[];
  contextEdges: KnowledgeContextEdge[];
  semanticLinks: KnowledgeSemanticLink[];
};

export type KnowledgeEvidenceItem =
  | {
      kind: "message";
      conversationId: string;
      messageId: string;
      snapshot: string;
      createdAt: string;
    }
  | {
      kind: "page";
      pageId: string;
      snapshot: string;
      createdAt: string;
    };

export type KnowledgeTopicDetail = {
  topic: {
    id: string;
    name: string;
    description: string;
    lastActivityAt: string;
  };
  items: KnowledgeEvidenceItem[];
};

// Thrown for hidden and nonexistent topics alike, so callers can't tell them apart.
export const KNOWLEDGE_TOPIC_NOT_FOUND = "Topic not found";
