import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";

// Inline Lucide SVGs (stroke=currentColor) so the DOM is deterministic
// for SSR/copy-paste and the icon inherits the chip's text color.
type SvgChild = [string, Record<string, string>];
type SvgSpec = [string, Record<string, string | number>, ...SvgChild[]];

const NS = "http://www.w3.org/2000/svg";
const SVG_TAG = `${NS} svg`;
const PATH = `${NS} path`;
const CIRCLE = `${NS} circle`;
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

// lucide: user-round
const USER_ROUND: SvgSpec = [
  SVG_TAG,
  SVG_BASE,
  [CIRCLE, { cx: "12", cy: "8", r: "5" }],
  [PATH, { d: "M20 21a8 8 0 0 0-16 0" }],
];

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

// lucide: messages-square
const MESSAGES_SQUARE: SvgSpec = [
  SVG_TAG,
  SVG_BASE,
  [
    PATH,
    {
      d: "M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2z",
    },
  ],
  [
    PATH,
    {
      d: "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1",
    },
  ],
];


function buildRenderHTML(icon: SvgSpec, defaultClass: string): any {
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
  renderHTML: buildRenderHTML(USER_ROUND, "mention-member"),
  renderText: buildRenderText(),
});

export const PageMention = Mention.extend({
  name: "pageMention",
  renderHTML: buildRenderHTML(NOTEBOOK_TEXT, "mention-page"),
  renderText: buildRenderText(),
});

export const ConversationMention = Mention.extend({
  name: "conversationMention",
  renderHTML: buildRenderHTML(MESSAGES_SQUARE, "mention-conversation"),
  renderText: buildRenderText(),
});
