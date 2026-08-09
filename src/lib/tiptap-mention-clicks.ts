import type { NavigateOptions } from "@tanstack/react-router";

type NavigateFn = (options: NavigateOptions) => void;

export function createMentionClickHandler(options: {
  navigate: NavigateFn;
  workspaceId: string;
  getMyWorkspaceUserId: () => string | null | undefined;
  navigateToUser: (workspaceUserId: string) => void;
}) {
  const { navigate, workspaceId, getMyWorkspaceUserId, navigateToUser } = options;

  return (_view: unknown, _pos: number, node: { type: { name: string }; attrs: Record<string, unknown> }) => {
    if (node.type.name === "pageMention" && node.attrs.id) {
      navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev: Record<string, unknown>) => ({ ...prev, p: String(node.attrs.id) }),
      });
      return true;
    }
    if (node.type.name === "conversationMention" && node.attrs.id) {
      navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev: Record<string, unknown>) => ({ ...prev, c: String(node.attrs.id) }),
      });
      return true;
    }
    if (node.type.name === "mention" && node.attrs.id) {
      const id = node.attrs.id as string;
      if (id !== getMyWorkspaceUserId()) {
        navigateToUser(id);
      }
      return true;
    }
    return false;
  };
}
