import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { KnowledgeContextEdge, KnowledgeSemanticLink } from "./types";

export type LayoutNodeInput = { id: string; width: number; height: number };

type SimNode = SimulationNodeDatum & LayoutNodeInput;
type SimLink = SimulationLinkDatum<SimNode> & { strength: number; distance: number };

const TICKS = 300;
const SPIRAL_SPACING = 90;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const COLLIDE_PADDING = 18;

// Small seeded PRNG so d3's jiggle (used when two nodes coincide) is repeatable.
function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// Nodes start on a phyllotaxis spiral in input order (largest topics first, so
// they settle near the center), then semantic links pull similar topics together.
// Same input → same positions.
export function layoutKnowledgeGraph(input: {
  nodes: LayoutNodeInput[];
  semanticLinks: KnowledgeSemanticLink[];
  contextEdges: KnowledgeContextEdge[];
}): Map<string, { x: number; y: number }> {
  const nodes: SimNode[] = input.nodes.map((node, i) => {
    const radius = SPIRAL_SPACING * Math.sqrt(i + 0.5);
    const angle = i * GOLDEN_ANGLE;
    return { ...node, x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  const ids = new Set(nodes.map((node) => node.id));
  const valid = (link: { source: string; target: string }) =>
    ids.has(link.source) && ids.has(link.target) && link.source !== link.target;

  const semantic: SimLink[] = input.semanticLinks.filter(valid).map((link) => ({
    source: link.source,
    target: link.target,
    strength: 0.15 + 0.85 * link.similarity ** 2,
    distance: 140 + 260 * (1 - link.similarity),
  }));
  const maxWeight = Math.max(1, ...input.contextEdges.map((edge) => edge.weight));
  const context: SimLink[] = input.contextEdges.filter(valid).map((edge) => ({
    source: edge.source,
    target: edge.target,
    strength: 0.02 + 0.08 * (edge.weight / maxWeight),
    distance: 320,
  }));

  const simulation = forceSimulation<SimNode>(nodes)
    .randomSource(seededRandom(nodes.length + semantic.length))
    .force(
      "semantic",
      forceLink<SimNode, SimLink>(semantic)
        .id((node) => node.id)
        .strength((link) => link.strength)
        .distance((link) => link.distance),
    )
    .force(
      "context",
      forceLink<SimNode, SimLink>(context)
        .id((node) => node.id)
        .strength((link) => link.strength)
        .distance((link) => link.distance),
    )
    .force("charge", forceManyBody<SimNode>().strength(-160).distanceMax(900))
    .force(
      "collide",
      forceCollide<SimNode>()
        .radius((node) => Math.max(node.width, node.height) / 2 + COLLIDE_PADDING)
        .iterations(2),
    )
    .force("x", forceX<SimNode>(0).strength(0.03))
    .force("y", forceY<SimNode>(0).strength(0.03))
    .stop();

  simulation.tick(TICKS);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
  }
  return positions;
}

// Collapsed node height, used for collision only; the rendered box is measured
// by React Flow.
export function estimateNodeHeight(title: string, width: number, fontPx: number) {
  const innerWidth = width - 24;
  const charsPerLine = Math.max(8, Math.floor(innerWidth / (fontPx * 0.55)));
  const lines = Math.max(1, Math.ceil(title.length / charsPerLine));
  return Math.round(lines * fontPx * 1.3 + 20);
}
