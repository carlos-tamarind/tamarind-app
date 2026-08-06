import type { SearchScope } from "./types";

export function scopeSupportsSemanticSearch(scope: SearchScope): boolean {
  return scope === "all" || scope === "conversations";
}
