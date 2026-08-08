import { cn } from "@/lib/utils";
import { useNavigateToUserConversation } from "@/hooks/use-navigate-to-user-conversation";

export function UserLink({
  workspaceId,
  workspaceUserId,
  myWorkspaceUserId,
  label,
  isMe,
  className,
  onNavigate,
}: {
  workspaceId: string;
  workspaceUserId: string | null | undefined;
  myWorkspaceUserId?: string | null;
  label: string;
  isMe?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const isSelf =
    isMe ??
    (!!workspaceUserId &&
      !!myWorkspaceUserId &&
      workspaceUserId === myWorkspaceUserId);

  const { navigateToUser, isNavigating } = useNavigateToUserConversation(
    workspaceId,
    myWorkspaceUserId,
  );

  if (!workspaceUserId || isSelf) {
    return <span className={className}>{label}</span>;
  }

  return (
    <button
      type="button"
      disabled={isNavigating}
      className={cn(
        "inline cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit underline-offset-2 hover:underline disabled:opacity-60",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onNavigate?.();
        void navigateToUser(workspaceUserId);
      }}
    >
      {label}
    </button>
  );
}
