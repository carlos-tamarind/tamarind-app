import { llmProvider } from "@/semantic/llm/llmProvider";
import { complete, isLlmSuccess } from "@/semantic/llm/types";

import { CtiPermanentError, CtiTransientError } from "../../errors";
import { CTI_ENGINE_CONFIG } from "../config";
import { type CtiLlmDecision, CTI_LLM_JSON_SCHEMA, ctiLlmDecisionSchema } from "./schema";

const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function throwFromLlmStatus(status: number, message: string): never {
  if (TRANSIENT_HTTP_STATUS.has(status) || status >= 500) {
    throw new CtiTransientError(`${status}: ${message}`, { globalInfra: status >= 500 });
  }
  throw new CtiPermanentError(`${status}: ${message}`);
}

export async function interpretCtiLlmDecision(params: {
  instructions: string;
  input: string;
}): Promise<CtiLlmDecision> {
  const outcome = await complete(llmProvider, {
    model: CTI_ENGINE_CONFIG.CTI_LLM_MODEL,
    instructions: params.instructions,
    input: params.input,
    jsonSchema: CTI_LLM_JSON_SCHEMA,
    reasoning: CTI_ENGINE_CONFIG.CTI_LLM_REASONING,
    timeoutMs: CTI_ENGINE_CONFIG.CTI_LLM_TIMEOUT_MS,
  });

  if (!isLlmSuccess(outcome)) {
    const message = "error" in outcome.body ? outcome.body.error : "LLM call failed";
    throwFromLlmStatus(outcome.status, message);
  }

  const parsed = ctiLlmDecisionSchema.safeParse(outcome.body.output);
  if (!parsed.success) {
    throw new CtiPermanentError(
      `validation: LLM output did not match CTI schema: ${parsed.error.message}`,
    );
  }

  return {
    ...parsed.data,
    confidence: clampConfidence(parsed.data.confidence),
  };
}
