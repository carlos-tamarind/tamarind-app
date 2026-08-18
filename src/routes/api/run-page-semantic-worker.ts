import { createFileRoute } from "@tanstack/react-router";

import { runPageSemanticWorker } from "@/semantic/pages/page-semantics/worker/runPageSemanticWorker";

export const Route = createFileRoute("/api/run-page-semantic-worker")({
  server: {
    handlers: {
      POST: async () => {
        if (!import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOGS !== "true") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        try {
          const result = await runPageSemanticWorker();
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
