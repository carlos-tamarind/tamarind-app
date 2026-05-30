import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

export type MentionItem = { id: string; label: string };

export const MentionList = forwardRef<
  { onKeyDown: (e: { event: KeyboardEvent }) => boolean },
  { items: MentionItem[]; command: (item: MentionItem) => void }
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

  if (props.items.length === 0) {
    return (
      <div className="z-50 w-56 rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md">
        No results
      </div>
    );
  }

  return (
    <div className="z-50 max-h-72 w-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
      {props.items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => props.command(item)}
          className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm ${
            i === index ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});
MentionList.displayName = "MentionList";
