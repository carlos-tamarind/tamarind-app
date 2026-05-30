import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Settings, LogOut, FileText, Lock, Globe } from "lucide-react";

import { listMyWorkspaces } from "@/lib/workspaces.functions";
import { listMyPages } from "@/lib/pages.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/w/$workspaceId")({
  component: WorkspaceShell,
});

function WorkspaceShell() {
  const { workspaceId } = useParams({ from: "/_authenticated/w/$workspaceId" });
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(true);
  const [tab, setTab] = useState<"conversations" | "pages">("conversations");

  const fetchPages = useServerFn(listMyPages);

  const { data: workspaces } = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
  });

  const { data: pages } = useQuery({
    queryKey: ["pages-list", workspaceId],
    queryFn: () => fetchPages({ data: { workspaceId } }),
  });

  const current = workspaces?.find((w) => w.workspaceId === workspaceId);

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      {/* Workspace rail — 10% when open */}
      {railOpen && (
        <div className="flex h-full w-[10%] min-w-[64px] flex-col items-center gap-2 border-r bg-muted/30 py-3">
          <button
            onClick={() => setRailOpen(false)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Hide workspace rail"
          >
            <PanelLeftClose className="size-4" />
          </button>
          <div className="mt-2 flex flex-col gap-2">
            {(workspaces ?? []).map((w) => (
              <button
                key={w.workspaceId}
                onClick={() =>
                  navigate({ to: "/w/$workspaceId", params: { workspaceId: w.workspaceId } })
                }
                className={`flex size-10 items-center justify-center rounded-md text-sm font-semibold ${
                  w.workspaceId === workspaceId
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                }`}
                title={w.name}
              >
                {w.name.slice(0, 2).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation panel — always 20% of viewport */}
      <aside className="flex h-full w-[20vw] min-w-[200px] flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="truncate text-sm font-semibold">{current?.name ?? "Workspace"}</div>
          {!railOpen && (
            <button
              onClick={() => setRailOpen(true)}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="Show workspace rail"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "conversations" | "pages")}
          className="flex flex-1 flex-col"
        >
          <TabsList className="mx-3 mt-3 grid grid-cols-2">
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto p-2 text-sm">
            {tab === "conversations" ? (
              <p className="px-1 py-2 text-muted-foreground">No conversations yet.</p>
            ) : (pages?.length ?? 0) === 0 ? (
              <p className="px-1 py-2 text-muted-foreground">No pages yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {pages!.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/w/$workspaceId/p/$pageId"
                      params={{ workspaceId, pageId: p.id }}
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      activeProps={{ className: "bg-accent" }}
                    >
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{p.title || "Untitled"}</span>
                      {p.visibility === "private" ? (
                        <Lock className="ml-auto size-3 shrink-0 text-muted-foreground" />
                      ) : p.visibility === "workspace" ? (
                        <Globe className="ml-auto size-3 shrink-0 text-muted-foreground" />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Tabs>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Link
            to="/w/$workspaceId/settings"
            params={{ workspaceId }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-3.5" /> Settings
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </aside>

      {/* Central panel — takes the rest (80% when rail hidden, 70% when shown) */}
      <main className="h-full flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
