import { llmProvider } from "@/semantic/llm/llmProvider";
import { complete, isLlmSuccess } from "@/semantic/llm/types";

import { CanonicalTopicPermanentError, CanonicalTopicTransientError } from "../../errors";
import { CANONICAL_TOPIC_ENGINE_CONFIG } from "../config";
import {
  CANONICAL_TOPIC_ARBITRATION_JSON_SCHEMA,
  canonicalTopicArbitrationSchema,
  type CanonicalTopicArbitrationDecision,
} from "./schema";

const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function throwFromLlmStatus(status: number, message: string): never {
  if (TRANSIENT_HTTP_STATUS.has(status) || status >= 500) {
    throw new CanonicalTopicTransientError(`${status}: ${message}`, {
      globalInfra: status >= 500,
    });
  }
  throw new CanonicalTopicPermanentError(`${status}: ${message}`);
}

export async function interpretCanonicalTopicArbitration(params: {
  instructions: string;
  input: string;
}): Promise<CanonicalTopicArbitrationDecision> {
  const outcome = await complete(llmProvider, {
    model: CANONICAL_TOPIC_ENGINE_CONFIG.CANONICAL_TOPIC_LLM_MODEL,
    instructions: params.instructions,
    input: params.input,
    jsonSchema: CANONICAL_TOPIC_ARBITRATION_JSON_SCHEMA,
    reasoning: CANONICAL_TOPIC_ENGINE_CONFIG.CANONICAL_TOPIC_LLM_REASONING,
    timeoutMs: CANONICAL_TOPIC_ENGINE_CONFIG.CANONICAL_TOPIC_LLM_TIMEOUT_MS,
  });

  if (!isLlmSuccess(outcome)) {
    const message = "error" in outcome.body ? outcome.body.error : "LLM call failed";
    throwFromLlmStatus(outcome.status, message);
  }

  const parsed = canonicalTopicArbitrationSchema.safeParse(outcome.body.output);
  if (!parsed.success) {
    throw new CanonicalTopicPermanentError(
      `validation: LLM output did not match arbitration schema: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}
