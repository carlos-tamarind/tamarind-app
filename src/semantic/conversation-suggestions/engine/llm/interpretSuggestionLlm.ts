import { llmProvider } from "@/semantic/llm/llmProvider";
import { complete, isLlmSuccess } from "@/semantic/llm/types";

import {
  ConversationSuggestionPermanentError,
  ConversationSuggestionTransientError,
} from "../../errors";
import { CONVERSATION_SUGGESTION_ENGINE_CONFIG } from "../config";
import {
  CONVERSATION_SUGGESTION_LLM_JSON_SCHEMA,
  conversationSuggestionLlmSchema,
  type ConversationSuggestionLlmOutput,
} from "./schema";

const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function throwFromLlmStatus(status: number, message: string): never {
  if (TRANSIENT_HTTP_STATUS.has(status) || status >= 500) {
    throw new ConversationSuggestionTransientError(`${status}: ${message}`, {
      globalInfra: status >= 500,
    });
  }
  throw new ConversationSuggestionPermanentError(`${status}: ${message}`);
}

export async function interpretSuggestionLlm(params: {
  instructions: string;
  input: string;
}): Promise<ConversationSuggestionLlmOutput> {
  const outcome = await complete(llmProvider, {
    model: CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_LLM_MODEL,
    instructions: params.instructions,
    input: params.input,
    jsonSchema: CONVERSATION_SUGGESTION_LLM_JSON_SCHEMA,
    reasoning: CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_LLM_REASONING,
    timeoutMs: CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_LLM_TIMEOUT_MS,
  });

  if (!isLlmSuccess(outcome)) {
    const message = "error" in outcome.body ? outcome.body.error : "LLM call failed";
    throwFromLlmStatus(outcome.status, message);
  }

  const parsed = conversationSuggestionLlmSchema.safeParse(outcome.body.output);
  if (!parsed.success) {
    throw new ConversationSuggestionPermanentError(
      `validation: LLM output did not match suggestion schema: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}
