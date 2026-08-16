import { DebugLogger } from "@/lib/debugLogger";

import type { LlmCompleteRequest, LlmOutcome, LlmProvider } from "../../types";
import { mapOpenAiResponseToOutput } from "./mapper";
import { DEFAULT_LLM_MODEL, type OpenAiResponsesPayload } from "./types";

const LOG_SCOPE = "llm";

function failure(status: number, message: string): LlmOutcome {
  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "LLM_FAILURE",
    message: `${status}: ${message}`,
    level: "error",
  });
  return { status, body: { error: message } };
}

function abortReason(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { name?: string; code?: string };
  return record.name === "AbortError" || record.name === "TimeoutError" || record.code === "ABORT_ERR";
}

async function complete(options: LlmCompleteRequest): Promise<LlmOutcome> {
  const model = (options.model ?? DEFAULT_LLM_MODEL).trim();
  if (model.length === 0) {
    return failure(400, "model is empty.");
  }
  if (options.input.trim().length === 0) {
    return failure(400, "input is empty.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return failure(500, "OPENAI_API_KEY is not configured.");
  }

  const body: Record<string, unknown> = {
    model,
    input: options.input,
  };

  if (options.instructions?.trim()) {
    body.instructions = options.instructions.trim();
  }

  if (options.reasoning) {
    body.reasoning = { effort: options.reasoning };
  }

  if (options.jsonSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: options.jsonSchema.name,
        strict: options.jsonSchema.strict ?? true,
        schema: options.jsonSchema.schema,
      },
    };
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (options.timeoutMs != null && options.timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (abortReason(error)) {
      return failure(408, `OpenAI Responses API timed out after ${options.timeoutMs}ms.`);
    }
    return failure(
      502,
      `Network error calling OpenAI Responses API: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let description = text;
    try {
      const json = JSON.parse(text) as { error?: { message?: string } };
      description = json.error?.message ?? text;
    } catch {
      /* keep raw text */
    }
    return failure(
      response.status,
      description || `OpenAI Responses API returned ${response.status}.`,
    );
  }

  let payload: OpenAiResponsesPayload;
  try {
    payload = (await response.json()) as OpenAiResponsesPayload;
  } catch (error) {
    return failure(
      502,
      `Could not parse OpenAI response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const mapped = mapOpenAiResponseToOutput(payload);
  if (!mapped.ok) {
    return failure(mapped.status, mapped.message);
  }

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "LLM_SUCCESSFUL",
    data: {
      model: mapped.model ?? model,
      inputTokens: mapped.usage.input_tokens,
      outputTokens: mapped.usage.output_tokens,
    },
  });

  return {
    status: 200,
    body: {
      model: mapped.model ?? model,
      output: mapped.output,
      usage: mapped.usage,
    },
  };
}

export const openAiLlmProvider: LlmProvider = {
  complete,
};
