import { SCORING_CONFIG } from "./config";

/**
 * Normalized message consumed by the scoring model.
 *
 * The pipeline is responsible for adapting its persistence records to this
 * model-owned input shape.
 */
export interface NormalizedMessage {
  id: string;
  authorId: string;
  original: string;
  normalized: string;
}

export interface ScoringContext {
  previousMessages: NormalizedMessage[];
}

export type ScoringRuleId = keyof typeof SCORING_CONFIG.RULES;

export interface RuleEvaluation {
  matched: boolean;
  details?: string;
}

export interface AppliedRule {
  id: ScoringRuleId;
  weight: number;
  details?: string;
}

export interface ScoringResult {
  heuristicScore: number;
  normalizedScore: number;
  shouldEmbed: boolean;
  appliedRules: AppliedRule[];
}

export interface ScoringRule {
  id: ScoringRuleId;
  config: {
    ENABLED: boolean;
    WEIGHT: number;
  };
  evaluate: (message: NormalizedMessage, context: ScoringContext) => RuleEvaluation;
}
