import type { OpenAiResponsesPayload } from "./types";

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function collectOutputText(payload: OpenAiResponsesPayload): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const chunks: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type && item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type && content.type !== "output_text" && content.type !== "text") continue;
      if (typeof content.text === "string" && content.text.length > 0) {
        chunks.push(content.text);
      }
    }
  }

  if (chunks.length === 0) return null;
  return chunks.join("");
}

export function mapOpenAiResponseToOutput(
  payload: OpenAiResponsesPayload,
):
  | { ok: true; output: unknown; model?: string; usage: { input_tokens: number; output_tokens: number; total_tokens: number } }
  | { ok: false; status: number; message: string } {
  if (payload.status && payload.status !== "completed") {
    return {
      ok: false,
      status: payload.status === "failed" ? 502 : 503,
      message: payload.error?.message ?? `OpenAI response status was ${payload.status}.`,
    };
  }

  if (payload.output_parsed !== undefined) {
    return {
      ok: true,
      output: payload.output_parsed,
      model: payload.model,
      usage: {
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
        total_tokens: payload.usage?.total_tokens ?? 0,
      },
    };
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.parsed !== undefined) {
        return {
          ok: true,
          output: content.parsed,
          model: payload.model,
          usage: {
            input_tokens: payload.usage?.input_tokens ?? 0,
            output_tokens: payload.usage?.output_tokens ?? 0,
            total_tokens: payload.usage?.total_tokens ?? 0,
          },
        };
      }
    }
  }

  const text = collectOutputText(payload);
  if (text == null) {
    return {
      ok: false,
      status: 502,
      message: "OpenAI response did not include output text.",
    };
  }

  return {
    ok: true,
    output: parseJsonText(text),
    model: payload.model,
    usage: {
      input_tokens: payload.usage?.input_tokens ?? 0,
      output_tokens: payload.usage?.output_tokens ?? 0,
      total_tokens: payload.usage?.total_tokens ?? 0,
    },
  };
}
