import type { PendingConversationSuggestion } from "@/lib/conversation-suggestions.functions";

const STORAGE_KEY = "tamarind:conversation-suggestions:visible";

type VisibleMap = Record<string, PendingConversationSuggestion>;

function readMap(): VisibleMap {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as VisibleMap;
  } catch {
    return {};
  }
}

function writeMap(map: VisibleMap) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getVisibleConversationSuggestion(
  conversationId: string,
): PendingConversationSuggestion | null {
  return readMap()[conversationId] ?? null;
}

export function setVisibleConversationSuggestion(suggestion: PendingConversationSuggestion) {
  const map = readMap();
  map[suggestion.conversationId] = suggestion;
  writeMap(map);
}

export function removeVisibleConversationSuggestion(conversationId: string) {
  const map = readMap();
  if (!(conversationId in map)) return;
  delete map[conversationId];
  writeMap(map);
}
