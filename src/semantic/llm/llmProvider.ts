import { openAiLlmProvider } from "./providers/openai/responses.server";
import type { LlmProvider } from "./types";

export type { LlmProvider } from "./types";

/** Active LLM provider — swap here to change backend (e.g. Anthropic, local). */
export const llmProvider: LlmProvider = openAiLlmProvider;
