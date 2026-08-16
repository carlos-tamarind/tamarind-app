import { z } from "zod";

import type { LlmJsonSchema } from "@/semantic/llm/types";

export const CTI_LLM_JSON_SCHEMA: LlmJsonSchema = {
  name: "cti_topic_decision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "topic_id", "confidence", "new_topic"],
    properties: {
      decision: { type: "string", enum: ["existing", "new"] },
      topic_id: { type: ["string", "null"] },
      confidence: { type: "number" },
      new_topic: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["name", "description"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
};

const newTopicSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

export const ctiLlmDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("existing"),
    topic_id: z.string().trim().min(1),
    confidence: z.number(),
    new_topic: z.null(),
  }),
  z.object({
    decision: z.literal("new"),
    topic_id: z.null(),
    confidence: z.number(),
    new_topic: newTopicSchema,
  }),
]);

export type CtiLlmDecision = z.infer<typeof ctiLlmDecisionSchema>;
