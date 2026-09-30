import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Panel,
  ReactFlow,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import { createLucideIcon, Focus, Hand, Minus, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";

import { FilterInput } from "@/components/filter-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isMacPlatform, useHotkey } from "@/hooks/use-hotkeys";
import { estimateNodeHeight, layoutKnowledgeGraph } from "@/lib/knowledge-base/layout";
import type { KnowledgeGraph } from "@/lib/knowledge-base/types";
import { alphaFor, sizeFor } from "@/lib/knowledge-base/visuals";
import { cn } from "@/lib/utils";
import { withTopic } from "@/lib/workspace-search";

import { TopicNode, type TopicFlowNode, type TopicNodeState } from "./topic-node";

// lucide's `square-text`, which the installed lucide-react version doesn't ship.
const SquareText = createLucideIcon("square-text", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M7 8h10", key: "1jq8i3" }],
  ["path", { d: "M7 12h10", key: "1a8ki4" }],
  ["path", { d: "M7 16h6", key: "1d5j1h" }],
]);

type CanvasMode = "cursor" | "hand";

const nodeTypes: NodeTypes = { topic: TopicNode };
// Keeps fitted nodes clear of the floating filter (top), toolbar (right) and
// legend (bottom).
const FIT_VIEW_OPTIONS = {
  padding: { top: "84px", right: "72px", bottom: "84px", left: "32px" },
} as const;
const ZOOM_DURATION_MS = 200;
const NODE_ORIGIN: [number, number] = [0.5, 0];

function matchesQuery(text: string, query: string) {
  return text.toLowerCase().includes(query);
}

