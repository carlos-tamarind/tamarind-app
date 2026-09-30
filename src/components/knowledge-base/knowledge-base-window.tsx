import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReactFlowProvider } from "@xyflow/react";
import { CircleAlert, LibraryBig } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getKnowledgeGraph } from "@/lib/canonical-topics.functions";
import { KB_CONFIG } from "@/lib/knowledge-base/config";
import { knowledgeGraphQueryKey } from "@/lib/knowledge-base/query-keys";

import { KnowledgeGraphCanvas } from "./knowledge-graph-canvas";

const subscribeNoop = () => () => {};

function GraphSkeleton() {
  return (
    <div
      className="flex h-full items-center justify-center"
      role="status"
      aria-label="Loading knowledge base"
    >
      <div className="relative h-48 w-80">
        <Skeleton className="absolute left-24 top-16 h-12 w-36 rounded-xl" />
        <Skeleton className="absolute left-0 top-2 h-9 w-24 rounded-xl" />
        <Skeleton className="absolute right-0 top-4 h-9 w-28 rounded-xl" />
        <Skeleton className="absolute bottom-2 left-6 h-9 w-28 rounded-xl" />
        <Skeleton className="absolute bottom-0 right-4 h-9 w-24 rounded-xl" />
      </div>
    </div>
  );
}

export function KnowledgeBaseWindow({
  workspaceId,
  selectedTopicId,
}: {
  workspaceId: string;
  selectedTopicId?: string;
}) {
  const fetchGraph = useServerFn(getKnowledgeGraph);
  // React Flow measures the DOM; render it only on the client.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const { data, isPending, isError } = useQuery({
    queryKey: knowledgeGraphQueryKey(workspaceId),
    queryFn: () => fetchGraph({ data: { workspaceId } }),
    staleTime: KB_CONFIG.GRAPH_STALE_TIME_MS,
  });

  let content: React.ReactNode;
  if (!mounted || isPending) {
    content = <GraphSkeleton />;
  } else if (isError) {
    content = (
      <EmptyState
        icon={CircleAlert}
        title="Couldn't load the knowledge base"
        description="Try again in a moment."
      />
    );
  } else if (data.nodes.length === 0) {
    content = (
      <EmptyState
        icon={LibraryBig}
        title="No knowledge yet"
        description="Topics will appear here as conversations and pages accumulate knowledge."
      />
    );
  } else {
    content = (
      <ReactFlowProvider>
        <KnowledgeGraphCanvas
          workspaceId={workspaceId}
          graph={data}
          selectedTopicId={selectedTopicId}
        />
      </ReactFlowProvider>
    );
  }

  return (
    <section className="h-full bg-surface" aria-label="Knowledge base">
      {content}
    </section>
  );
}
