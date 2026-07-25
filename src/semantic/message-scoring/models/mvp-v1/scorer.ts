import { DebugLogger } from "@/lib/debugLogger";

import { SCORING_CONFIG } from "./config";
import { SCORING_RULES } from "./rules";
import type { AppliedRule, NormalizedMessage, ScoringContext, ScoringResult } from "./types";

export function calculateScore(message: NormalizedMessage, context: ScoringContext): ScoringResult {
  let heuristicScore = 0;
  const appliedRules: AppliedRule[] = [];

  for (const rule of SCORING_RULES) {
    if (!rule.config.ENABLED) continue;

    const evaluation = rule.evaluate(message, context);

    if (!evaluation.matched) continue;

    heuristicScore += rule.config.WEIGHT;
    appliedRules.push({
      id: rule.id,
      weight: rule.config.WEIGHT,
      ...(evaluation.details ? { details: evaluation.details } : {}),
    });
  }

  const normalizedScore = normalizeScore(heuristicScore);
  const scoringResult: ScoringResult = {
    heuristicScore,
    normalizedScore,
    shouldEmbed: normalizedScore >= SCORING_CONFIG.SHOULD_EMBED_THRESHOLD,
    appliedRules,
  };

  DebugLogger.table({
    scope: "message-scoring",
    event: "normalizationScore",
    data: {
      ...message,
      ...scoringResult,
    },
    collapsed: true,
  });

  return scoringResult;
}

function normalizeScore(score: number): number {
  switch (SCORING_CONFIG.NORMALIZER.TYPE) {
    case "SIGMOID":
      return sigmoid(score);
    default:
      throw new Error(`Unknown normalizer: ${SCORING_CONFIG.NORMALIZER.TYPE}`);
  }
}

function sigmoid(score: number): number {
  const { K, MIDPOINT } = SCORING_CONFIG.NORMALIZER;
  const value = 1 / (1 + Math.exp(-K * (score - MIDPOINT)));

  return Number(value.toFixed(4));
}
