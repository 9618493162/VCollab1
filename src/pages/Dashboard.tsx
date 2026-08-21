import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  ClipboardList,
  Clock3,
  Copy,
  Loader2,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AttendeePicker } from "@/components/AttendeePicker";
import { ManageAttendeesDialog } from "@/components/ManageAttendeesDialog";
import { AgendaDialog } from "@/components/AgendaDialog";

function extractCode(raw: string): string {
  const flat = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  // New format: VC-XXXXXX (8 chars, starts with vc)
  if (flat.length >= 8 && flat.startsWith("vc")) {
    const body = flat.slice(2, 8).toUpperCase();
    if (body.length === 6) return `vc-${body}`;
  }
  // Legacy format: abc-defg-hij (10 chars)
  const match = raw.toLowerCase().match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/);
  return match?.[1] ?? (flat.length >= 10 ? flat.slice(0, 10) : "");
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return ["Up late", "The quiet hours are great for deep work."];
  if (h < 12) return ["Good morning", "Fresh coffee and a clear meeting slate."];
  if (h < 17) return ["Good afternoon", "Perfect time to move things forward."];
  return ["Good evening", "Wrap up strong — or schedule tomorrow's plan."];
}

/** Human label for a stored recurrence rule. */
function repeatLabel(r?: { frequency?: string; interval?: number } | null): string {
  if (!r) return "";
  const n = Math.max(1, r.interval ?? 1);
  switch (r.frequency) {
    case "daily":
      return n === 1 ? "Daily" : `Every ${n} days`;
    case "weekly":
      return n === 1 ? "Weekly" : `Every ${n} weeks`;
    case "monthly":
      return n === 1 ? "Monthly" : `Every ${n} months`;
    default:
      return "Repeats";
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createRoom = useMutation(api.rooms.createRoom);
  const myRooms = useQuery(api.rooms.listMyRooms);
  const upcoming = useQuery(api.meetings.listUpcoming);
  const invited = useQuery(api.meetings.listInvited);
  const insights = useQuery(api.aiData.getMyAiInsights);

  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<
    NonNullable<typeof upcoming>[number] | null
  >(null);
  const [cancelTarget, setCancelTarget] = useState<{
    code: string;
    title: string;
    isSeries: boolean;
  } | null>(null);
  const [agendaTarget, setAgendaTarget] = useState<{
    code: string;
    title: string;
  } | null>(null);

  // Command palette / deep link: /dashboard?schedule=1 opens the schedule dialog.
  // The dialog's open state is derived from the URL so no effect is needed —
  // closing it clears the param.
  const [searchParams, setSearchParams] = useSearchParams();
  const scheduleParam = searchParams.get("schedule") === "1";
  const cancelScheduled = useMutation(api.meetings.cancelScheduled);
  const respondRsvp = useMutation(api.meetings.respondRsvp);
  const [cancelling, setCancelling] = useState(false);
  const [rsvpBusy, setRsvpBusy] = useState<string | null>(null);

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const [greet, greetMsg] = greeting();

  const stats = useMemo(() => {
    const rooms = myRooms ?? [];
    const today = new Date().setHours(0, 0, 0, 0);
    const meetingsToday = rooms.filter(
      (r) => (r.startedAt ?? r.createdAt) >= today,
    ).length;
    // Only count rooms that were actually ended by a user (not auto-expired).
    // Auto-expired rooms inflate the hours stat because the TTL is 24h.
    const endedRooms = rooms.filter(
      (r) => r.status === "ended" && r.startedAt && r.endedAt,
    );
    const hours = endedRooms.reduce((acc, r) => {
      const durationH = (r.endedAt! - r.startedAt!) / 3_600_000;
      // Guard against absurdly long durations (>24h is a TTL expiry, not a real meeting)
      return acc + (durationH > 0 && durationH <= 24 ? durationH : 0);
    }, 0);
    return {
      meetings: rooms.length,
      meetingsToday,
      upcoming: (upcoming ?? []).length + (invited ?? []).length,
      hours,
      summaries: insights?.summaries.length ?? 0,
      actionItems: insights?.actionItems.length ?? 0,
    };
  }, [myRooms, upcoming, invited, insights]);

  // hosted + invited meetings, sorted by start time
  const upcomingList = useMemo(() => {
    const all = [...(upcoming ?? []), ...(invited ?? [])];
    const seen = new Set<string>();
    return all
      .filter((m) => (seen.has(m.code) ? false : (seen.add(m.code), true)))
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 10);
  }, [upcoming, invited]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const code = await createRoom();
      navigate(`/call/${code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start a meeting.");
      setCreating(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = extractCode(joinCode);
    if (!code) {
      toast.error("That doesn't look like a meeting code.");
      return;
    }
    navigate(`/call/${code}`);
  };

  const handleCopy = async (code: string) => {
    const url = `${window.location.origin}/call/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const handleCancel = async (scope: "this" | "series") => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelScheduled({ code: cancelTarget.code, scope });
      toast.success(
        scope === "series"
          ? "Series cancelled — every occurrence was removed."
          : "Meeting cancelled — attendees were notified.",
      );
      setCancelTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't cancel.");
    } finally {
      setCancelling(false);
    }
  };

  const handleRsvp = async (code: string, status: "yes" | "no" | "maybe") => {
    if (rsvpBusy) return;
    setRsvpBusy(code);
    try {
      await respondRsvp({ code, status });
      if (status === "yes") {
        toast.success("You're going — the host will be notified.");
      } else {
        toast.success(status === "maybe" ? "Marked as maybe." : "Response saved.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your response.");
    } finally {
      setRsvpBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="dashboard" />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        {/* greeting */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              {greet}
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              {greet}, <span className="text-gradient">{firstName}</span>.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">{greetMsg}</p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="press h-12 rounded-full px-8 btn-glow"
          >
            {creating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            New meeting
          </Button>
        </div>

        {/* quick actions */}
        <div className="glass-float depth-2 mt-8 flex flex-col gap-3 rounded-3xl p-3 sm:flex-row">
          <form onSubmit={handleJoin} className="flex flex-1 items-center gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter a meeting code or link"
              className="h-12 flex-1 rounded-full px-5"
              autoComplete="off"
            />
            <Button type="submit" variant="outline" size="icon" className="h-12 w-12 rounded-full">
              <ArrowRight className="size-4" />
            </Button>
          </form>
          <Button
            variant="outline"
            className="h-12 rounded-full px-6"
            onClick={() => setScheduleOpen(true)}
          >
            <CalendarPlus className="mr-2 size-4" /> Schedule
          </Button>
        </div>

        {/* stats */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Video}
            label="Total meetings"
            value={<CountUp to={stats.meetings} />}
            sub={`${stats.meetingsToday} today`}
          />
          <StatCard
            icon={CalendarClock}
            label="Upcoming"
            value={<CountUp to={stats.upcoming} />}
            sub="scheduled ahead"
          />
          <StatCard
            icon={Clock3}
            label="Meeting hours"
            value={<CountUp to={Math.round(stats.hours * 10) / 10} suffix="h" />}
            sub="across all meetings"
          />
          <StatCard
            icon={Sparkles}
            label="AI insights"
            value={<CountUp to={stats.summaries} />}
            sub={`${stats.actionItems} action items`}
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* left column */}
          <div className="space-y-6 lg:col-span-2">
            {/* upcoming */}
            <section className="glass-float depth-1 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <CalendarClock className="size-4 text-primary" /> Upcoming
                </h2>
                {upcomingList.length > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {upcomingList.length}
                  </span>
                )}
              </div>

              <div className="mt-4">
                {upcoming === undefined || invited === undefined ? (
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                    ))}
                  </div>
                ) : upcomingList.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-10 text-center">
                    <CalendarPlus className="mx-auto size-5 text-muted-foreground/60" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nothing scheduled.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 rounded-full"
                      onClick={() => setScheduleOpen(true)}
                    >
                      <Plus className="mr-1.5 size-3.5" /> Schedule a meeting
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {upcomingList.map((m) => {
                      const isHost = m.hostId === user?._id;
                      const attendeeCount = m.attendees?.length ?? 0;
                      const rsvps = m.rsvps ?? [];
                      const confirmed = rsvps.filter((r) => r.status === "yes").length;
                      const declined = rsvps.filter((r) => r.status === "no").length;
                      const myEmail = user?.email?.toLowerCase();
                      const myRsvp = myEmail
                        ? rsvps.find((r) => r.email === myEmail)?.status
                        : undefined;
                      return (
                        <li
                          key={m._id}
                          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium">{m.title}</p>
                              <Badge
                                variant="secondary"
                                className="rounded-full font-mono text-[10px]"
                              >
                                {m.code}
                              </Badge>
                              {(() => {
                                const now = Date.now();
                                const start = m.startTime;
                                const end = start + (m.durationMinutes ?? 30) * 60_000;
                                if (now >= start && now <= end) {
                                  return <Badge className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"><span className="mr-1 size-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</Badge>;
                                }
                                if (now < start) {
                                  const diff = start - now;
                                  const hours = Math.floor(diff / 3_600_000);
                                  const mins = Math.floor((diff % 3_600_000) / 60_000);
                                  const label = hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`;
                                  return <Badge variant="outline" className="rounded-full border-border/60 text-muted-foreground">{label}</Badge>;
                                }
                                return null;
                              })()}
                              {m.recurrence && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-primary/30 text-primary"
                                >
                                  <Repeat className="mr-1 size-3" />
                                  {repeatLabel(m.recurrence)}
                                </Badge>
                              )}
                              {!isHost && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-primary/30 text-primary"
                                >
                                  Invited
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CalendarClock className="size-3.5" />
                              {new Date(m.startTime).toLocaleString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                              <span>· {m.durationMinutes} min</span>
                            </p>
                            {m.description && (
                              <p className="mt-1 line-clamp-1 max-w-md text-xs text-muted-foreground/80">
                                {m.description}
                              </p>
                            )}
                            {attendeeCount > 0 && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <div className="flex -space-x-1.5">
                                  {m.attendees!.slice(0, 3).map((email) => (
                                    <span
                                      key={email}
                                      title={email}
                                      className="flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[9px] font-bold text-white ring-2 ring-background"
                                    >
                                      {email.trim()[0]?.toUpperCase() ?? "?"}
                                    </span>
                                  ))}
                                </div>
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Users className="size-3" />
                                  {attendeeCount} invited
                                  {isHost && rsvps.length > 0 && (
                                    <>
                                      <span>·</span>
                                      <span className="text-emerald-500">
                                        {confirmed} going
                                      </span>
                                      {declined > 0 && (
                                        <span className="text-muted-foreground/60">
                                          · {declined} can't
                                        </span>
                                      )}
                                    </>
                                  )}
                                </span>
                              </div>
                            )}
                            {!isHost && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                  {myRsvp
                                    ? myRsvp === "yes"
                                      ? "You're going ✓"
                                      : myRsvp === "maybe"
                                        ? "You marked maybe"
                                        : "You can't make it"
                                    : "Will you attend?"}
                                </span>
                                {(
                                  [
                                    { id: "yes", label: "Going" },
                                    { id: "maybe", label: "Maybe" },
                                    { id: "no", label: "Can't" },
                                  ] as const
                                ).map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    disabled={rsvpBusy === m.code}
                                    onClick={() => void handleRsvp(m.code, opt.id)}
                                    className={cn(
                                      "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                                      myRsvp === opt.id
                                        ? opt.id === "yes"
                                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                                          : opt.id === "maybe"
                                            ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
                                            : "border-border bg-muted text-muted-foreground"
                                        : "border-border text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => handleCopy(m.code)}
                            >
                              {copied === m.code ? (
                                <Check className="size-3.5" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              {copied === m.code ? "Copied" : "Invite"}
                            </Button>
                            {isHost && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-full"
                                onClick={() => setManageTarget(m)}
                              >
                                <Users className="mr-1.5 size-3.5" /> Attendees
                              </Button>
                            )}
                            {isHost && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-full"
                                onClick={() =>
                                  setAgendaTarget({ code: m.code, title: m.title })
                                }
                              >
                                <ClipboardList className="mr-1.5 size-3.5" /> Agenda
                              </Button>
                            )}
                            {isHost && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() =>
                                  setCancelTarget({
                                    code: m.code,
                                    title: m.title,
                                    isSeries: m.recurrence !== undefined,
                                  })
                                }
                              >
                                <CalendarX className="mr-1.5 size-3.5" /> Cancel
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="rounded-full"
                              onClick={() => navigate(`/call/${m.code}`)}
                            >
                              <Play className="mr-1.5 size-3.5" /> Join
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* recent */}
            <section className="glass-float depth-1 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Video className="size-4 text-primary" /> Recent meetings
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground"
                  onClick={() => navigate("/history")}
                >
                  View all <ArrowRight className="ml-1.5 size-3.5" />
                </Button>
              </div>

              <div className="mt-4">
                {myRooms === undefined ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                    ))}
                  </div>
                ) : myRooms.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-10 text-center">
                    <Video className="mx-auto size-5 text-muted-foreground/60" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      No meetings yet — start one above.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {myRooms.slice(0, 5).map((room) => {
                      const duration = room.startedAt && room.endedAt
                        ? Math.round((room.endedAt - room.startedAt) / 60_000)
                        : null;
                      const statusColor = room.status === "active"
                        ? "bg-emerald-400"
                        : room.status === "ended"
                          ? "bg-muted-foreground/40"
                          : "bg-amber-400";
                      return (
                        <li
                          key={room._id}
                          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium">
                                {room.title ?? "Untitled meeting"}
                              </p>
                              <span className={cn("size-2 rounded-full shrink-0", statusColor)} title={room.status ?? "unknown"} />
                            </div>
                            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{room.code}</span>
                              <span>·</span>
                              <span>{room.startedAt ? new Date(room.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Not started"}</span>
                              {duration !== null && duration > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{duration < 60 ? `${duration}m` : `${Math.floor(duration / 60)}h ${duration % 60}m`}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full"
                              onClick={() => navigate(`/collab/${room.code}`)}
                            >
                              <ClipboardList className="mr-1.5 size-3.5" /> Notes
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => navigate(`/call/${room.code}`)}
                            >
                              <Play className="mr-1.5 size-3.5" /> Join
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* right column: AI insights */}
          <section className="glass-float depth-1 h-fit rounded-2xl p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Sparkles className="size-4 text-primary" /> AI insights
            </h2>
            {insights === undefined ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : insights.summaries.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border py-10 text-center">
                <Sparkles className="mx-auto size-5 text-muted-foreground/60" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No AI summaries yet.
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Record a meeting and the transcript, summary, and action
                  items will appear here.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {insights.summaries.map((s) => (
                  <div key={s._id} className="card-surface p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-2 line-clamp-4 text-sm leading-6">{s.content}</p>
                  </div>
                ))}
                {insights.actionItems.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Action items
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {insights.actionItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-5">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      <ScheduleDialog
        open={scheduleOpen || scheduleParam}
        onOpenChange={(open) => {
          setScheduleOpen(open);
          if (!open && scheduleParam) {
            const next = new URLSearchParams(searchParams);
            next.delete("schedule");
            setSearchParams(next, { replace: true });
          }
        }}
        onScheduled={(code) => {
          setScheduleOpen(false);
          void handleCopy(code);
          toast.success("Meeting scheduled — invite link copied, emails sent.");
        }}
      />

      <ManageAttendeesDialog
        open={manageTarget !== null}
        onOpenChange={(open) => !open && setManageTarget(null)}
        meeting={manageTarget}
      />

      <AgendaDialog
        open={agendaTarget !== null}
        onOpenChange={(open) => !open && setAgendaTarget(null)}
        meeting={agendaTarget}
      />

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Cancel “{cancelTarget?.title ?? ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.isSeries ? (
                <>This meeting is part of a recurring series. Choose what to
                  cancel — one occurrence, or the whole series.</>
              ) : (
                <>Attendees will get an email + in-app notification that the
                  meeting is no longer happening. The meeting code will stop
                  working.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
            {cancelTarget?.isSeries && (
              <Button
                type="button"
                variant="outline"
                disabled={cancelling}
                onClick={() => void handleCancel("this")}
                className="rounded-full"
              >
                This meeting only
              </Button>
            )}
            <AlertDialogAction
              onClick={() => void handleCancel("series")}
              disabled={cancelling}
              className="rounded-full bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CalendarX className="mr-2 size-4" />
              )}
              {cancelTarget?.isSeries ? "Cancel series" : "Cancel meeting"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="glass-float hover-lift press group rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/15 to-violet-500/10 text-muted-foreground/70 transition-colors group-hover:text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground/80">{sub}</p>
    </div>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled: (code: string) => void;
}) {
  const schedule = useMutation(api.meetings.scheduleMeeting);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [attendees, setAttendees] = useState<{ email: string; name?: string }[]>([]);
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">(
    "none",
  );
  const [repeatInterval, setRepeatInterval] = useState("1");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatEnd, setRepeatEnd] = useState<"never" | "after" | "on">("never");
  const [repeatCount, setRepeatCount] = useState("10");
  const [repeatEndDate, setRepeatEndDate] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      toast.error("Pick a date and time.");
      return;
    }
    const startTime = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(startTime) || startTime < Date.now()) {
      toast.error("That time is in the past.");
      return;
    }
    setBusy(true);
    try {
      const code = await schedule({
        title: title || "Untitled meeting",
        description: description || undefined,
        startTime,
        durationMinutes: Number(duration),
        attendees: attendees.map((a) => a.email),
        recurrence:
          repeat === "none"
            ? undefined
            : {
                frequency: repeat,
                interval: Math.max(1, Number(repeatInterval) || 1),
                daysOfWeek:
                  repeat === "weekly" && repeatDays.length > 0
                    ? repeatDays
                    : undefined,
                endType: repeatEnd,
                endAfter:
                  repeatEnd === "after"
                    ? Math.max(1, Number(repeatCount) || 1)
                    : undefined,
                endDate:
                  repeatEnd === "on" && repeatEndDate
                    ? new Date(`${repeatEndDate}T23:59:59`).getTime()
                    : undefined,
              },
      });
      onScheduled(code);
      setTitle("");
      setDescription("");
      setDate("");
      setTime("");
      setAttendees([]);
      setRepeat("none");
      setRepeatInterval("1");
      setRepeatDays([]);
      setRepeatEnd("never");
      setRepeatCount("10");
      setRepeatEndDate("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't schedule.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Schedule a meeting</DialogTitle>
          <DialogDescription>
            You'll get a shareable invite link with a unique code.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly sync"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this meeting about?"
              className="mt-1.5 min-h-16"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Time</label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Invite people
            </label>
            <AttendeePicker
              value={attendees}
              onChange={setAttendees}
              className="mt-1.5"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">
              Search teammates by name, or type an email to invite anyone.
              Everyone on the list gets an email invite with the join link, an
              in-app invitation, and a reminder 10 minutes before.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Duration</label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1.5">
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
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Repeats
            </label>
            <Select
              value={repeat}
              onValueChange={(v) =>
                setRepeat(v as "none" | "daily" | "weekly" | "monthly")
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {repeat !== "none" && (
              <div className="mt-2 space-y-2.5 rounded-xl border border-border/70 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Every</span>
                  <Select value={repeatInterval} onValueChange={setRepeatInterval}>
                    <SelectTrigger className="h-8 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["1", "2", "3", "4"].map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[11px] text-muted-foreground">
                    {repeat === "daily"
                      ? "day(s)"
                      : repeat === "monthly"
                        ? "month(s)"
                        : "week(s)"}
                  </span>
                </div>
                {repeat === "weekly" && (
                  <div className="flex flex-wrap gap-1.5">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d, i) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() =>
                            setRepeatDays((prev) =>
                              prev.includes(i)
                                ? prev.filter((x) => x !== i)
                                : [...prev, i].sort(),
                            )
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                            repeatDays.includes(i)
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {d}
                        </button>
                      ),
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Ends</span>
                  <Select
                    value={repeatEnd}
                    onValueChange={(v) =>
                      setRepeatEnd(v as "never" | "after" | "on")
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="after">After…</SelectItem>
                      <SelectItem value="on">On date</SelectItem>
                    </SelectContent>
                  </Select>
                  {repeatEnd === "after" && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        value={repeatCount}
                        onChange={(e) => setRepeatCount(e.target.value)}
                        className="h-8 w-16"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        occurrences
                      </span>
                    </div>
                  )}
                  {repeatEnd === "on" && (
                    <Input
                      type="date"
                      value={repeatEndDate}
                      onChange={(e) => setRepeatEndDate(e.target.value)}
                      className="h-8 w-40"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CalendarPlus className="mr-2 size-4" />
              )}
              Schedule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
