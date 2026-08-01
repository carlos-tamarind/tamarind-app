import { useEffect, useRef, useState } from "react";
import { FileText, MessageSquareMore, SlidersHorizontal, User } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SearchFilter = "all" | "conversation" | "page" | "user";

const FILTERS: {
  value: SearchFilter;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "all", label: "All" },
  { value: "conversation", label: "Conversations & messages", icon: MessageSquareMore },
  { value: "page", label: "Pages", icon: FileText },
  { value: "user", label: "Users & conversations", icon: User },
];

export function SearchOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [showFilters, setShowFilters] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[35vh] min-h-[380px] w-[55vw] max-w-[900px] flex-col gap-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>

        <div className="flex h-1/5 min-h-[72px] shrink-0 items-center gap-3 px-6 pr-14">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything…"
            className="min-w-0 flex-1 bg-transparent text-2xl font-light outline-none placeholder:text-muted-foreground/60"
          />
          <TooltipProvider delayDuration={2000}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  aria-label="Filter your search"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <SlidersHorizontal className="size-4" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Filter your search</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {showFilters ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-3">
            {FILTERS.map(({ value, label, icon: Icon }) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  onClick={() => setFilter(active ? "all" : value)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {Icon ? <Icon className="size-3.5" strokeWidth={1.5} /> : null}
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6" />
      </DialogContent>
    </Dialog>
  );
}
