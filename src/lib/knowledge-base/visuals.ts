import { KB_CONFIG } from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

// Bigger nodes carry more evidence. A sqrt scale keeps one dominant topic from
// dwarfing everything else.
export function sizeFor(evidenceCount: number, maxEvidenceCount: number) {
  const max = Math.max(1, maxEvidenceCount);
  const t = Math.min(1, Math.sqrt(Math.max(0, evidenceCount)) / Math.sqrt(max));
  return {
    width: Math.round(lerp(KB_CONFIG.MIN_NODE_WIDTH, KB_CONFIG.MAX_NODE_WIDTH, t)),
    titleFontPx: Math.round(lerp(KB_CONFIG.MIN_TITLE_FONT_PX, KB_CONFIG.MAX_TITLE_FONT_PX, t)),
  };
}

// Older topics fade out, but never below MIN_NODE_ALPHA.
export function alphaFor(lastActivityAt: string, nowMs = Date.now()) {
  const at = new Date(lastActivityAt).getTime();
  if (Number.isNaN(at)) return KB_CONFIG.MIN_NODE_ALPHA;
  const ageDays = Math.max(0, (nowMs - at) / DAY_MS);
  const decay = Math.pow(0.5, ageDays / KB_CONFIG.RECENCY_HALF_LIFE_DAYS);
  return KB_CONFIG.MIN_NODE_ALPHA + (1 - KB_CONFIG.MIN_NODE_ALPHA) * decay;
}
