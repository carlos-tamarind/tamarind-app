import { formatDaysUntilPurge } from "@/lib/delete-entities/config";

export function PageDeletionBanner({
  purgedAt,
  isOwner,
  onRecover,
  onEraseNow,
  className = "",
}: {
  purgedAt: string;
  isOwner: boolean;
  onRecover?: () => void;
  onEraseNow?: () => void;
  className?: string;
}) {
  const when = formatDaysUntilPurge(purgedAt);
  const whenPhrase = when === "today" ? "today" : `in ${when}`;

  if (!isOwner) {
    return (
      <p className={`shrink-0 text-xs text-muted-foreground ${className}`}>
        This page will be erased {whenPhrase}.
      </p>
    );
  }

  return (
    <p className={`shrink-0 text-xs text-muted-foreground ${className}`}>
      This page will be erased {whenPhrase}.{" "}
      <button
        type="button"
        className="cursor-pointer underline underline-offset-2 hover:text-foreground"
        onClick={onRecover}
      >
        Undo
      </button>
      {" or "}
      <button
        type="button"
        className="cursor-pointer underline underline-offset-2 hover:text-foreground"
        onClick={onEraseNow}
      >
        Erase now
      </button>
    </p>
  );
}
