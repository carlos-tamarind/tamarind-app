import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  getVisibleConversationSuggestion,
  removeVisibleConversationSuggestion,
  setVisibleConversationSuggestion,
} from "@/lib/conversation-suggestion-session";
import {
  getPendingConversationSuggestion,
  markConversationSuggestionClicked,
  markConversationSuggestionDismissed,
  markConversationSuggestionShown,
  submitConversationSuggestionFeedback,
  type PendingConversationSuggestion,
} from "@/lib/conversation-suggestions.functions";
import { withConversation, withPage } from "@/lib/workspace-search";

const POLL_MS = 45_000;

async function revealSuggestion(params: {
  conversationId: string;
  pending: PendingConversationSuggestion;
  markShown: (args: { data: { conversationId: string; suggestionId: string } }) => Promise<unknown>;
  mounted: { current: boolean };
  setVisible: (value: PendingConversationSuggestion) => void;
}) {
  try {
    await params.markShown({
      data: {
        conversationId: params.conversationId,
        suggestionId: params.pending.id,
      },
    });
  } catch {
    return;
  }
  if (!params.mounted.current) return;
  setVisibleConversationSuggestion(params.pending);
  params.setVisible(params.pending);
}

export function useConversationSuggestion(params: { workspaceId: string; conversationId: string }) {
  const { workspaceId, conversationId } = params;
  const navigate = useNavigate();
  const fetchPending = useServerFn(getPendingConversationSuggestion);
  const markShown = useServerFn(markConversationSuggestionShown);
  const markClicked = useServerFn(markConversationSuggestionClicked);
  const markDismissed = useServerFn(markConversationSuggestionDismissed);
  const submitFeedback = useServerFn(submitConversationSuggestionFeedback);

  const [visible, setVisible] = useState<PendingConversationSuggestion | null>(() =>
    getVisibleConversationSuggestion(conversationId),
  );
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFetchDoneRef = useRef(false);
  const mountedRef = useRef(true);

  const pendingQuery = useQuery({
    queryKey: ["conversation-suggestion-pending", conversationId],
    queryFn: () => fetchPending({ data: { conversationId } }),
    enabled: visible === null,
    refetchInterval: visible === null ? POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: POLL_MS,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const pending = pendingQuery.data;
    if (pending === undefined) return;

    if (!initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      if (!pending || visible) return;

      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        void revealSuggestion({
          conversationId,
          pending,
          markShown,
          mounted: mountedRef,
          setVisible,
        });
      }, pending.delayAfterOpenMs);
      return;
    }

    if (!pending || visible) return;
    if (delayTimerRef.current) return;

    void revealSuggestion({
      conversationId,
      pending,
      markShown,
      mounted: mountedRef,
      setVisible,
    });
  }, [conversationId, markShown, pendingQuery.data, visible]);

  const clearVisible = () => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    removeVisibleConversationSuggestion(conversationId);
    setVisible(null);
    setFeedback(null);
  };

  const onDismiss = async () => {
    if (!visible) return;
    await markDismissed({
      data: { conversationId, suggestionId: visible.id },
    });
    clearVisible();
  };

  const onOpen = async () => {
    if (!visible) return;
    await markClicked({
      data: { conversationId, suggestionId: visible.id },
    });
    const target = visible;
    clearVisible();
    if (target.entityType === "page_chunk" && target.pageId) {
      void navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev) => withPage(prev, target.pageId!, target.entityId),
      });
      return;
    }
    if (target.entityType === "message" && target.targetConversationId) {
      void navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev) => withConversation(prev, target.targetConversationId!, target.entityId),
      });
    }
  };

  const onFeedback = async (type: "positive" | "negative") => {
    if (!visible || feedback) return;
    setFeedback(type);
    await submitFeedback({
      data: {
        conversationId,
        suggestionId: visible.id,
        feedbackType: type,
      },
    });
  };

  return { visible, feedback, onOpen, onDismiss, onFeedback };
}
