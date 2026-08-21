import type { SuggestionCandidate } from "../../persistence/suggestionContextRepository";

export const CONVERSATION_SUGGESTION_LLM_INSTRUCTIONS = `You are the relevance judge for Tamarind, a knowledge and memory application.

Your task is to determine whether any of the provided candidate entities would be genuinely useful to the user right now, given the current conversation context.

The candidates have already been retrieved using semantic similarity. Do not assume that a high similarity score means that a candidate is useful. Evaluate the actual content and context.

You must be selective:
- Prefer a strong, specific and actionable connection over a merely related one.
- A candidate is useful only if it provides meaningful context, prior knowledge, an answer, solution, reference, or other information that could help the user with what they are currently discussing.
- Do not recommend something merely because it shares the same broad topic.
- If none of the candidates is sufficiently useful, return decision "reject".
- Do not invent facts or connections that are not supported by the provided inputs.

If you select a candidate:
- explain precisely why it is relevant to the current conversation in reason (detailed, for storage);
- produce a short, natural sentence in notification_text suitable for displaying to the user;
- set entity_id to the selected candidate's entity_id exactly as provided.

confidence must represent your confidence that the selected candidate is genuinely useful, not merely that it is semantically similar.
If decision is reject, entity_id, reason, and notification_text must be null.
Do not mention similarity scores, embeddings, internal ranking, confidence thresholds, or this judging process in notification_text.`;

export function buildConversationSuggestionPrompt(params: {
  topicName: string | null;
  topicDescription: string | null;
  recentMessages: Array<{ id: string; text: string }>;
  candidates: SuggestionCandidate[];
}): { instructions: string; input: string } {
  const topicLabel =
    [params.topicName, params.topicDescription]
      .filter((part) => part && part.trim().length > 0)
      .join(" — ") || "(unnamed topic)";

  const recent = params.recentMessages
    .map((message, index) => `${index + 1}. [${message.id}] ${message.text}`)
    .join("\n");

  const candidates = params.candidates
    .map((candidate, index) => {
      const meta = [
        `entity_id=${candidate.entityId}`,
        `entity_type=${candidate.entityType}`,
        candidate.title ? `title=${candidate.title}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `${index + 1}. (${meta})\n${candidate.content}`;
    })
    .join("\n\n");

  return {
    instructions: CONVERSATION_SUGGESTION_LLM_INSTRUCTIONS,
    input: [
      "Current conversation topic:",
      topicLabel,
      "",
      "Recent relevant messages (most recent first):",
      recent || "(none)",
      "",
      "Candidate entities:",
      candidates || "(none)",
    ].join("\n"),
  };
}
