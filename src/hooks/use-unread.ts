import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import {
  getUnreadSummary,
  markConversationRead,
  type UnreadConversationEntry,
  type UnreadSummary,
} from "@/lib/conversations.functions";

export type { UnreadConversationEntry };

const EMPTY_SUMMARY: UnreadSummary = { totalUnread: 0, byConversation: [] };

/** Only the field this hook writes; the rest of the cached entry passes through. */
type CachedConversation = Record<string, unknown> & {
  myLastReadAt?: string | null;
};

/** Coalesces bursts of realtime message events into a single refetch. */
const REALTIME_DEBOUNCE_MS = 250;
/** Safety net only — realtime is the primary refresh driver. */
const REFETCH_INTERVAL_MS = 60_000;

export function unreadSummaryKey(workspaceId: string) {
  return ["unread-summary", workspaceId] as const;
}

export function useUnreadSummary(workspaceId: string) {
  const queryClient = useQueryClient();
  const fetchSummary = useServerFn(getUnreadSummary);
  const markRead = useServerFn(markConversationRead);
  const queryKey = unreadSummaryKey(workspaceId);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchSummary({ data: { workspaceId } }),
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  // Workspace-wide subscription: keeps unread counts fresh for conversations
  // the user does not currently have open. The per-conversation channel in
  // ConversationWindow only covers the open thread.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: unreadSummaryKey(workspaceId) });
      }, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`unread:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);

  const mutation = useMutation({
    mutationFn: (conversationId: string) => markRead({ data: { conversationId } }),
    // Optimistic: one write here clears every surface at once — rail dot, row
    // cues, Unread folder membership, and the in-conversation chip.
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previousSummary = queryClient.getQueryData<UnreadSummary>(queryKey);
      queryClient.setQueryData<UnreadSummary>(queryKey, (old) => {
        if (!old) return old;
        const entry = old.byConversation.find(
          (c) => c.conversationId === conversationId,
        );
        if (!entry) return old;
        return {
          totalUnread: old.totalUnread - entry.unreadCount,
          byConversation: old.byConversation.filter(
            (c) => c.conversationId !== conversationId,
          ),
        };
      });

      const conversationKey = ["conversation", conversationId] as const;
      const previousConversation =
        queryClient.getQueryData<CachedConversation>(conversationKey);
      queryClient.setQueryData<CachedConversation>(conversationKey, (old) =>
        old ? { ...old, myLastReadAt: new Date().toISOString() } : old,
      );

      return { previousSummary, previousConversation, conversationKey };
    },
    onError: (_err, _conversationId, ctx) => {
      if (ctx?.previousSummary) {
        queryClient.setQueryData(queryKey, ctx.previousSummary);
      }
      if (ctx?.previousConversation) {
        queryClient.setQueryData(ctx.conversationKey, ctx.previousConversation);
      }
    },
    onSettled: (_data, _err, conversationId) => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
  });

  const summary = query.data ?? EMPTY_SUMMARY;

  const byConversationId = useMemo(() => {
    const map = new Map<string, UnreadConversationEntry>();
    for (const entry of summary.byConversation) {
      map.set(entry.conversationId, entry);
    }
    return map;
  }, [summary]);

  const markConversationReadById = (conversationId: string) => {
    mutation.mutate(conversationId);
  };

  return {
    ...query,
    totalUnread: summary.totalUnread,
    byConversationId,
    markConversationRead: markConversationReadById,
    isMarkingRead: mutation.isPending,
  };
}
