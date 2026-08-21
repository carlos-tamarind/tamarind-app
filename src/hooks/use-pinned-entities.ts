import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  listMyPins,
  pinEntity,
  unpinEntity,
  type MyPins,
} from "@/lib/pins.functions";

export type PinKind = "conversation" | "page";

export function pinnedEntitiesKey(workspaceId: string) {
  return ["pinned-entities", workspaceId] as const;
}

function withEntity(pins: MyPins, kind: PinKind, entityId: string, pinned: boolean): MyPins {
  const key = kind === "conversation" ? "conversations" : "pages";
  const current = pins[key];
  const next = pinned
    ? current.includes(entityId)
      ? current
      : [...current, entityId]
    : current.filter((id) => id !== entityId);
  return { ...pins, [key]: next };
}

export function usePinnedEntities(workspaceId: string) {
  const queryClient = useQueryClient();
  const fetchPins = useServerFn(listMyPins);
  const pin = useServerFn(pinEntity);
  const unpin = useServerFn(unpinEntity);
  const queryKey = pinnedEntitiesKey(workspaceId);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchPins({ data: { workspaceId } }),
  });

  const mutation = useMutation({
    mutationFn: async (vars: {
      entityId: string;
      kind: PinKind;
      pinned: boolean;
    }) => {
      if (vars.pinned) {
        await pin({ data: { workspaceId, entityId: vars.entityId } });
      } else {
        await unpin({ data: { workspaceId, entityId: vars.entityId } });
      }
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MyPins>(queryKey);
      queryClient.setQueryData<MyPins>(queryKey, (old) =>
        withEntity(old ?? { conversations: [], pages: [] }, vars.kind, vars.entityId, vars.pinned),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const pins = query.data ?? { conversations: [], pages: [] };
  const conversationIds = new Set(pins.conversations);
  const pageIds = new Set(pins.pages);

  const isPinned = (entityId: string, kind: PinKind) =>
    kind === "conversation"
      ? conversationIds.has(entityId)
      : pageIds.has(entityId);

  const setPinned = (entityId: string, kind: PinKind, pinned: boolean) => {
    mutation.mutate({ entityId, kind, pinned });
  };

  const toggle = (entityId: string, kind: PinKind) => {
    setPinned(entityId, kind, !isPinned(entityId, kind));
  };

  return {
    ...query,
    pins,
    conversationIds,
    pageIds,
    isPinned,
    setPinned,
    toggle,
    isToggling: mutation.isPending,
  };
}
