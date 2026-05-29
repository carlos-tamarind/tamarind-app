import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { getPage, updatePage } from "@/lib/pages.functions";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/p/$pageId")({
  component: PageView,
});

function PageView() {
  const { pageId } = useParams({ from: "/_authenticated/w/$workspaceId/p/$pageId" });
  const fetchPage = useServerFn(getPage);
  const savePage = useServerFn(updatePage);

  const { data, isLoading } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => fetchPage({ data: { pageId } }),
  });

  const [title, setTitle] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: (data?.content as any) ?? { type: "doc", content: [] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[60vh]",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        savePage({ data: { pageId, content: ed.getJSON() } }).catch(() => {});
      }, 600);
    },
  });

  useEffect(() => {
    if (data && editor) {
      setTitle(data.title ?? "Untitled");
      editor.commands.setContent((data.content as any) ?? { type: "doc", content: [] });
    }
  }, [data, editor]);

  const handleTitleBlur = () => {
    if (title && title !== data?.title) {
      savePage({ data: { pageId, title } }).catch(() => {});
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 py-10">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          className="mb-6 w-full bg-transparent text-4xl font-bold outline-none placeholder:text-muted-foreground"
        />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
