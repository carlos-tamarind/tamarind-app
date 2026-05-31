import Mention from "@tiptap/extension-mention";

export const PageMention = Mention.extend({
  name: "pageMention",
  addOptions() {
    return {
      ...(this.parent?.() ?? {}),
      HTMLAttributes: { class: "mention-page", "data-mention-type": "page" },
      renderText({ node }: any) {
        return `@@${node.attrs.label ?? node.attrs.id}`;
      },
    };
  },
});

export const ConversationMention = Mention.extend({
  name: "conversationMention",
  addOptions() {
    return {
      ...(this.parent?.() ?? {}),
      HTMLAttributes: {
        class: "mention-conversation",
        "data-mention-type": "conversation",
      },
      renderText({ node }: any) {
        return `\\${node.attrs.label ?? node.attrs.id}`;
      },
    };
  },
});
