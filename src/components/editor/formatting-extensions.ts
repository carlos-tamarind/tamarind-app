import { Extension, markInputRule } from "@tiptap/core";
import Underline from "@tiptap/extension-underline";

export const UnderlineMarkdown = Underline.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)(__([^_]+)__)$/,
        type: this.type,
      }),
    ];
  },
});

export const CodeBlockHotkey = Extension.create({
  name: "codeBlockHotkey",

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-e": () => this.editor.commands.toggleCodeBlock(),
    };
  },
});
