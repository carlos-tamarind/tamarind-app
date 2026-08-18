import { llmProvider } from "@/semantic/llm/llmProvider";
import { complete, isLlmSuccess } from "@/semantic/llm/types";

import { PageSemanticPermanentError, PageSemanticTransientError } from "../../errors";
import { PAGE_SEMANTIC_ENGINE_CONFIG } from "../config";
import {
  PAGE_SEMANTIC_LLM_JSON_SCHEMA,
  pageSemanticLlmSchema,
  type PageSemanticLlmOutput,
} from "./schema";

const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function throwFromLlmStatus(status: number, message: string): never {
  if (TRANSIENT_HTTP_STATUS.has(status) || status >= 500) {
    throw new PageSemanticTransientError(`${status}: ${message}`, {
      globalInfra: status >= 500,
    });
  }
  throw new PageSemanticPermanentError(`${status}: ${message}`);
}

export async function interpretPageSemanticLlm(params: {
  instructions: string;
  input: string;
}): Promise<PageSemanticLlmOutput> {
  const outcome = await complete(llmProvider, {
    model: PAGE_SEMANTIC_ENGINE_CONFIG.PAGE_SEMANTIC_LLM_MODEL,
    instructions: params.instructions,
    input: params.input,
    jsonSchema: PAGE_SEMANTIC_LLM_JSON_SCHEMA,
    reasoning: PAGE_SEMANTIC_ENGINE_CONFIG.PAGE_SEMANTIC_LLM_REASONING,
    timeoutMs: PAGE_SEMANTIC_ENGINE_CONFIG.PAGE_SEMANTIC_LLM_TIMEOUT_MS,
  });

  if (!isLlmSuccess(outcome)) {
    const message = "error" in outcome.body ? outcome.body.error : "LLM call failed";
    throwFromLlmStatus(outcome.status, message);
  }

  const parsed = pageSemanticLlmSchema.safeParse(outcome.body.output);
  if (!parsed.success) {
    throw new PageSemanticPermanentError(
      `validation: LLM output did not match page semantic schema: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}
