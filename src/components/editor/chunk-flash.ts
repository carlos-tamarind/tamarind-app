import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const key = new PluginKey<DecorationSet>("chunkFlash");

export const ChunkFlash = Extension.create({
  name: "chunkFlash",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(key) as DecorationSet | undefined;
            if (next) return next;
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});

export function flashChunkRange(editor: Editor, from: number, to: number) {
  const deco = Decoration.inline(from, to, { class: "chunk-flash" });
  const set = DecorationSet.create(editor.state.doc, [deco]);
  editor.view.dispatch(editor.state.tr.setMeta(key, set));
  window.requestAnimationFrame(() => {
    editor.view.dom
      .querySelector(".chunk-flash")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  window.setTimeout(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(key, DecorationSet.empty));
  }, 1400);
}
