import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/run-page-chunking-worker")({
  server: {
    handlers: {
      POST: async () => {
        if (!import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOGS !== "true") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("list_pages_due_for_chunking", {
            p_idle: "5 minutes",
            p_limit: 20,
          });
          if (error) throw new Error(error.message);

          const pageIds = (data ?? []).map((page) => page.id);
          return Response.json({ pagesDue: pageIds.length, pageIds });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
