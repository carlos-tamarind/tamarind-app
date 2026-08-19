import { useEffect, useRef, useState } from "react";

/**
 * Keyboard shortcuts for a browser-hosted app.
 *
 * Tamarind runs in a tab, so the usable binding set is limited to what the
 * browser will surrender. Chromium and Firefox reserve Cmd/Ctrl + N, T, W, Q
 * and Shift+N at the OS/chrome level — page JavaScript never sees them, and
 * preventDefault cannot reclaim them. Do not add bindings using those.
 *
 * Binding syntax: "mod+k", "mod+f", "mod+\\", "mod+,", "escape".
 * `mod` resolves to Cmd on macOS and Ctrl everywhere else.
 */

type ParsedCombo = {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
};

/** Return `false` to decline the event and let the next handler try it. */
type HotkeyHandler = (event: KeyboardEvent) => void | boolean;

type Registration = {
  combo: ParsedCombo;
  handler: HotkeyHandler;
  allowInInput: boolean;
};

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(
    // `userAgentData` is not everywhere yet; `platform` is deprecated but is
    // still the most reliable cross-browser signal for this purpose.
    (navigator as unknown as { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent,
  );
}

function parseCombo(binding: string): ParsedCombo {
  const parts = binding.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  return {
    key,
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  };
}

function matches(event: KeyboardEvent, combo: ParsedCombo, isMac: boolean): boolean {
  const modPressed = isMac ? event.metaKey : event.ctrlKey;
  // The opposite modifier must not be held, so Ctrl+K on a Mac does not
  // trigger a binding meant for Cmd+K.
  const otherMod = isMac ? event.ctrlKey : event.metaKey;
  if (combo.mod !== modPressed) return false;
  if (otherMod) return false;
  if (combo.shift !== event.shiftKey) return false;
  if (combo.alt !== event.altKey) return false;
  // Shift+backslash reports "|" as event.key. Match the physical key instead.
  if (combo.key === "\\") return event.code === "Backslash";
  return event.key.toLowerCase() === combo.key;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  // TipTap surfaces are contenteditable, but guard on the class too in case
  // focus lands on a nested non-editable node inside the editor.
  return Boolean(target.closest(".ProseMirror"));
}

// Single delegated listener. Registrations are consulted newest-first so a
// layer mounted later (a dialog, the palette) gets first refusal on a key
// before anything mounted beneath it.
const registry: Registration[] = [];
let listenerAttached = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  const isMac = isMacPlatform();
  const editable = isEditableTarget(event.target);

  for (let i = registry.length - 1; i >= 0; i--) {
    const reg = registry[i];
    if (editable && !reg.allowInInput) continue;
    if (!matches(event, reg.combo, isMac)) continue;
    if (reg.handler(event) === false) continue;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
}

function register(reg: Registration): () => void {
  registry.push(reg);
  if (!listenerAttached) {
    document.addEventListener("keydown", onKeyDown);
    listenerAttached = true;
  }
  return () => {
    const index = registry.indexOf(reg);
    if (index !== -1) registry.splice(index, 1);
    if (registry.length === 0 && listenerAttached) {
      document.removeEventListener("keydown", onKeyDown);
      listenerAttached = false;
    }
  };
}

export function useHotkey(
  binding: string,
  handler: HotkeyHandler,
  options: { enabled?: boolean; allowInInput?: boolean } = {},
) {
  const { enabled = true, allowInInput = false } = options;

  // Held in a ref so callers need not memoize; re-registering on every render
  // would also reshuffle the layer ordering the registry depends on.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    // Escape must work while typing, otherwise it cannot dismiss a layer
    // opened from a focused input.
    const allow = allowInInput || binding.toLowerCase() === "escape";
    return register({
      combo: parseCombo(binding),
      handler: (event) => handlerRef.current(event),
      allowInInput: allow,
    });
  }, [binding, enabled, allowInInput]);
}

const KEY_GLYPHS: Record<string, { mac: string; other: string }> = {
  mod: { mac: "⌘", other: "Ctrl" },
  shift: { mac: "⇧", other: "Shift" },
  alt: { mac: "⌥", other: "Alt" },
  enter: { mac: "↵", other: "Enter" },
  escape: { mac: "Esc", other: "Esc" },
  backslash: { mac: "\\", other: "\\" },
  comma: { mac: ",", other: "," },
};

/**
 * Renders a binding as display glyphs. Single source of truth for the Cmd vs
 * Ctrl decision so no hint chip can drift from the actual binding.
 */
export function formatShortcut(binding: string, isMac: boolean): string {
  return binding
    .toLowerCase()
    .split("+")
    .map((part) => {
      const glyph = KEY_GLYPHS[part];
      if (glyph) return isMac ? glyph.mac : glyph.other;
      if (part === "\\") return "\\";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(isMac ? "" : "+");
}

/**
 * Platform detection resolved after mount. Server and first client render
 * agree on the non-Mac form, then Mac users get the glyph form — avoiding a
 * hydration mismatch on every shortcut hint in the app.
 */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(isMacPlatform()), []);
  return isMac;
}

export function useShortcutLabel(binding: string): string {
  const isMac = useIsMac();
  return formatShortcut(binding, isMac);
}

/** Canonical bindings, referenced by both handlers and hint chips. */
export const HOTKEYS = {
  commandPalette: "mod+k",
  search: "mod+f",
  toggleNav: "mod+\\",
  toggleWorkspaces: "mod+shift+\\",
  workspaceSettings: "mod+,",
  send: "mod+enter",
  bold: "mod+b",
  italic: "mod+i",
  code: "mod+e",
} as const;
