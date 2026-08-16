import type { MatchedConversationTopic } from "../types/match";
import { CTI_ENGINE_CONFIG } from "./config";

export type MatchRoute =
  | { tier: 4 }
  | {
      tier: 1;
      strongEstablished: MatchedConversationTopic[];
      strongCandidates: MatchedConversationTopic[];
    }
  | { tier: 2; topic: MatchedConversationTopic }
  | { tier: 3 };

export function classifyMatches(matches: MatchedConversationTopic[]): MatchRoute {
  if (matches.length === 0) return { tier: 4 };

  const upper = CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_MEDIUM_SIMILARITY_UPPER_THRESHOLD;
  const lower = CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_MEDIUM_SIMILARITY_LOWER_THRESHOLD;

  const strong = matches.filter((match) => match.similarity >= upper);
  if (strong.length > 0) {
    return {
      tier: 1,
      strongEstablished: strong.filter((match) => !match.is_candidate),
      strongCandidates: strong.filter((match) => match.is_candidate),
    };
  }

  const mediumEstablished = matches
    .filter(
      (match) =>
        !match.is_candidate && match.similarity >= lower && match.similarity < upper,
    )
    .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));

  if (mediumEstablished[0]) {
    return { tier: 2, topic: mediumEstablished[0] };
  }

  return { tier: 3 };
}
