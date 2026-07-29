import { createFileRoute } from "@tanstack/react-router";

import { generateEmbeddings } from "@/semantic/embedding/embeddings.server";

export const Route = createFileRoute("/api/generate-embeddings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { status, body } = await generateEmbeddings(raw);
        return Response.json(body, { status });
      },
    },
  },
});
