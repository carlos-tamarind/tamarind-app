import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { findOrCreateConversation } from "@/lib/conversations.functions";
import { withConversation } from "@/lib/workspace-search";

export function useNavigateToUserConversation(
  workspaceId: string,
  myWorkspaceUserId: string | null | undefined,
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const findOrCreate = useServerFn(findOrCreateConversation);
  const [isNavigating, setIsNavigating] = useState(false);
  const inFlightRef = useRef(false);

  const navigateToUser = useCallback(
    async (workspaceUserId: string | null | undefined) => {
      if (!workspaceUserId || !myWorkspaceUserId) return;
      if (workspaceUserId === myWorkspaceUserId) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      setIsNavigating(true);
      try {
        const { conversationId } = await findOrCreate({
          data: {
            workspaceId,
            participantWorkspaceUserIds: [workspaceUserId],
          },
        });
        queryClient.invalidateQueries({
          queryKey: ["conversations-list", workspaceId],
        });
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId },
          search: (prev) => withConversation(prev, conversationId),
        });
      } catch (e) {
        console.error(e);
      } finally {
        inFlightRef.current = false;
        setIsNavigating(false);
      }
    },
    [workspaceId, myWorkspaceUserId, findOrCreate, queryClient, navigate],
  );

  return { navigateToUser, isNavigating };
}
