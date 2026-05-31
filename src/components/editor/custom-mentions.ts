import Mention from "@tiptap/extension-mention";

// A page mention node. Stored as { id, label } so backlink scans can match by id.
export const PageMention = Mention.extend({
  name: "pageMention",
}).configure({
  HTMLAttributes: { class: "mention-page", "data-mention-type": "page" },
  renderText({ node }) {
    return `@@${node.attrs.label ?? node.attrs.id}`;
  },
});

// A conversation mention node.
export const ConversationMention = Mention.extend({
  name: "conversationMention",
}).configure({
  HTMLAttributes: {
    class: "mention-conversation",
    "data-mention-type": "conversation",
  },
  renderText({ node }) {
    return `\\${node.attrs.label ?? node.attrs.id}`;
  },
});
