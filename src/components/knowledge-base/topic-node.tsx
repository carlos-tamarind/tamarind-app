import { memo } from "react";
import { format } from "date-fns";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { KnowledgeNode } from "@/lib/knowledge-base/types";
import { cn } from "@/lib/utils";

export type TopicNodeState = "default" | "selected" | "neighbor" | "dimmed";

export type TopicNodeData = {
  topic: KnowledgeNode;
  width: number;
  titleFontPx: number;
  alpha: number;
  state: TopicNodeState;
};

export type TopicFlowNode = Node<TopicNodeData, "topic">;

// Selected nodes widen so the description stays readable.
const EXPANDED_MIN_WIDTH = 280;

// Links are straight lines between node centres, so both handles sit invisibly
// in the middle of the box.
const centeredHandle = "!left-1/2 !top-1/2 !size-px !min-h-0 !min-w-0 !border-0 !opacity-0";

function formatActivity(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "unknown" : format(date, "PPP");
}

export const TopicNode = memo(function TopicNode({ data }: NodeProps<TopicFlowNode>) {
  const { topic, state } = data;
  const selected = state === "selected";
  const width = selected ? Math.max(data.width, EXPANDED_MIN_WIDTH) : data.width;
  const opacity = state === "dimmed" ? data.alpha * 0.3 : selected ? 1 : data.alpha;

  return (
    <div
      style={{ width, opacity }}
      className={cn(
        "cursor-pointer rounded-xl border bg-card px-3 py-2.5 text-card-foreground shadow-xs transition-[opacity,filter,box-shadow,border-color] duration-(--motion-base) ease-(--ease-out)",
        selected && "border-primary shadow-md ring-2 ring-primary/70",
        state === "neighbor" && "border-primary/50 ring-1 ring-primary/30",
        state === "dimmed" && "blur-[1.5px]",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={centeredHandle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Top}
        className={centeredHandle}
        isConnectable={false}
      />
      <p
        style={{ fontSize: data.titleFontPx }}
        className="break-words font-semibold leading-snug text-foreground"
      >
        {topic.name}
      </p>
      {selected ? (
        <div className="mt-2 space-y-1.5 rounded-lg bg-muted px-2.5 py-2">
          <p className="break-words text-xs leading-relaxed text-foreground/90">
            {topic.description}
          </p>
          <p className="text-[0.6875rem] italic text-muted-foreground">
            Last activity: {formatActivity(topic.lastActivityAt)}
          </p>
        </div>
      ) : null}
    </div>
  );
});
