import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatEmbeddingVector } from "@/lib/vector/embeddingVectorUtil";
import { CTI_ENGINE_CONFIG } from "@/semantic/conversation-topics/engine/config";
import {
  hasCanonicalIdentity,
  l2NormalizeSum,
} from "@/semantic/conversation-topics/engine/l2Normalize";
import { loadTopicEvidenceEmbeddings } from "@/semantic/conversation-topics/engine/persistence/loadCtiContext";
import { topicScore } from "@/semantic/conversation-topics/engine/scoreTopics";
import { selectCurrentTopic } from "@/semantic/conversation-topics/engine/selectCurrentTopic";

export type DeletedEvidence = {
  topicId: string;
  conversationId: string;
  similarity: number;
};

export async function snapshotEvidencesForMessages(
  messageIds: string[],
): Promise<DeletedEvidence[]> {
  if (messageIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("conversation_topic_evidences")
    .select("topic_id, conversation_id, similarity")
    .in("message_id", messageIds);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    topicId: row.topic_id as string,
    conversationId: row.conversation_id as string,
    similarity: Number(row.similarity),
  }));
}

export async function reconcileTopicsAfterMessageScrub(
  deletedEvidences: DeletedEvidence[],
): Promise<void> {
  if (deletedEvidences.length === 0) return;

  const similarityByTopic = new Map<string, number>();
  const conversationIds = new Set<string>();
  for (const evidence of deletedEvidences) {
    similarityByTopic.set(
      evidence.topicId,
      (similarityByTopic.get(evidence.topicId) ?? 0) + evidence.similarity,
    );
    conversationIds.add(evidence.conversationId);
  }

  const topicIds = [...similarityByTopic.keys()];
  const { data: topics, error: topicError } = await supabaseAdmin
    .from("conversation_topics")
    .select(
      "id, conversation_id, name, description, historical_weight, evidence_count, is_candidate, last_seen_at",
    )
    .in("id", topicIds);
  if (topicError) throw new Error(topicError.message);

  const remainingByTopic = new Map<string, { count: number; lastSeenAt: string | null }>();
  const { data: remaining, error: remainingError } = await supabaseAdmin
    .from("conversation_topic_evidences")
    .select("topic_id, created_at")
    .in("topic_id", topicIds);
  if (remainingError) throw new Error(remainingError.message);
  for (const row of remaining ?? []) {
    const topicId = row.topic_id as string;
    const createdAt = row.created_at as string;
    const prev = remainingByTopic.get(topicId);
    if (!prev) {
      remainingByTopic.set(topicId, { count: 1, lastSeenAt: createdAt });
      continue;
    }
    prev.count += 1;
    if (!prev.lastSeenAt || createdAt > prev.lastSeenAt) prev.lastSeenAt = createdAt;
  }

  const now = new Date();
  const minEvidence = CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_MINIMUM_EVIDENCE_THRESHOLD;

  for (const topic of topics ?? []) {
    const remainingState = remainingByTopic.get(topic.id) ?? {
      count: 0,
      lastSeenAt: null,
    };
    if (remainingState.count === 0) {
      const { error } = await supabaseAdmin
        .from("conversation_topics")
        .delete()
        .eq("id", topic.id);
      if (error) throw new Error(error.message);
      continue;
    }

    const nextWeight = Math.max(
      0,
      Number(topic.historical_weight) - (similarityByTopic.get(topic.id) ?? 0),
    );
    const demote =
      remainingState.count < minEvidence && topic.is_candidate === false;

    const patch: {
      evidence_count: number;
      historical_weight: number;
      last_seen_at: string;
      is_candidate?: boolean;
      embedding?: string;
    } = {
      evidence_count: remainingState.count,
      historical_weight: nextWeight,
      last_seen_at: remainingState.lastSeenAt ?? topic.last_seen_at,
    };
    if (demote) patch.is_candidate = true;

    if (
      !hasCanonicalIdentity({
        name: topic.name,
        description: topic.description,
      })
    ) {
      const vectors = await loadTopicEvidenceEmbeddings(topic.id);
      if (vectors.length > 0) {
        patch.embedding = formatEmbeddingVector(l2NormalizeSum(vectors));
      }
    }

    const { error } = await supabaseAdmin
      .from("conversation_topics")
      .update(patch)
      .eq("id", topic.id);
    if (error) throw new Error(error.message);
  }

  for (const conversationId of conversationIds) {
    await reselectCurrentTopic(conversationId, now);
  }
}

async function reselectCurrentTopic(conversationId: string, now: Date) {
  const { data: conversation, error: convError } = await supabaseAdmin
    .from("conversations")
    .select("current_topic_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convError) throw new Error(convError.message);
  if (!conversation) return;

  const { data: established, error: establishedError } = await supabaseAdmin
    .from("conversation_topics")
    .select("id, historical_weight, last_seen_at")
    .eq("conversation_id", conversationId)
    .eq("is_candidate", false);
  if (establishedError) throw new Error(establishedError.message);

  const scored = (established ?? []).map((topic) => ({
    id: topic.id,
    score: topicScore(
      Number(topic.historical_weight),
      new Date(topic.last_seen_at),
      now,
      CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HALF_LIFE_HOURS,
    ),
  }));

  const previousId = conversation.current_topic_id as string | null;
  const previousStillEstablished = scored.some((topic) => topic.id === previousId);
  const nextId = selectCurrentTopic({
    topics: scored,
    currentTopicId: previousStillEstablished ? previousId : null,
    hysteresis: CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HYSTERESIS_PERCENTAGE,
  });

  if (nextId === previousId) return;

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({ current_topic_id: nextId })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}
