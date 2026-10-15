import { createFileRoute } from "@tanstack/react-router";
import { createAgentHandler } from "@/search/agents/http.server";

const handler = createAgentHandler("search");
export const Route = createFileRoute("/api/agents/search")({
  server: { handlers: { ANY: ({ request }) => handler(request) } },
});
