import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { User as UserIcon, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyWorkspaceProfile,
  updateMyDisplayName,
} from "@/lib/profile.functions";

export function ProfileDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyWorkspaceProfile);
  const renameFn = useServerFn(updateMyDisplayName);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", workspaceId],
    queryFn: () => fetchProfile({ data: { workspaceId } }),
    enabled: open,
  });

  const fullName = profile?.displayName ?? profile?.email ?? "";
  const [name, setName] = useState(fullName);

  useEffect(() => {
    setName(fullName);
  }, [fullName, open]);

  const dirty = name.trim().length > 0 && name.trim() !== fullName;

  const renameMut = useMutation({
    mutationFn: (displayName: string) =>
      renameFn({ data: { workspaceId, displayName } }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-profile", workspaceId] });
      qc.invalidateQueries({ queryKey: ["my-workspaces"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update profile"),
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar className="size-20">
            {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} /> : null}
            <AvatarFallback>
              <UserIcon className="size-8 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <div className="text-base font-medium">{fullName || "—"}</div>
            {profile?.email && profile.displayName ? (
              <div className="text-xs text-muted-foreground">{profile.email}</div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-display-name">Display name</Label>
          <div className="relative">
            <Input
              id="profile-display-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="Your name"
              className="pr-14"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/70 tabular-nums"
            >
              {name.length}/40
            </span>
          </div>
          {name.trim().length < 3 ? (
            <p className="text-xs text-muted-foreground">
              Display name must be at least 3 characters.
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setName(fullName)}
              disabled={!dirty || renameMut.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => renameMut.mutate(name.trim())}
              disabled={!dirty || renameMut.isPending || name.trim().length < 3}
            >
              {renameMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Confirm
            </Button>
          </div>
        </div>


        <div className="mt-4 flex justify-center border-t pt-4">
          <Button onClick={handleLogout} className="min-w-32">
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
