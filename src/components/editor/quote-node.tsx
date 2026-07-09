import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { CircleX } from "lucide-react";

export interface QuoteBlockAttrs {
  quoteId: string | null;
  author: string | null;
  createdAt: string | null;
}

function formatHeader(author: string | null, createdAt: string | null) {
  const parts: string[] = [];
  if (author) parts.push(author);
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      parts.push(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    }
  }
  return parts.join(" · ");
}

function QuoteBlockView(props: any) {
  const { node, deleteNode, editor } = props;
  const header = formatHeader(node.attrs.author, node.attrs.createdAt);
  const editable = editor?.isEditable ?? false;
  return (
    <NodeViewWrapper
      as="div"
      className="msg-quote group relative my-1 rounded-md border bg-muted/50 px-3 py-2"
      data-quote-id={node.attrs.quoteId ?? undefined}
      data-author={node.attrs.author ?? undefined}
      data-created-at={node.attrs.createdAt ?? undefined}
    >
      {header ? (
        <div
          className="mb-1 select-none text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          contentEditable={false}
        >
          {header}
        </div>
      ) : null}
      {editable ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
          contentEditable={false}
          aria-label="Remove quote"
          className="absolute right-1 top-1 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <CircleX className="size-4" />
        </button>
      ) : null}
      <NodeViewContent className="msg-quote-content" />
    </NodeViewWrapper>
  );
}

export const QuoteBlock = Node.create({
  name: "quoteBlock",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      quoteId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-quote-id"),
        renderHTML: (attrs) =>
          attrs.quoteId ? { "data-quote-id": attrs.quoteId } : {},
      },
      author: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-author"),
        renderHTML: (attrs) =>
          attrs.author ? { "data-author": attrs.author } : {},
      },
      createdAt: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-created-at"),
        renderHTML: (attrs) =>
          attrs.createdAt ? { "data-created-at": attrs.createdAt } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div.msg-quote" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "msg-quote" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuoteBlockView);
  },
});
