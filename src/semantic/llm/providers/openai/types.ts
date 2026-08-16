export const DEFAULT_LLM_MODEL = "gpt-5.4-nano";

export type OpenAiResponsesContent = {
  type?: string;
  text?: string;
  parsed?: unknown;
};

export type OpenAiResponsesOutputItem = {
  type?: string;
  role?: string;
  content?: OpenAiResponsesContent[];
};

export type OpenAiResponsesPayload = {
  id?: string;
  status?: string;
  model?: string;
  output?: OpenAiResponsesOutputItem[];
  output_parsed?: unknown;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};
