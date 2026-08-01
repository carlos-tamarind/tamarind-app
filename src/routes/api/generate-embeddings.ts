import { createFileRoute } from "@tanstack/react-router";

import { generateMessageEmbeddingsFromRaw } from "@/semantic/messages/message-embedding/generateMessageEmbeddings";

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

        const { status, body } = await generateMessageEmbeddingsFromRaw(raw);
        return Response.json(body, { status });
      },
    },
  },
});
