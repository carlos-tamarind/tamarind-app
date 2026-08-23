import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { Editor, Range } from "@tiptap/core";

import { MentionList } from "@/components/editor/mention-list";
import type { MentionEntityItem } from "@/lib/mention-entities";

type MentionListItem = { id: string; label: string };

export function buildMentionSuggestion(
  char: string,
  getItems: (query: string) => Promise<MentionListItem[]>,
  options?: {
    placement?: "top-start" | "bottom-start";
    openCounter?: { current: number };
  },
) {
  return {
    char,
    items: ({ query }: { query: string }) => getItems(query),
    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance | null = null;
      let counted = false;
      return {
        onStart: (props: {
          editor: Editor;
          clientRect?: (() => DOMRect | null) | null;
        }) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });
          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: options?.placement ?? "bottom-start",
          });
          if (options?.openCounter) {
            options.openCounter.current += 1;
            counted = true;
          }
        },
        onUpdate: (props: { clientRect?: (() => DOMRect | null) | null }) => {
          component?.updateProps(props);
          popup?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          return (component?.ref as { onKeyDown: (p: { event: KeyboardEvent }) => boolean } | null)
            ?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          if (options?.openCounter && counted) {
            options.openCounter.current = Math.max(0, options.openCounter.current - 1);
            counted = false;
          }
          popup?.destroy();
          component?.destroy();
        },
      };
    },
  };
}

export function buildEntityMentionSuggestion(
  getItems: (query: string) => Promise<MentionEntityItem[]>,
  options?: {
    placement?: "top-start" | "bottom-start";
    openCounter?: { current: number };
  },
) {
  return {
    ...buildMentionSuggestion("@", getItems, options),
    command: ({
      editor,
      range,
      props,
    }: {
      editor: Editor;
      range: Range;
      props: MentionEntityItem;
    }) => {
      const type = props.kind === "conversation" ? "conversationMention" : "mention";
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type,
          attrs: {
            id: props.id,
            label: props.label,
            avatarUrl: props.avatarUrl ?? null,
          },
        })
        .run();
    },
  };
}
