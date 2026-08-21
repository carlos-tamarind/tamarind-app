import { CTI_ENGINE_CONFIG } from "@/semantic/conversation-topics/engine/config";
import { topicScore } from "@/semantic/conversation-topics/engine/scoreTopics";

import { CONVERSATION_SUGGESTION_ENGINE_CONFIG } from "./config";
import type { EmbeddedMessage, EstablishedTopic } from "../persistence/suggestionContextRepository";

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export function winnerTopicIsFocused(params: {
  winnerId: string;
  establishedTopics: EstablishedTopic[];
  recentMessages: EmbeddedMessage[];
}): boolean {
  const { winnerId, establishedTopics, recentMessages } = params;
  if (recentMessages.length === 0 || establishedTopics.length === 0) return false;

  const margin = CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_TOPIC_FOCUS_MARGIN;
  let winnerVotes = 0;

  for (const message of recentMessages) {
    const ranked = establishedTopics
      .map((topic) => ({
        id: topic.id,
        similarity: cosineSimilarity(message.embedding, topic.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best) continue;
    const uniquelyClosest = !runnerUp || best.similarity >= runnerUp.similarity + margin;
    if (uniquelyClosest && best.id === winnerId) winnerVotes += 1;
  }

  return winnerVotes > recentMessages.length / 2;
}

export function winnerTopicScore(winner: EstablishedTopic, now = new Date()): number {
  return topicScore(
    winner.historicalWeight,
    winner.lastSeenAt,
    now,
    CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HALF_LIFE_HOURS,
  );
}
