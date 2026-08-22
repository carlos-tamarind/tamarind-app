export type EmbeddingStatus = "QUEUED" | "PROCESSING" | "EMBEDDED" | "FAILED" | "SKIPPED";

export type MessageSemantics = {
  id: string;
  message_id: string;
  normalized_text: string;
  checksum: string;
  language: string;
  quality_score: number;
  processable: boolean;
  embedding_status: EmbeddingStatus;
  last_error: string | null;
  last_processed_at: string | null;
  retry_count: number;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UpdateMessageSemanticsInput = {
  embedding_status?: EmbeddingStatus;
  last_error?: string | null;
  last_processed_at?: string | null;
  retry_count?: number;
  next_retry_at?: string | null;
};

export type InsertMessageSemanticsInput = {
  message_id: string;
  normalized_text: string;
  checksum: string;
  language?: string;
  quality_score?: number;
  processable?: boolean;
  embedding_status?: EmbeddingStatus;
};
