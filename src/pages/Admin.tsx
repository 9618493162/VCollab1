import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppHeader } from "@/components/AppHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery } from "convex/react";
import {
  Crown,
  Hash,
  MessageSquare,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

export default function Admin() {
  const myWorkspaces = useQuery(api.workspaces.listMyWorkspaces);
  const adminWorkspaces = useMemo(
    () => (myWorkspaces ?? []).filter((w) => w.myRole === "owner" || w.myRole === "admin"),
    [myWorkspaces],
  );
  const [workspaceId, setWorkspaceId] = useState<Id<"workspaces"> | null>(null);
  const overview = useQuery(
    api.admin.getOrgOverview,
    workspaceId ? { workspaceId } : "skip",
  );
  const transferOwnership = useMutation(api.admin.transferOwnership);

  const transfer = async (newOwnerId: Id<"users">, name: string) => {
    if (!workspaceId) return;
    if (!window.confirm(`Transfer ownership of ${overview?.name ?? "this workspace"} to ${name}?`)) return;
    try {
      await transferOwnership({ workspaceId, newOwnerId });
      toast.success(`Ownership transferred to ${name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't transfer ownership.");
    }
  };

  return (
    <>
      <AppHeader active="admin" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Org admin</h1>
            <p className="text-xs text-muted-foreground">
              Overview and management for workspaces you own or admin.
            </p>
          </div>
        </div>
        {adminWorkspaces.length > 0 && (
          <Select
            value={workspaceId ?? ""}
            onValueChange={(v) => setWorkspaceId(v as Id<"workspaces">)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose a workspace" />
            </SelectTrigger>
            <SelectContent>
              {adminWorkspaces.map((w) => (
                <SelectItem key={w._id} value={w._id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {adminWorkspaces.length === 0 ? (
        <div className="rounded-2xl border border-border/80 bg-card/50 p-10 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No workspaces to manage</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a workspace from the Workspaces page to see org admin here.
          </p>
        </div>        ) : overview === undefined || overview === null ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {workspaceId ? "Loading…" : "Pick a workspace to get started."}
          </p>
        ) : (
        <div className="space-y-6">
          {/* stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={<Users className="size-3.5" />} label="Members" value={overview.stats.members} />
            <StatCard icon={<Hash className="size-3.5" />} label="Channels" value={overview.stats.channels} />
            <StatCard icon={<MessageSquare className="size-3.5" />} label="Messages" value={overview.stats.messages} />
            <StatCard icon={<Radio className="size-3.5" />} label="Meetings" value={overview.stats.rooms} />
            <StatCard
              icon={<MessageSquare className="size-3.5" />}
              label="Scheduled"
              value={overview.stats.scheduledMeetings}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* members */}
            <section className="rounded-2xl border border-border/80 bg-card/50 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-muted-foreground" /> Members
              </h2>
              <ul className="space-y-2">
                {overview.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-xs font-semibold text-primary">
                      {m.name.trim()[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {m.name}
                        {m.role === "owner" && <Crown className="size-3 text-amber-500" />}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {m.role}
                    </span>
                    {overview.myRole === "owner" && m.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => void transfer(m.userId, m.name)}
                        className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-amber-400/50 hover:text-amber-500"
                        title="Transfer ownership to this member"
                      >
                        Make owner
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* channels + activity */}
            <section className="space-y-6">
              <div className="rounded-2xl border border-border/80 bg-card/50 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Hash className="size-4 text-muted-foreground" /> Channels
                </h2>
                <ul className="space-y-1.5">
                  {overview.channels.map((c) => (
                    <li key={c._id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">#{c.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.messageCount} message{c.messageCount === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/50 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="size-4 text-muted-foreground" /> Recent activity
                </h2>
                {overview.activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No channel messages yet — activity appears here as your team chats.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {overview.activity.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="font-medium">{a.author}</span>{" "}
                        <span className="text-muted-foreground">
                          in <span className="font-mono text-xs">#{a.channel}</span>
                        </span>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{a.text}</p>
                        <p className="text-[10px] text-muted-foreground/70">
                          {format(a.at, "MMM d, HH:mm")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            You're viewing this as{" "}
            <span className="font-medium capitalize text-foreground">{overview.myRole}</span> of{" "}
            {overview.name}. Members, roles, and invites are managed on the workspace page.
          </p>
        </div>
      )}

      {/* Audit Log */}
      <AuditLogSection />
      </div>
    </>
  );


/** Audit log viewer — shows recent security-relevant actions. */
function AuditLogSection() {
  const logs = useQuery(api.audit.list, { limit: 50 });
  const [filter, setFilter] = useState<string>("all");

  const ACTION_LABELS: Record<string, string> = {
    "meeting.created": "Meeting created",
    "meeting.ended": "Meeting ended",
    "meeting.locked": "Meeting locked",
    "meeting.unlocked": "Meeting unlocked",
    "host.transferred": "Host transferred",
  };

  const filtered = (logs ?? []).filter(
    (l) => filter === "all" || l.action.startsWith(filter),
  );

  return (
    <section className="mt-8 rounded-2xl border border-border/80 bg-card/50 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-muted-foreground" /> Audit log
      </h2>
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "meeting", "host"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={"rounded-full border px-3 py-1 text-xs capitalize transition-colors " +
              (filter === f
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground")}
          >
            {f}
          </button>
        ))}
      </div>
      {logs === undefined ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading audit log…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No audit entries yet.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {filtered.map((log) => (
            <li key={log._id} className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2">
              <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono capitalize">
                {ACTION_LABELS[log.action] ?? log.action}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{log.actorName ?? "System"}</span>
                  {" "}
                  <span className="text-muted-foreground">{log.action}</span>
                  {log.targetId && (
                    <span className="font-mono text-xs text-muted-foreground"> on {log.targetId}</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

}
