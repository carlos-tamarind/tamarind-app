import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

import { DebugLogger } from "@/lib/debugLogger";

const LOG_SCOPE = "page-chunking-worker-cron";
const SECRET_HEADER = "x-page-chunking-worker-secret";

function notFound(): Response {
  return new Response(null, { status: 404 });
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/internal/run-page-chunking-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.PAGE_CHUNKING_WORKER_SECRET;
        if (!expected) {
          DebugLogger.log({
            scope: LOG_SCOPE,
            event: "SECRET_NOT_CONFIGURED",
            message: "PAGE_CHUNKING_WORKER_SECRET is not set",
            level: "error",
          });
          return Response.json({ error: "Unavailable" }, { status: 503 });
        }

        const provided = request.headers.get(SECRET_HEADER);
        if (!provided || !secretsMatch(provided, expected)) {
          return notFound();
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("list_pages_due_for_chunking", {
            p_idle: "5 minutes",
            p_limit: 20,
          });
          if (error) throw new Error(error.message);

          const pageIds = (data ?? []).map((page) => page.id);
          DebugLogger.log({
            scope: LOG_SCOPE,
            event: "TICK_COMPLETE",
            message: `${pageIds.length} pages due`,
          });
          return Response.json({ pagesDue: pageIds.length, pageIds });
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
