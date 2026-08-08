import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { CircleX } from "lucide-react";

import { UserLink } from "@/components/user-link";
import { useUserNavigation } from "@/lib/user-navigation-context";

export interface QuoteBlockAttrs {
  quoteId: string | null;
  author: string | null;
  authorId: string | null;
  createdAt: string | null;
}

function formatTimestamp(createdAt: string | null) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function QuoteBlockView(props: any) {
  const { node, deleteNode, editor } = props;
  const nav = useUserNavigation();
  const timestamp = formatTimestamp(node.attrs.createdAt);
  const editable = editor?.isEditable ?? false;

  return (
    <NodeViewWrapper
      as="div"
      className="msg-quote group relative my-1 rounded-md border bg-muted/50 px-3 py-2"
      data-quote-id={node.attrs.quoteId ?? undefined}
      data-author={node.attrs.author ?? undefined}
      data-author-id={node.attrs.authorId ?? undefined}
      data-created-at={node.attrs.createdAt ?? undefined}
    >
      {node.attrs.author || timestamp ? (
        <div
          className="msg-quote-header mb-1 select-none text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          contentEditable={false}
          data-author={node.attrs.author ?? undefined}
          data-author-id={node.attrs.authorId ?? undefined}
        >
          {nav && node.attrs.authorId ? (
            <>
              <UserLink
                workspaceId={nav.workspaceId}
                workspaceUserId={node.attrs.authorId}
                myWorkspaceUserId={nav.myWorkspaceUserId}
                label={node.attrs.author ?? "Archived user"}
                className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              />
              {timestamp ? ` · ${timestamp}` : null}
            </>
          ) : (
            <>
              {node.attrs.author}
              {timestamp ? ` · ${timestamp}` : null}
            </>
          )}
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
      authorId: {
        default: null,
        parseHTML: (el) => {
          const root = el as HTMLElement;
          return (
            root.getAttribute("data-author-id") ??
            root.querySelector(".msg-quote-header")?.getAttribute("data-author-id")
          );
        },
        renderHTML: (attrs) =>
          attrs.authorId ? { "data-author-id": attrs.authorId } : {},
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
