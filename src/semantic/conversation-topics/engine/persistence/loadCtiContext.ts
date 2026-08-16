import { parseEmbeddingVector } from "@/lib/vector/embeddingVectorUtil";

import { CtiPermanentError } from "../../errors";
import type { ConversationTopicJob } from "../../types/job";
import type { MatchedConversationTopic } from "../../types/match";

export type { MatchedConversationTopic };

export type CtiJobContext = {
  job: ConversationTopicJob;
  conversationId: string;
  messageId: string;
  normalizedText: string;
  messageEmbedding: number[];
  currentTopicId: string | null;
  matches: MatchedConversationTopic[];
};

type MatchConversationTopicRow = {
  id: string;
  conversation_id: string;
  name: string | null;
  description: string | null;
  embedding: string | null;
  first_seen_at: string;
  last_seen_at: string;
  evidence_count: number;
  is_candidate: boolean;
  historical_weight: number;
  created_at: string;
  updated_at: string;
  similarity: number;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function asVector(value: string | null, label: string): number[] {
  if (!value) {
    throw new CtiPermanentError(`missing required ${label}`);
  }
  try {
    const parsed = parseEmbeddingVector(value);
    if (parsed.length === 0) {
      throw new CtiPermanentError(`malformed ${label}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof CtiPermanentError) throw error;
    throw new CtiPermanentError(
      `malformed ${label}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function loadCtiJobContext(job: ConversationTopicJob): Promise<CtiJobContext> {
  const supabase = await getAdmin();

  const { data: semantics, error: semanticsError } = await supabase
    .from("message_semantics")
    .select("id, normalized_text, embedding_status")
    .eq("message_id", job.message_id)
    .maybeSingle();

  if (semanticsError) throw semanticsError;
  if (!semantics) {
    throw new CtiPermanentError(`missing required message_semantics for message ${job.message_id}`);
  }
  if (semantics.embedding_status !== "EMBEDDED") {
    throw new CtiPermanentError(
      `message ${job.message_id} embedding_status is ${semantics.embedding_status}, expected EMBEDDED`,
    );
  }

  const { data: embeddingRow, error: embeddingError } = await supabase
    .from("message_embeddings")
    .select("embedding_vector")
    .eq("message_semantics_id", semantics.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (embeddingError) throw embeddingError;
  if (!embeddingRow?.embedding_vector) {
    throw new CtiPermanentError(`missing required embedding for message ${job.message_id}`);
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("current_topic_id")
    .eq("id", job.conversation_id)
    .maybeSingle();

  if (conversationError) throw conversationError;
  if (!conversation) {
    throw new CtiPermanentError(`missing required conversation ${job.conversation_id}`);
  }

  const { data: matchRows, error: matchError } = await supabase.rpc(
    "match_conversation_topics",
    {
      p_conversation_id: job.conversation_id,
      p_message_id: job.message_id,
    },
  );

  if (matchError) throw matchError;

  const matches = ((matchRows ?? []) as MatchConversationTopicRow[]).map((row) => ({
    ...row,
    embedding: asVector(row.embedding, `topic ${row.id} embedding`),
  }));

  return {
    job,
    conversationId: job.conversation_id,
    messageId: job.message_id,
    normalizedText: semantics.normalized_text,
    messageEmbedding: asVector(embeddingRow.embedding_vector, "message embedding"),
    currentTopicId: conversation.current_topic_id,
    matches,
  };
}

export async function loadTopicEvidenceTexts(topicId: string): Promise<string[]> {
  const supabase = await getAdmin();

  const { data: evidences, error: evidenceError } = await supabase
    .from("conversation_topic_evidences")
    .select("message_id")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: true });

  if (evidenceError) throw evidenceError;
  if (!evidences || evidences.length === 0) return [];

  const messageIds = evidences.map((row) => row.message_id);
  const { data: semantics, error: semanticsError } = await supabase
    .from("message_semantics")
    .select("message_id, normalized_text")
    .in("message_id", messageIds);

  if (semanticsError) throw semanticsError;

  const byMessageId = new Map(
    (semantics ?? []).map((row) => [row.message_id, row.normalized_text]),
  );

  return messageIds
    .map((id) => byMessageId.get(id))
    .filter((text): text is string => typeof text === "string" && text.length > 0);
}

export async function loadTopicEvidenceEmbeddings(topicId: string): Promise<number[][]> {
  const supabase = await getAdmin();

  const { data: evidences, error: evidenceError } = await supabase
    .from("conversation_topic_evidences")
    .select("message_id")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: true });

  if (evidenceError) throw evidenceError;
  if (!evidences || evidences.length === 0) return [];

  const messageIds = evidences.map((row) => row.message_id);
  const { data: semantics, error: semanticsError } = await supabase
    .from("message_semantics")
    .select("id, message_id")
    .in("message_id", messageIds);

  if (semanticsError) throw semanticsError;
  if (!semantics || semantics.length === 0) return [];

  const semanticsIds = semantics.map((row) => row.id);
  const { data: embeddings, error: embeddingsError } = await supabase
    .from("message_embeddings")
    .select("message_semantics_id, embedding_vector")
    .in("message_semantics_id", semanticsIds)
    .eq("is_active", true);

  if (embeddingsError) throw embeddingsError;

  const embeddingBySemanticsId = new Map(
    (embeddings ?? []).map((row) => [
      row.message_semantics_id,
      asVector(row.embedding_vector, "evidence embedding"),
    ]),
  );

  const semanticsByMessageId = new Map(semantics.map((row) => [row.message_id, row.id]));

  return messageIds.flatMap((messageId) => {
    const semanticsId = semanticsByMessageId.get(messageId);
    if (!semanticsId) return [];
    const vector = embeddingBySemanticsId.get(semanticsId);
    return vector ? [vector] : [];
  });
}
