import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppHeader } from "@/components/AppHeader";
import { usePresence } from "@/hooks/use-presence";
import { PresenceDot } from "@/components/PresenceDot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarPlus,
  Clock,
  Hash,
  MessageSquarePlus,
  Plus,
  Send,
  UserPlus,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLE_ORDER = ["owner", "admin", "member", "guest"] as const;
type Role = (typeof ROLE_ORDER)[number];

function timeLabel(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatWhen(t: number) {
  return new Date(t).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultWhen() {
  const d = new Date(Date.now() + 60 * 60_000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function WorkspaceDetail() {
  const { workspaceId: rawWorkspaceId } = useParams();
  const workspaceId = rawWorkspaceId as Id<"workspaces"> | undefined;
  const navigate = useNavigate();
  usePresence();

  const workspace = useQuery(
    api.workspaces.getWorkspace,
    workspaceId ? { workspaceId } : "skip",
  );
  const [selectedChannelId, setSelectedChannelId] = useState<Id<"channels"> | null>(null);
  // default to the first channel until the user picks one
  const activeChannelId = selectedChannelId ?? workspace?.channels[0]?._id ?? null;

  const channelMessages = useQuery(
    api.channels.listMessages,
    activeChannelId ? { channelId: activeChannelId } : "skip",
  );

  const sendMessage = useMutation(api.channels.sendMessage);
  const createChannel = useMutation(api.channels.createChannel);
  const deleteChannel = useMutation(api.channels.deleteChannel);
  const inviteMember = useMutation(api.workspaces.inviteMember);
  const updateRole = useMutation(api.workspaces.updateRole);
  const removeMember = useMutation(api.workspaces.removeMember);
  const scheduleMeeting = useMutation(api.workspaceMeetings.scheduleWorkspaceMeeting);
  const teamMeetings = useQuery(
    api.workspaceMeetings.listWorkspaceMeetings,
    workspaceId ? { workspaceId } : "skip",
  );

  const [text, setText] = useState("");
  const [draft, setDraft] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingWhen, setMeetingWhen] = useState("");
  const [meetingDuration, setMeetingDuration] = useState("30");
  const [meetingRecurrence, setMeetingRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const scrollRef = useRef<HTMLDivElement>(null);

  const canManage = workspace?.myRole === "owner" || workspace?.myRole === "admin";
  const isGuest = workspace?.myRole === "guest";

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const upcomingMeetings = (teamMeetings ?? []).filter(
    (m) => m.startTime + m.durationMinutes * 60_000 > now && m.status !== "cancelled",
  );

  const submitMeeting = async () => {
    const startTime = new Date(meetingWhen).getTime();
    if (Number.isNaN(startTime)) {
      toast.error("Pick a date and time for the meeting.");
      return;
    }
    if (startTime < Date.now()) {
      toast.error("Meeting time must be in the future.");
      return;
    }
    setBusy(true);
    try {
      const code = await scheduleMeeting({
        workspaceId: workspaceId!,
        title: meetingTitle,
        startTime,
        durationMinutes: Number(meetingDuration),
        recurrence:
          meetingRecurrence === "none"
            ? undefined
            : { frequency: meetingRecurrence, interval: 1, endType: "never" },
      });
      toast.success(`Scheduled — join with code ${code}.`);
      setScheduleOpen(false);
      setMeetingTitle("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't schedule the meeting.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [channelMessages, activeChannelId]);

  if (workspace === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader active="workspaces" />
        <p className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      </div>
    );
  }
  if (workspace === null) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader active="workspaces" />
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <p className="font-display font-semibold">Workspace not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You're not a member, or it doesn't exist.
          </p>
          <Button
            className="mt-4 rounded-full"
            onClick={() => navigate("/workspaces")}
          >
            Back to workspaces
          </Button>
        </div>
      </div>
    );
  }

  const selectedChannel = workspace.channels.find((c) => c._id === activeChannelId);

  const submitMessage = async () => {
    if (!activeChannelId || text.trim().length === 0) return;
    try {
      await sendMessage({ channelId: activeChannelId, text });
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send message.");
    }
  };

  const submitChannel = async () => {
    const name = draft.trim();
    if (name.length === 0) return;
    try {
      const id = await createChannel({ workspaceId: workspace._id, name });
      setDraft("");
      setSelectedChannelId(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create channel.");
    }
  };

  const submitInvite = async () => {
    setBusy(true);
    try {
      const res = await inviteMember({
        workspaceId: workspace._id,
        email: inviteEmail,
        role: inviteRole,
      });
      toast.success(
        res.added
          ? `${res.name} joined the workspace.`
          : `${res.name} is already a member.`,
      );
      setInviteOpen(false);
      setInviteEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send invite.");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId: Id<"users">, role: Role) => {
    try {
      await updateRole({ workspaceId: workspace._id, userId, role });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change role.");
    }
  };

  const remove = async (userId: Id<"users">, name: string) => {
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    try {
      await removeMember({ workspaceId: workspace._id, userId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove member.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="workspaces" />
      <main className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/workspaces")}
            className="flex size-8 items-center justify-center rounded-full border border-border/80 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to workspaces"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{workspace.name}</h1>
            {workspace.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{workspace.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium capitalize text-muted-foreground sm:block">
            {workspace.myRole}
          </span>
          <Button
            size="sm"
            className="press rounded-full px-5"
            onClick={() => setInviteOpen(true)}
            disabled={!canManage}
          >
            <UserPlus className="size-4" /> Invite
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Sidebar: channels + members */}
        <aside className="glass-float depth-1 rounded-2xl p-3 lg:h-[calc(100vh-13rem)] lg:overflow-y-auto">
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Channels
          </p>
          <div className="space-y-0.5">
            {workspace.channels.map((c) => (
              <div key={c._id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setSelectedChannelId(c._id)}
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    c._id === selectedChannelId
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Hash className="size-3.5" />
                  <span className="truncate">{c.name}</span>
                </button>
                {canManage && c.name !== "general" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete #${c.name}?`)) {
                        void deleteChannel({ channelId: c._id }).catch((e) =>
                          toast.error(e instanceof Error ? e.message : "Failed"),
                        );
                      }
                    }}
                    className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover:flex"
                    aria-label={`Delete #${c.name}`}
                  >
                    <Plus className="size-3.5 rotate-45" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {!isGuest && (
            <div className="mt-2 flex items-center gap-1.5 px-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitChannel()}
                placeholder="Add channel…"
                className="h-8 text-xs"
              />
              <button
                type="button"
                onClick={() => void submitChannel()}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Create channel"
              >
                <MessageSquarePlus className="size-4" />
              </button>
            </div>
          )}

          <p className="px-2 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Team meetings
          </p>
          <div className="space-y-1.5 px-2">
            {!isGuest && (
              <button
                type="button"
                onClick={() => {
                  setMeetingWhen(defaultWhen());
                  setScheduleOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-border/70 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <CalendarPlus className="size-3.5" /> Schedule a meeting
              </button>
            )}
            {teamMeetings === undefined ? (
              <p className="px-1 text-[11px] text-muted-foreground">Loading…</p>
            ) : upcomingMeetings.length === 0 ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                No upcoming team meetings.
              </p>
            ) : (
              upcomingMeetings.slice(0, 6).map((m) => (
                <div key={m._id} className="rounded-lg border border-border/60 px-2 py-1.5">
                  <p className="flex items-center gap-1 truncate text-xs font-medium">
                    <Clock className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{m.title}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {formatWhen(m.startTime)} · {m.durationMinutes} min · {m.hostName}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(`/call/${m.code}`)}
                    className="mt-1 flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                  >
                    <Video className="size-3" /> Join
                  </button>
                </div>
              ))
            )}
          </div>

          <p className="px-2 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Members · {workspace.members.length}
          </p>
          <div className="space-y-0.5">
            {workspace.members.map((m) => (
              <div key={m.userId} className="group flex items-center gap-2 rounded-lg px-2 py-1.5">
                <div className="relative">
                  <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-[11px] font-semibold text-primary">
                    {m.name.trim()[0]?.toUpperCase()}
                  </div>
                  <PresenceDot status={m.status} className="absolute -bottom-0.5 -right-0.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.name}</p>
                  <p className="truncate text-[10px] capitalize text-muted-foreground">{m.role}</p>
                </div>
                {canManage && (
                  <Select
                    value={m.role}
                    onValueChange={(r) => void changeRole(m.userId, r as Role)}
                    disabled={m.role === "owner" && workspace.myRole !== "owner"}
                  >
                    <SelectTrigger className="h-6 w-20 border-transparent px-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label={`Role for ${m.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_ORDER.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {canManage && m.role !== "owner" && (
                  <button
                    type="button"
                    onClick={() => void remove(m.userId, m.name)}
                    className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover:flex"
                    aria-label={`Remove ${m.name}`}
                  >
                    <Plus className="size-3.5 rotate-45" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main: channel chat */}
        <main className="glass-float depth-1 flex h-[calc(100vh-13rem)] flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Hash className="size-4 text-muted-foreground" />
            <span className="font-medium">{selectedChannel?.name ?? "…"}</span>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {channelMessages === undefined ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : channelMessages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No messages yet in #{selectedChannel?.name}. Say hi 👋
              </p>
            ) : (
              channelMessages.map((m) => (
                <div key={m._id} className="flex gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-xs font-semibold text-primary">
                    {m.userName.trim()[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{m.userName}</span>{" "}
                      <span className="text-[11px] text-muted-foreground">
                        {timeLabel(m.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 break-words text-sm text-foreground/90">{m.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border/60 p-3">
            <div className="flex items-center gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitMessage()}
                placeholder={`Message #${selectedChannel?.name ?? ""}`}
                disabled={!activeChannelId}
              />
              <Button size="icon" onClick={() => void submitMessage()} disabled={!activeChannelId || text.trim().length === 0}>
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite to {workspace.name}</DialogTitle>
            <DialogDescription>
              The person needs a VCollab account with that email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitInvite()}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(r) => setInviteRole(r as Role)}>
                <SelectTrigger className="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_ORDER.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Owner and admin can manage the workspace. Guests can chat but not
                create channels.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void submitInvite()} disabled={busy || inviteEmail.trim().length === 0}>
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </main>

      {/* Schedule team meeting */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule a team meeting</DialogTitle>
            <DialogDescription>
              Everyone in {workspace.name} gets a notification and an announcement in #general.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                id="meeting-title"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="Weekly sync"
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-when">When</Label>
              <Input
                id="meeting-when"
                type="datetime-local"
                value={meetingWhen}
                onChange={(e) => setMeetingWhen(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={meetingDuration} onValueChange={setMeetingDuration}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["15", "30", "45", "60", "90", "120"].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Repeats</Label>
                <Select
                  value={meetingRecurrence}
                  onValueChange={(r) => setMeetingRecurrence(r as typeof meetingRecurrence)}
                >
                  <SelectTrigger className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Doesn't repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => void submitMeeting()}
              disabled={busy || meetingTitle.trim().length === 0 || meetingWhen === ""}
            >
              {busy ? "Scheduling…" : "Schedule meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
