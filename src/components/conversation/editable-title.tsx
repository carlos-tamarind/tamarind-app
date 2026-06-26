import { useEffect, useRef, useState } from "react";
import { Check, LockKeyhole, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function EditableTitle({
  value,
  editable,
  onSave,
  className,
  inputClassName,
}: {
  value: string;
  editable: boolean;
  onSave: (next: string) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelPendingRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      // focus + select
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const start = () => {
    cancelPendingRef.current = false;
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    cancelPendingRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  const confirm = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // If focus stayed within container (clicking confirm/cancel), do nothing
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    if (cancelPendingRef.current) return;
    cancel();
  };

  if (!editable) {
    return (
      <div className={`flex min-w-0 items-center gap-2 ${className ?? ""}`}>
        <span className="min-w-0 truncate">{value}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <LockKeyhole className="size-3.5 shrink-0 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Private conversation</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className={`flex min-w-0 items-center gap-2 ${className ?? ""}`}>
        <span className="min-w-0 truncate">{value}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              onClick={start}
              aria-label="Edit title"
            >
              <Pencil className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Rename conversation</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-w-0 items-center gap-1 ${className ?? ""}`}
      onBlur={handleBlur}
    >
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void confirm();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={`min-w-0 flex-1 rounded border border-input bg-background px-2 py-0.5 text-base font-semibold focus:outline-none focus:ring-1 focus:ring-ring ${inputClassName ?? ""}`}
        maxLength={120}
      />
      <Button
        size="icon"
        variant="ghost"
        className="size-6 shrink-0"
        onMouseDown={(e) => {
          e.preventDefault();
          cancel();
        }}
        aria-label="Cancel"
      >
        <X className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-6 shrink-0"
        disabled={saving}
        onMouseDown={(e) => {
          e.preventDefault();
          void confirm();
        }}
        aria-label="Confirm"
      >
        <Check className="size-3.5" />
      </Button>
    </div>
  );
}