// Tracks ⌘ (Ctrl elsewhere), which temporarily swaps cursor and hand modes.
function useModifierHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const key = isMacPlatform() ? "Meta" : "Control";
    const onDown = (e: KeyboardEvent) => e.key === key && setHeld(true);
    const onUp = (e: KeyboardEvent) => e.key === key && setHeld(false);
    const reset = () => setHeld(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", reset);
    };
  }, []);
  return held;
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
            active
              ? "bg-accent-subtle text-accent-subtle-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function KnowledgeGraphCanvas({
  workspaceId,
  graph,
  selectedTopicId,
}: {
  workspaceId: string;
  graph: KnowledgeGraph;
  selectedTopicId?: string;
}) {
  const navigate = useNavigate();
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [mode, setMode] = useState<CanvasMode>("cursor");
  const [query, setQuery] = useState("");
  const modifierHeld = useModifierHeld();
  // Recency is measured once per mount; fading doesn't need to tick live.
  const [now] = useState(() => Date.now());
  const effectiveMode: CanvasMode = modifierHeld ? (mode === "cursor" ? "hand" : "cursor") : mode;

  const selectTopic = useCallback(
    (topicId: string | undefined) => {
      void navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev) => withTopic(prev, topicId),
        replace: true,
      });
    },
    [navigate, workspaceId],
  );

  // Layout depends only on the data, never on selection or filtering.
  const baseNodes = useMemo(() => {
    const maxEvidence = Math.max(1, ...graph.nodes.map((node) => node.evidenceCount));
    const sized = graph.nodes.map((topic) => {
      const { width, titleFontPx } = sizeFor(topic.evidenceCount, maxEvidence);
      return {
        topic,
        width,
        titleFontPx,
        height: estimateNodeHeight(topic.name, width, titleFontPx),
        alpha: alphaFor(topic.lastActivityAt, now),
      };
    });
    const positions = layoutKnowledgeGraph({
      nodes: sized.map(({ topic, width, height }) => ({ id: topic.id, width, height })),
      semanticLinks: graph.semanticLinks,
      contextEdges: graph.contextEdges,
    });
    return sized.map((node) => {
      const center = positions.get(node.topic.id) ?? { x: 0, y: 0 };
      // Top-centre origin: an expanded node grows downwards, keeping its title in place.
      return { ...node, position: { x: center.x, y: center.y - node.height / 2 } };
    });
  }, [graph, now]);

  const neighborIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedTopicId) return ids;
    for (const edge of graph.contextEdges) {
      if (edge.source === selectedTopicId) ids.add(edge.target);
      if (edge.target === selectedTopicId) ids.add(edge.source);
    }
    return ids;
  }, [graph.contextEdges, selectedTopicId]);

  const selection =
    selectedTopicId && graph.nodes.some((n) => n.id === selectedTopicId)
      ? selectedTopicId
      : undefined;
  const normalizedQuery = query.trim().toLowerCase();

  const matchedIds = useMemo(() => {
    if (!normalizedQuery) return null;
    return new Set(
      graph.nodes
        .filter(
          (node) =>
            matchesQuery(node.name, normalizedQuery) ||
            matchesQuery(node.description, normalizedQuery),
        )
        .map((node) => node.id),
    );
  }, [graph.nodes, normalizedQuery]);

  const nodes = useMemo((): TopicFlowNode[] => {
    return baseNodes.map(({ topic, width, titleFontPx, alpha, position }) => {
      let state: TopicNodeState = "default";
      if (selection) {
        state =
          topic.id === selection ? "selected" : neighborIds.has(topic.id) ? "neighbor" : "dimmed";
      }
      if (matchedIds && !matchedIds.has(topic.id) && state !== "selected") state = "dimmed";
      return {
        id: topic.id,
        type: "topic",
        position,
        zIndex: state === "selected" ? 1000 : state === "neighbor" ? 10 : 0,
        data: { topic, width, titleFontPx, alpha, state },
      };
    });
  }, [baseNodes, selection, neighborIds, matchedIds]);

  const edges = useMemo((): Edge[] => {
    return graph.contextEdges.map((edge) => {
      const touchesSelection =
        !!selection && (edge.source === selection || edge.target === selection);
      const filteredOut =
        !!matchedIds && (!matchedIds.has(edge.source) || !matchedIds.has(edge.target));
      const dimmed = (!!selection && !touchesSelection) || (!selection && filteredOut);
      return {
        id: `${edge.kind}:${edge.source}:${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: "straight",
        focusable: false,
        selectable: false,
        zIndex: touchesSelection ? 5 : 0,
        style: {
          stroke: touchesSelection ? "var(--primary)" : "var(--border-strong)",
          strokeWidth: (touchesSelection ? 1.75 : 1) + Math.min(2, Math.log2(edge.weight)),
          opacity: dimmed ? 0.15 : touchesSelection ? 0.9 : 0.7,
          transition: "opacity var(--motion-base) var(--ease-out)",
        },
      };
    });
  }, [graph.contextEdges, selection, matchedIds]);

  const onNodeClick: NodeMouseHandler<TopicFlowNode> = useCallback(
    (_event, node) => selectTopic(node.id),
    [selectTopic],
  );

  const onPaneClick = useCallback(() => {
    if (effectiveMode === "cursor" && selectedTopicId) selectTopic(undefined);
  }, [effectiveMode, selectedTopicId, selectTopic]);

  useHotkey(
    "escape",
    () => {
      if (effectiveMode !== "cursor") return false;
      selectTopic(undefined);
    },
    { enabled: !!selectedTopicId },
  );

  return (
    <div className="kb-canvas h-full w-full" data-mode={effectiveMode}>
      <ReactFlow<TopicFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodeOrigin={NODE_ORIGIN}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.1}
        maxZoom={2}
        panOnDrag={effectiveMode === "hand"}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        attributionPosition="bottom-left"
      >
        <Panel position="top-center" className="!mt-4 w-[min(26rem,calc(100%-9rem))]">
          <FilterInput
            value={query}
            onChange={setQuery}
            placeholder="Filter topics…"
            inputClassName="h-9 bg-background shadow-md"
          />
        </Panel>

        <Panel position="top-right" className="!mt-4 !mr-4">
          <div className="flex flex-col gap-0.5 rounded-lg border bg-background p-1 shadow-md">
            <ToolbarButton
              label="Recenter"
              onClick={() => void fitView({ ...FIT_VIEW_OPTIONS, duration: ZOOM_DURATION_MS })}
            >
              <Focus className="size-4" strokeWidth={1.5} />
            </ToolbarButton>
            <ToolbarButton
              label="Cursor mode"
              active={effectiveMode === "cursor"}
              onClick={() => setMode("cursor")}
            >
              <MousePointer2 className="size-4" strokeWidth={1.5} />
            </ToolbarButton>
            <ToolbarButton
              label="Hand mode"
              active={effectiveMode === "hand"}
              onClick={() => setMode("hand")}
            >
              <Hand className="size-4" strokeWidth={1.5} />
            </ToolbarButton>
            <div className="flex gap-0.5">
              <ToolbarButton
                label="Zoom in"
                onClick={() => void zoomIn({ duration: ZOOM_DURATION_MS })}
              >
                <ZoomIn className="size-4" strokeWidth={1.5} />
              </ToolbarButton>
              <ToolbarButton
                label="Zoom out"
                onClick={() => void zoomOut({ duration: ZOOM_DURATION_MS })}
              >
                <ZoomOut className="size-4" strokeWidth={1.5} />
              </ToolbarButton>
            </div>
          </div>
        </Panel>

        <Panel position="bottom-right" className="!mb-4 !mr-4 pointer-events-none">
          <ul className="space-y-1 rounded-lg border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <li className="flex items-center gap-2">
              <SquareText className="size-3.5 shrink-0" strokeWidth={1.5} />
              Nodes represent units of relevant semantic knowledge
            </li>
            <li className="flex items-center gap-2">
              <Minus className="size-3.5 shrink-0" strokeWidth={1.5} />
              Links represent shared context (page or conversation)
            </li>
          </ul>
        </Panel>
      </ReactFlow>
    </div>
  );
}
