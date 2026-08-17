import { createFileRoute } from "@tanstack/react-router";

import { runPageChunkingWorker } from "@/semantic/pages/page-chunks/worker/runPageChunkingWorker";

export const Route = createFileRoute("/api/run-page-chunking-worker")({
  server: {
    handlers: {
      POST: async () => {
        if (!import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOGS !== "true") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        try {
          const result = await runPageChunkingWorker();
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
