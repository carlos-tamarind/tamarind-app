import { createFileRoute } from "@tanstack/react-router";
import { createAgentHandler } from "@/search/agents/http.server";

const handler = createAgentHandler("session");
export const Route = createFileRoute("/api/agents/session")({
  server: { handlers: { ANY: ({ request }) => handler(request) } },
});
