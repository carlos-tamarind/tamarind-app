import { z } from "zod";

import type { LlmJsonSchema } from "@/semantic/llm/types";

export const CONVERSATION_SUGGESTION_LLM_JSON_SCHEMA: LlmJsonSchema = {
  name: "conversation_suggestion_judge",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "entity_id", "confidence", "reason", "notification_text"],
    properties: {
      decision: { type: "string", enum: ["suggest", "reject"] },
      entity_id: { type: ["string", "null"] },
      confidence: { type: "number" },
      reason: { type: ["string", "null"] },
      notification_text: { type: ["string", "null"] },
    },
  },
};

export const conversationSuggestionLlmSchema = z
  .object({
    decision: z.enum(["suggest", "reject"]),
    entity_id: z.string().uuid().nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string().nullable(),
    notification_text: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "suggest") {
      if (!value.entity_id) {
        ctx.addIssue({
          code: "custom",
          message: "entity_id is required when decision is suggest",
          path: ["entity_id"],
        });
      }
      if (!value.reason?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "reason is required when decision is suggest",
          path: ["reason"],
        });
      }
      if (!value.notification_text?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "notification_text is required when decision is suggest",
          path: ["notification_text"],
        });
      }
    }
  });

export type ConversationSuggestionLlmOutput = z.infer<typeof conversationSuggestionLlmSchema>;
