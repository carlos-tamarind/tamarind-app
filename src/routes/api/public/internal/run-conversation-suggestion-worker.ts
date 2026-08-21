import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

import { DebugLogger } from "@/lib/debugLogger";
import { runConversationSuggestionWorker } from "@/semantic/conversation-suggestions/worker/runConversationSuggestionWorker";

const LOG_SCOPE = "conversation-suggestion-worker-cron";
const SECRET_HEADER = "x-conversation-suggestions-worker-secret";

function notFound(): Response {
  return new Response(null, { status: 404 });
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/internal/run-conversation-suggestion-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CONVERSATION_SUGGESTIONS_WORKER_SECRET;
        if (!expected) {
          DebugLogger.log({
            scope: LOG_SCOPE,
            event: "SECRET_NOT_CONFIGURED",
            message: "CONVERSATION_SUGGESTIONS_WORKER_SECRET is not set",
            level: "error",
          });
          return Response.json({ error: "Unavailable" }, { status: 503 });
        }

        const provided = request.headers.get(SECRET_HEADER);
        if (!provided || !secretsMatch(provided, expected)) {
          return notFound();
        }

        try {
          const result = await runConversationSuggestionWorker();
          DebugLogger.log({
            scope: LOG_SCOPE,
            event: "TICK_COMPLETE",
            message: `${result.enqueued} enqueued · ${result.processed} processed · ${result.suggested} suggested · ${result.failed} failed`,
          });
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          DebugLogger.log({
            scope: LOG_SCOPE,
            event: "TICK_FAILED",
            message,
            level: "error",
          });
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
