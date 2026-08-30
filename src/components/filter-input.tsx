import { CircleX } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FilterInput({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("pr-8", inputClassName)}
      />
      {value.length > 0 ? (
        <button
          type="button"
          title="Clear filter"
          aria-label="Clear filter"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm p-0.5 text-muted-foreground transition-colors duration-(--motion-fast) hover:text-foreground"
        >
          <CircleX className="size-4" strokeWidth={1.5} />
        </button>
      ) : null}
    </div>
  );
}
