import { z } from "zod";

import type { LlmJsonSchema } from "@/semantic/llm/types";

export const PAGE_SEMANTIC_LLM_JSON_SCHEMA: LlmJsonSchema = {
  name: "page_semantic_topic",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
    },
  },
};

export const pageSemanticLlmSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

export type PageSemanticLlmOutput = z.infer<typeof pageSemanticLlmSchema>;
