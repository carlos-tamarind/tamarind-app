import { useMemo, useState } from "react";

import { FilterInput } from "@/components/filter-input";
import { MemberPickerRow } from "@/components/member-picker-row";
import { cn } from "@/lib/utils";

export type MemberPickerItem = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  sublabel?: string | null;
  checked: boolean;
  onToggle: () => void;
};

export function MemberPickerList({
  items,
  placeholder = "Filter…",
  emptyMessage = "No other members available.",
  noMatchMessage = "No matching members.",
  maxHeightClass = "max-h-56",
}: {
  items: MemberPickerItem[];
  placeholder?: string;
  emptyMessage?: string;
  noMatchMessage?: string;
  maxHeightClass?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      <FilterInput value={query} onChange={setQuery} placeholder={placeholder} />
      <div className={cn("overflow-y-auto rounded-lg border p-1", maxHeightClass)}>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{noMatchMessage}</p>
        ) : (
          <ul>
            {filtered.map((item) => (
              <li key={item.id}>
                <MemberPickerRow
                  label={item.label}
                  sublabel={item.sublabel}
                  avatarUrl={item.avatarUrl}
                  checked={item.checked}
                  onToggle={item.onToggle}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
