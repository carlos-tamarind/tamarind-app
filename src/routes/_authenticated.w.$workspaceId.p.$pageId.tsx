import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/p/$pageId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId",
      params: { workspaceId: params.workspaceId },
      search: { p: params.pageId },
      replace: true,
    });
  },
});
