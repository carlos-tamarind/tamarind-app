import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceId/c/$conversationId",
)({
  beforeLoad: ({ params }) =>
    redirect({
      to: "/w/$workspaceId",
      params: { workspaceId: params.workspaceId },
      search: { c: params.conversationId },
      replace: true,
    }),
});
