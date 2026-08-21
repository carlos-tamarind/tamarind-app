import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/*
 * Types are loosened at the ProseMirror boundary on purpose: depending on how the
 * package manager hoists prosemirror-model / prosemirror-view, TypeScript can see two
 * structurally identical but nominally different copies of Node / DecorationSet.
 */
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
            return set.map(tr.mapping, tr.doc as never);
          },
        },
        props: {
          decorations(state) {
            return key.getState(state) as never;
          },
        },
      }),
    ];
  },
});

export function flashChunkRange(editor: Editor, from: number, to: number) {
  const deco = Decoration.inline(from, to, { class: "chunk-flash" });
  const set = DecorationSet.create(editor.state.doc as never, [deco]);
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
