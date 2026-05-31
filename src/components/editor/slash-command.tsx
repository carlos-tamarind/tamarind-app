import { Extension, ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  Type,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
} from "lucide-react";

type Cmd = {
  title: string;
  icon: React.ReactNode;
  run: (editor: any, range: any) => void;
};

const COMMANDS: Cmd[] = [
  {
    title: "Text",
    icon: <Type className="size-4" />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .clearNodes()
        .setParagraph()
        .run(),
  },
  {
    title: "Heading 1",
    icon: <Heading1 className="size-4" />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .clearNodes()
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    title: "Heading 2",
    icon: <Heading2 className="size-4" />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .clearNodes()
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    title: "Heading 3",
    icon: <Heading3 className="size-4" />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .clearNodes()
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    title: "Bullet list",
    icon: <List className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    icon: <ListOrdered className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Task list",
    icon: <CheckSquare className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Quote",
    icon: <Quote className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    icon: <Code className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    icon: <Minus className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Bold",
    icon: <BoldIcon className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBold().run(),
  },
  {
    title: "Italic",
    icon: <ItalicIcon className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleItalic().run(),
  },
  {
    title: "Underline",
    icon: <UnderlineIcon className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleUnderline().run(),
  },
  {
    title: "Strikethrough",
    icon: <Strikethrough className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleStrike().run(),
  },
];

const SlashMenu = forwardRef<
  { onKeyDown: (e: { event: KeyboardEvent }) => boolean },
  { items: Cmd[]; command: (item: Cmd) => void }
>((props, ref) => {
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setIndex((i) => (i + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % props.items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = props.items[index];
        if (item) props.command(item);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) return null;

  return (
    <div className="z-50 max-h-72 w-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
      {props.items.map((item, i) => (
        <button
          key={item.title}
          onClick={() => props.command(item)}
          className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
            i === index ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          }`}
        >
          {item.icon}
          <span>{item.title}</span>
        </button>
      ))}
    </div>
  );
});
SlashMenu.displayName = "SlashMenu";

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        command: ({ editor, range, props }: any) => {
          props.run(editor, range);
        },
        items: ({ query }: any) =>
          COMMANDS.filter((c) =>
            c.title.toLowerCase().includes(query.toLowerCase()),
          ).slice(0, 12),
        render: () => {
          let component: ReactRenderer | null = null;
          let popup: TippyInstance | null = null;
          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
              });
              popup = tippy(document.body, {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate: (props: any) => {
              component?.updateProps(props);
              popup?.setProps({ getReferenceClientRect: props.clientRect });
            },
            onKeyDown: (props: any) => {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              return (component?.ref as any)?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
