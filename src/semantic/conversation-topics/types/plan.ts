import type { ConversationTopicJob } from "./job";

export type CtiTopicInsert = {
  id: string;
  conversation_id: string;
  name: string | null;
  description: string | null;
  embedding: string;
  historical_weight: number;
  evidence_count: number;
  is_candidate: boolean;
  last_seen_at: string;
  first_seen_at: string;
};

export type CtiTopicUpdate = {
  id: string;
  name?: string | null;
  description?: string | null;
  embedding?: string;
  historical_weight?: number;
  evidence_count?: number;
  is_candidate?: boolean;
  last_seen_at?: string;
};

export type CtiEvidenceInsert = {
  topic_id: string;
  message_id: string;
  conversation_id: string;
  similarity: number;
};

export type CtiEvidenceMove = {
  from_topic_id: string;
  to_topic_id: string;
};

export type CtiApplyPayload = {
  topicsToInsert: CtiTopicInsert[];
  topicsToUpdate: CtiTopicUpdate[];
  evidencesToInsert: CtiEvidenceInsert[];
  evidencesToMove: CtiEvidenceMove[];
  topicsToDelete: string[];
  currentTopicId?: string | null;
};

export type CtiTransitionPlan =
  | { kind: "noop" }
  | { kind: "apply"; payload: CtiApplyPayload };

export interface ConversationTopicEngine {
  planTransition(input: { job: ConversationTopicJob }): Promise<CtiTransitionPlan>;
}
