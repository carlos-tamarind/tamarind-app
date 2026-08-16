export type MatchedConversationTopic = {
  id: string;
  conversation_id: string;
  name: string | null;
  description: string | null;
  embedding: number[];
  first_seen_at: string;
  last_seen_at: string;
  evidence_count: number;
  is_candidate: boolean;
  historical_weight: number;
  created_at: string;
  updated_at: string;
  similarity: number;
};
