import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "convex/react";
import { ArrowRight, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-400",
  away: "bg-amber-400",
  dnd: "bg-red-400",
  offline: "bg-muted-foreground/30",
};

const ROLE_BADGES: Record<string, string> = {
  owner: "bg-amber-500/15 text-amber-500",
  admin: "bg-primary/15 text-primary",
  member: "bg-muted text-muted-foreground",
  guest: "bg-muted text-muted-foreground/60",
};

export default function Contacts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workspaces = useQuery(api.workspaces.listMyWorkspaces);
  const [selectedWs, setSelectedWs] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [inviteTarget, setInviteTarget] = useState<{
    name: string;
    userId: string;
  } | null>(null);

  const workspaceData = useQuery(
    api.workspaces.getWorkspace,
    selectedWs ? { workspaceId: selectedWs as any } : "skip",
  );

  const filtered = useMemo(() => {
    const members = workspaceData?.members ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  }, [workspaceData, query]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="contacts" />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Directory
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Contacts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Team members across your workspaces.
          </p>
        </div>

        {/* workspace picker */}
        {workspaces && workspaces.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {workspaces.map((w) => (
              <button
                key={w._id}
                type="button"
                onClick={() => setSelectedWs(w._id)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  selectedWs === w._id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}

        {workspaces && workspaces.length === 0 && (
          <div className="glass rounded-2xl py-16 text-center">
            <Users className="mx-auto size-8 text-muted-foreground/60" />
            <p className="mt-4 text-sm font-medium">No workspaces yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a workspace to see your contacts here.
            </p>
          </div>
        )}

        {selectedWs && (
          <div className="relative mt-6">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="rounded-full pl-10"
            />
          </div>
        )}

        {selectedWs && workspaceData === undefined && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass h-24 animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {selectedWs && workspaceData && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => (
              <div
                key={m.userId}
                className="glass-float depth-1 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-sm font-semibold text-primary">
                      {m.image ? (
                        <img
                          src={m.image}
                          alt=""
                          className="size-10 rounded-full object-cover"
                        />
                      ) : (
                        m.name.trim()[0]?.toUpperCase() ?? "?"
                      )}
                    </div>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
                        STATUS_COLORS[m.status] ?? STATUS_COLORS.offline,
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email || "No email"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] capitalize",
                          ROLE_BADGES[m.role] ?? ROLE_BADGES.member,
                        )}
                      >
                        {m.role}
                      </span>
                      <span className="text-[10px] capitalize text-muted-foreground">
                        {m.status}
                      </span>
                    </div>
                  </div>
                  {m.userId !== user?._id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full text-[11px]"
                      onClick={() =>
                        setInviteTarget({ name: m.name, userId: m.userId })
                      }
                    >
                      Invite
                      <ArrowRight className="ml-1 size-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-border py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {query ? "No members match your search." : "No members in this workspace."}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Invite-to-meeting dialog */}
      <Dialog
        open={inviteTarget !== null}
        onOpenChange={(open) => !open && setInviteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              Invite {inviteTarget?.name ?? ""}
            </DialogTitle>
            <DialogDescription>
              Copy the meeting link and send it to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              className="w-full rounded-full"
              onClick={() => {
                setInviteTarget(null);
                navigate("/dashboard");
              }}
            >
              Start a new meeting
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={() => {
                setInviteTarget(null);
                navigate("/calendar");
              }}
            >
              Schedule a meeting
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
