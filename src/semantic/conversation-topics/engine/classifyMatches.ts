import type { MatchedConversationTopic } from "../types/match";
import { CTI_ENGINE_CONFIG } from "./config";

export type MatchRoute =
  | { tier: 4 }
  | {
      tier: 1;
      strongEstablished: MatchedConversationTopic[];
      strongCandidates: MatchedConversationTopic[];
    }
  | {
      tier: 2;
      mediumEstablished: MatchedConversationTopic | null;
      mediumCandidates: MatchedConversationTopic[];
    }
  | { tier: 3 };

function sortBySimilarity(matches: MatchedConversationTopic[]) {
  return [...matches].sort(
    (a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id),
  );
}

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

  const medium = matches.filter(
    (match) => match.similarity >= lower && match.similarity < upper,
  );
  const mediumEstablished = sortBySimilarity(
    medium.filter((match) => !match.is_candidate),
  );
  const mediumCandidates = sortBySimilarity(
    medium.filter((match) => match.is_candidate),
  );

  if (mediumEstablished[0] || mediumCandidates.length > 0) {
    return {
      tier: 2,
      mediumEstablished: mediumEstablished[0] ?? null,
      mediumCandidates,
    };
  }

  return { tier: 3 };
}
