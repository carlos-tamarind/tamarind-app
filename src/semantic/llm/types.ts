export type LlmJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type LlmReasoningEffort = "none" | "low" | "medium" | "high";

export type LlmCompleteRequest = {
  model?: string;
  instructions?: string;
  input: string;
  jsonSchema?: LlmJsonSchema;
  reasoning?: LlmReasoningEffort;
  timeoutMs?: number;
};

export type LlmUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type LlmSuccessResponse = {
  model: string;
  output: unknown;
  usage: LlmUsage;
};

export type LlmErrorResponse = {
  error: string;
};

export type LlmOutcome = {
  status: number;
  body: LlmSuccessResponse | LlmErrorResponse;
};

export interface LlmProvider {
  complete(options: LlmCompleteRequest): Promise<LlmOutcome>;
}

export function isLlmSuccess(
  outcome: LlmOutcome,
): outcome is LlmOutcome & { body: LlmSuccessResponse } {
  return outcome.status === 200 && "output" in outcome.body;
}

export async function complete(
  provider: LlmProvider,
  options: LlmCompleteRequest,
): Promise<LlmOutcome> {
  return provider.complete(options);
}
