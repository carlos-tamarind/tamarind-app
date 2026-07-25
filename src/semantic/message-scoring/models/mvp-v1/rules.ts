import { SCORING_CONFIG } from "./config";
import type { NormalizedMessage, RuleEvaluation, ScoringContext, ScoringRule } from "./types";

function matched(details?: string): RuleEvaluation {
  return { matched: true, details };
}

function notMatched(): RuleEvaluation {
  return { matched: false };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPhrase(text: string, phrases: readonly string[]): string | undefined {
  return phrases.find((phrase) => {
    const escapedPhrase = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedPhrase}(?=$|[^\\p{L}\\p{N}_])`, "iu");

    return pattern.test(text);
  });
}

function findPattern(text: string, patterns: readonly RegExp[]): RegExp | undefined {
  return patterns.find((pattern) => pattern.test(text));
}

function evaluateMessageLength(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_LENGTH;
  const text = message.normalized.trim();
  const wordCount = text === "" ? 0 : text.split(/\s+/).length;

  return wordCount >= config.MIN_WORDS ? matched(`${wordCount} words`) : notMatched();
}

function evaluateTechnicalTerms(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_TECH_TERMS;
  const term = findPhrase(message.normalized, config.KEYWORDS);

  return term ? matched(`Technical term: ${term}`) : notMatched();
}

function evaluateExplanationWords(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_EXPLANATION_WORDS;
  const phrase = findPhrase(message.normalized, config.WORDS);

  return phrase ? matched(`Explanation phrase: ${phrase}`) : notMatched();
}

function evaluateLists(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_LISTS;
  const commaCount = message.normalized.match(/,/g)?.length ?? 0;
  const itemCount = commaCount + 1;

  return commaCount > 0 && itemCount >= config.MIN_ITEMS
    ? matched(`${itemCount} comma-separated items`)
    : notMatched();
}

function evaluateBulletLists(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_BULLET_LIST;
  const itemCount =
    message.original.match(/^\s*(?:[-*]|\d+[.)]|[a-zA-Z][.)]|[IVXLCDM]+[.)])\s+/gm)?.length ?? 0;

  return itemCount >= config.MIN_ITEMS ? matched(`${itemCount} bullet-list items`) : notMatched();
}

function evaluateUrls(message: NormalizedMessage): RuleEvaluation {
  const containsUrl =
    /https?:\/\/|www\./i.test(message.original) ||
    /https?:\/\/|www\.|\[URL\]/i.test(message.normalized);

  return containsUrl ? matched("URL detected") : notMatched();
}

function evaluateCode(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_CODE;
  const containsFencedCode = config.DETECT_FENCED_CODE && /```[\s\S]*?```/.test(message.original);

  return containsFencedCode ? matched("Fenced code block detected") : notMatched();
}

function evaluateCommands(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_COMMANDS;
  const pattern = findPattern(message.normalized.trim(), config.PATTERNS);

  return pattern ? matched(`Command pattern: ${pattern.source}`) : notMatched();
}

function evaluateDecisions(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_DECISIONS;
  const pattern = findPattern(message.normalized, config.PATTERNS);

  return pattern ? matched(`Decision pattern: ${pattern.source}`) : notMatched();
}

function evaluateNumbers(message: NormalizedMessage): RuleEvaluation {
  return /\d/.test(message.normalized) ? matched("Numeric content detected") : notMatched();
}

function evaluateProposal(message: NormalizedMessage): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_MSG_PROPOSAL;
  const pattern = findPattern(message.normalized.trim(), config.PATTERNS);

  return pattern ? matched(`Proposal pattern: ${pattern.source}`) : notMatched();
}

function evaluateContextQuestion(
  _message: NormalizedMessage,
  context: ScoringContext,
): RuleEvaluation {
  const config = SCORING_CONFIG.RULES.HEUR_CONTEXT_QUESTION;
  const previous = context.previousMessages.slice(-config.PREVIOUS_MESSAGES);
  const hasQuestion = previous.some((message) => message.normalized.trim().endsWith("?"));

  return hasQuestion
    ? matched(`Question found in previous ${config.PREVIOUS_MESSAGES} messages`)
    : notMatched();
}

function evaluateSameAuthorWindow(
  message: NormalizedMessage,
  context: ScoringContext,
  previousMessageCount: number,
): RuleEvaluation {
  if (!message.authorId) return notMatched();

  const previous = context.previousMessages.slice(-previousMessageCount);
  const sameAuthor =
    previous.length === previousMessageCount &&
    previous.every(
      (previousMessage) =>
        previousMessage.authorId !== null && previousMessage.authorId === message.authorId,
    );

  return sameAuthor
    ? matched(`Same author for previous ${previousMessageCount} messages`)
    : notMatched();
}

function evaluateContextSameAuthor2(
  message: NormalizedMessage,
  context: ScoringContext,
): RuleEvaluation {
  return evaluateSameAuthorWindow(
    message,
    context,
    SCORING_CONFIG.RULES.HEUR_CONTEXT_SAME_AUTHOR_2.PREVIOUS_MESSAGES,
  );
}

function evaluateContextSameAuthor4(
  message: NormalizedMessage,
  context: ScoringContext,
): RuleEvaluation {
  return evaluateSameAuthorWindow(
    message,
    context,
    SCORING_CONFIG.RULES.HEUR_CONTEXT_SAME_AUTHOR_4.PREVIOUS_MESSAGES,
  );
}

export const SCORING_RULES = [
  {
    id: "HEUR_MSG_LENGTH",
    config: SCORING_CONFIG.RULES.HEUR_MSG_LENGTH,
    evaluate: evaluateMessageLength,
  },
  {
    id: "HEUR_MSG_TECH_TERMS",
    config: SCORING_CONFIG.RULES.HEUR_MSG_TECH_TERMS,
    evaluate: evaluateTechnicalTerms,
  },
  {
    id: "HEUR_MSG_EXPLANATION_WORDS",
    config: SCORING_CONFIG.RULES.HEUR_MSG_EXPLANATION_WORDS,
    evaluate: evaluateExplanationWords,
  },
  {
    id: "HEUR_MSG_LISTS",
    config: SCORING_CONFIG.RULES.HEUR_MSG_LISTS,
    evaluate: evaluateLists,
  },
  {
    id: "HEUR_MSG_BULLET_LIST",
    config: SCORING_CONFIG.RULES.HEUR_MSG_BULLET_LIST,
    evaluate: evaluateBulletLists,
  },
  {
    id: "HEUR_MSG_URLS",
    config: SCORING_CONFIG.RULES.HEUR_MSG_URLS,
    evaluate: evaluateUrls,
  },
  {
    id: "HEUR_MSG_CODE",
    config: SCORING_CONFIG.RULES.HEUR_MSG_CODE,
    evaluate: evaluateCode,
  },
  {
    id: "HEUR_MSG_COMMANDS",
    config: SCORING_CONFIG.RULES.HEUR_MSG_COMMANDS,
    evaluate: evaluateCommands,
  },
  {
    id: "HEUR_MSG_DECISIONS",
    config: SCORING_CONFIG.RULES.HEUR_MSG_DECISIONS,
    evaluate: evaluateDecisions,
  },
  {
    id: "HEUR_MSG_NUMBERS",
    config: SCORING_CONFIG.RULES.HEUR_MSG_NUMBERS,
    evaluate: evaluateNumbers,
  },
  {
    id: "HEUR_MSG_PROPOSAL",
    config: SCORING_CONFIG.RULES.HEUR_MSG_PROPOSAL,
    evaluate: evaluateProposal,
  },
  {
    id: "HEUR_CONTEXT_QUESTION",
    config: SCORING_CONFIG.RULES.HEUR_CONTEXT_QUESTION,
    evaluate: evaluateContextQuestion,
  },
  {
    id: "HEUR_CONTEXT_SAME_AUTHOR_2",
    config: SCORING_CONFIG.RULES.HEUR_CONTEXT_SAME_AUTHOR_2,
    evaluate: evaluateContextSameAuthor2,
  },
  {
    id: "HEUR_CONTEXT_SAME_AUTHOR_4",
    config: SCORING_CONFIG.RULES.HEUR_CONTEXT_SAME_AUTHOR_4,
    evaluate: evaluateContextSameAuthor4,
  },
] as const satisfies readonly ScoringRule[];
