import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * One selectable person in a dialog. Shared by every member picker so the
 * conversation, participant and page-sharing flows all read identically.
 */
export function MemberPickerRow({
  label,
  sublabel,
  avatarUrl,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  sublabel?: string | null;
  avatarUrl?: string | null;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex h-11 items-center gap-2.5 rounded-md px-2 transition-colors duration-(--motion-fast) ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent"
      }`}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} disabled={disabled} />
      <Avatar className="size-6">
        {avatarUrl ? <AvatarImage src={avatarUrl} /> : null}
        <AvatarFallback className="text-[10px] font-medium">
          {label.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {sublabel ? (
        <span className="shrink-0 text-xs text-muted-foreground">{sublabel}</span>
      ) : null}
    </label>
  );
}
