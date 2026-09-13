import { CANONICAL_TOPIC_ENGINE_CONFIG } from "./config";

export type CanonicalTopicMatch = {
  id: string;
  name: string;
  description: string;
  similarity: number;
};

export type CanonicalTopicMatchTier = "high" | "medium" | "low";

export function classifyMatch(matches: CanonicalTopicMatch[]): {
  tier: CanonicalTopicMatchTier;
  best: CanonicalTopicMatch | null;
} {
  const best = matches[0] ?? null;
  if (!best) return { tier: "low", best: null };

  const {
    CANONICAL_TOPIC_MEDIUM_SIMILARITY_LOWER_THRESHOLD: LOWER,
    CANONICAL_TOPIC_MEDIUM_SIMILARITY_UPPER_THRESHOLD: UPPER,
  } = CANONICAL_TOPIC_ENGINE_CONFIG;

  if (best.similarity > UPPER) return { tier: "high", best };
  if (best.similarity >= LOWER) return { tier: "medium", best };
  return { tier: "low", best };
}
