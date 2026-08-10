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
  Mail,
  Play,
  Plus,
  Search,
  Sparkles,
  UserRoundPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function extractCode(raw: string): string {
  const match = raw
    .toLowerCase()
    .match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/);
  return match?.[1] ?? "";
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return ["Up late", "The quiet hours are great for deep work."];
  if (h < 12) return ["Good morning", "Fresh coffee and a clear meeting slate."];
  if (h < 17) return ["Good afternoon", "Perfect time to move things forward."];
  return ["Good evening", "Wrap up strong — or schedule tomorrow's plan."];
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
  const [cancelTarget, setCancelTarget] = useState<{
    code: string;
    title: string;
  } | null>(null);
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
    const hours = rooms.reduce((acc, r) => {
      if (r.startedAt && r.endedAt) return acc + (r.endedAt - r.startedAt) / 3_600_000;
      return acc;
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

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelScheduled({ code: cancelTarget.code });
      toast.success("Meeting cancelled — attendees were notified.");
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
            className="h-12 rounded-full px-8 btn-glow"
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
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
            <section className="glass rounded-2xl p-6">
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
                                className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() =>
                                  setCancelTarget({ code: m.code, title: m.title })
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
            <section className="glass rounded-2xl p-6">
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
                    {myRooms.slice(0, 5).map((room) => (
                      <li
                        key={room._id}
                        className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {room.title ?? "Untitled meeting"}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {room.code}
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
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* right column: AI insights */}
          <section className="glass h-fit rounded-2xl p-6">
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
                  <div key={s._id} className="rounded-xl border border-border/60 p-4">
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
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onScheduled={(code) => {
          setScheduleOpen(false);
          void handleCopy(code);
          toast.success("Meeting scheduled — invite link copied, emails sent.");
        }}
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
              Attendees will get an email + in-app notification that the meeting
              is no longer happening. The meeting code will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleCancel()}
              disabled={cancelling}
              className="rounded-full bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CalendarX className="mr-2 size-4" />
              )}
              Cancel meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Picks meeting invitees: search registered users by name/email, or type a
 * raw email for someone outside the workspace. Shows selected people as
 * removable chips.
 */
function AttendeePicker({
  value,
  onChange,
  className,
}: {
  value: { email: string; name?: string }[];
  onChange: (next: { email: string; name?: string }[]) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useQuery(
    api.users.searchUsers,
    draft.trim().length > 0 ? { query: draft } : "skip",
  );

  const normalized = value.map((a) => a.email.toLowerCase());
  const matches = (results ?? []).filter(
    (u) => !normalized.includes(u.email.toLowerCase()),
  );

  const add = (email: string, name?: string) => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return;
    if (normalized.includes(clean)) return;
    onChange([...value, { email: clean, name }]);
    setDraft("");
    setDraftEmail(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (email: string) => {
    onChange(value.filter((a) => a.email.toLowerCase() !== email.toLowerCase()));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (draftEmail) {
        add(draftEmail);
      } else if (EMAIL_RE.test(draft.trim())) {
        add(draft.trim());
      }
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      remove(value[value.length - 1].email);
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className={className}>
      {/* selected chips */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((a) => (
            <span
              key={a.email}
              className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 py-1 pl-2 pr-1 text-xs"
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[9px] font-bold text-white">
                {(a.name ?? a.email)[0]?.toUpperCase() ?? "?"}
              </span>
              {a.name ?? a.email}
              <button
                type="button"
                onClick={() => remove(a.email)}
                aria-label={`Remove ${a.name ?? a.email}`}
                className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* input + results */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftEmail(
              EMAIL_RE.test(e.target.value.trim()) ? e.target.value.trim() : null,
            );
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Search people or type an email…"
          autoComplete="off"
          className="h-10 rounded-xl pl-9"
        />

        {open && (draft.trim().length > 0 || draftEmail) && (
          <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-lg">
            {matches.length > 0 && (
              <ul className="max-h-52 overflow-y-auto p-1">
                {matches.map((u) => (
                  <li key={u._id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(u.email, u.name);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      {u.image ? (
                        <img
                          src={u.image}
                          alt=""
                          className="size-7 shrink-0 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-bold text-white">
                          {(u.name ?? "?")[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                      <UserRoundPlus className="ml-auto size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {draftEmail && !normalized.includes(draftEmail.toLowerCase()) && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(draftEmail);
                }}
                className="flex w-full items-center gap-2.5 border-t border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Mail className="size-3.5 text-muted-foreground" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">Invite {draftEmail}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    sends an email invite
                  </span>
                </span>
                <Plus className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </button>
            )}

            {matches.length === 0 && !draftEmail && (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No teammates found — type a full email to invite them.
              </p>
            )}
          </div>
        )}
      </div>
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
    <div className="glass group rounded-2xl p-5 transition-all hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground/50 transition-colors group-hover:text-primary" />
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
      });
      onScheduled(code);
      setTitle("");
      setDescription("");
      setDate("");
      setTime("");
      setAttendees([]);
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
