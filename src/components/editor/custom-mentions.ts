import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";

// Inline Lucide SVG for page mentions (stroke=currentColor).
type SvgChild = [string, Record<string, string>];
type SvgSpec = [string, Record<string, string | number>, ...SvgChild[]];

const NS = "http://www.w3.org/2000/svg";
const SVG_TAG = `${NS} svg`;
const PATH = `${NS} path`;
const RECT = `${NS} rect`;

const SVG_BASE: Record<string, string | number> = {
  xmlns: NS,
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true",
  class: "mention-icon",
};

// lucide: notebook-text
const NOTEBOOK_TEXT: SvgSpec = [
  SVG_TAG,
  SVG_BASE,
  [PATH, { d: "M2 6h4" }],
  [PATH, { d: "M2 10h4" }],
  [PATH, { d: "M2 14h4" }],
  [PATH, { d: "M2 18h4" }],
  [RECT, { width: "16", height: "20", x: "4", y: "2", rx: "2" }],
  [PATH, { d: "M9.5 8h5" }],
  [PATH, { d: "M9.5 12h5" }],
  [PATH, { d: "M9.5 16H12" }],
];

function memberInitials(label: string): string {
  return label.slice(0, 2).toUpperCase();
}

function conversationInitials(label: string): string {
  return (
    label
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "C"
  );
}

function avatarUrlAttribute() {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-avatar-url"),
    renderHTML: (attributes: { avatarUrl?: string | null }) => {
      if (!attributes.avatarUrl) return {};
      return { "data-avatar-url": attributes.avatarUrl };
    },
  };
}

function buildAvatarPrefix(
  avatarUrl: string | null | undefined,
  label: string,
  initialsFn: (label: string) => string,
): any[] {
  if (avatarUrl) {
    return [["img", { class: "mention-avatar", src: avatarUrl, alt: "" }]];
  }
  return [["span", { class: "mention-avatar-fallback" }, initialsFn(label)]];
}

function buildAvatarRenderHTML(defaultClass: string, initialsFn: (label: string) => string): any {
  return function renderHTML(this: any, { node, HTMLAttributes }: any) {
    const label = node.attrs.label ?? node.attrs.id;
    const avatarUrl = node.attrs.avatarUrl as string | null | undefined;
    const attrs: Record<string, string> = {
      "data-id": node.attrs.id,
      "data-label": label,
    };
    if (avatarUrl) attrs["data-avatar-url"] = avatarUrl;
    return [
      "span",
      mergeAttributes({ class: defaultClass }, this.options.HTMLAttributes, HTMLAttributes, attrs),
      ...buildAvatarPrefix(avatarUrl, label, initialsFn),
      ` ${label}`,
    ] as any;
  };
}

function buildPageRenderHTML(icon: SvgSpec, defaultClass: string): any {
  return function renderHTML(this: any, { node, HTMLAttributes }: any) {
    const label = node.attrs.label ?? node.attrs.id;
    return [
      "span",
      mergeAttributes(
        { class: defaultClass },
        this.options.HTMLAttributes,
        HTMLAttributes,
        { "data-id": node.attrs.id, "data-label": label },
      ),
      icon,
      ` ${label}`,
    ] as any;
  };
}

function buildRenderText(): any {
  return ({ node }: any) => `${node.attrs.label ?? node.attrs.id}`;
}

export const MemberMention = Mention.extend({
  name: "mention",
  addAttributes() {
    return {
      ...this.parent?.(),
      avatarUrl: avatarUrlAttribute(),
    };
  },
  renderHTML: buildAvatarRenderHTML("mention-member", memberInitials),
  renderText: buildRenderText(),
});

export const PageMention = Mention.extend({
  name: "pageMention",
  renderHTML: buildPageRenderHTML(NOTEBOOK_TEXT, "mention-page"),
  renderText: buildRenderText(),
});

export const ConversationMention = Mention.extend({
  name: "conversationMention",
  addAttributes() {
    return {
      ...this.parent?.(),
      avatarUrl: avatarUrlAttribute(),
    };
  },
  renderHTML: buildAvatarRenderHTML("mention-conversation", conversationInitials),
  renderText: buildRenderText(),
});
