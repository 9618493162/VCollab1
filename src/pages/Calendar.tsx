import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "convex/react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Play,
  UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type View = "day" | "week" | "month";

type Entry = {
  key: string;
  code: string;
  title: string;
  start: number;
  end: number;
  status: string;
  kind: "hosted" | "invited" | "past";
  attendeeCount: number;
};

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i,
);

export default function Calendar() {
  const navigate = useNavigate();
  const scheduled = useQuery(api.meetings.listScheduled);
  const invited = useQuery(api.meetings.listInvited);
  const history = useQuery(api.meetings.listHistory);

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [details, setDetails] = useState<Entry | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const seen = new Set<string>();
    const push = (e: Entry) => {
      if (seen.has(e.key)) return;
      seen.add(e.key);
      out.push(e);
    };

    for (const m of scheduled ?? []) {
      push({
        key: `hosted-${m.code}`,
        code: m.code,
        title: m.title,
        start: m.startTime,
        end: m.startTime + m.durationMinutes * 60_000,
        status: m.status,
        kind: "hosted",
        attendeeCount: m.attendees?.length ?? 0,
      });
    }
    for (const m of invited ?? []) {
      push({
        key: `invited-${m.code}`,
        code: m.code,
        title: m.title,
        start: m.startTime,
        end: m.startTime + m.durationMinutes * 60_000,
        status: m.status,
        kind: "invited",
        attendeeCount: m.attendees?.length ?? 0,
      });
    }
    for (const r of history ?? []) {
      const start = r.startedAt ?? r.createdAt;
      push({
        key: `past-${r.code}`,
        code: r.code,
        title: r.title ?? r.code,
        start,
        end: r.endedAt ?? start + 60 * 60_000,
        status: r.status ?? "past",
        kind: "past",
        attendeeCount: 0,
      });
    }
    return out.sort((a, b) => a.start - b.start);
  }, [scheduled, invited, history]);

  const navigateRange = (dir: 1 | -1) => {
    setCursor((c) =>
      view === "month" ? addMonths(c, dir) : addDays(c, dir * (view === "week" ? 7 : 1)),
    );
  };

  const title = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy");
    if (view === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      const end = endOfWeek(cursor, { weekStartsOn: 1 });
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    return format(cursor, "EEEE, MMMM d, yyyy");
  }, [cursor, view]);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/call/${code}`);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader active="calendar" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your meetings across time — hosted, invited, and past.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-border/80 bg-card/60 p-0.5">
              {(
                [
                  { id: "day", label: "Day", icon: CalendarDays },
                  { id: "week", label: "Week", icon: CalendarRange },
                  { id: "month", label: "Month", icon: CalendarDays },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    view === v.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <v.icon className="size-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-full"
              onClick={() => navigateRange(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setCursor(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-full"
              onClick={() => navigateRange(1)}
              aria-label="Next"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <p className="font-display text-lg font-semibold">{title}</p>
        </div>

        <div className="glass mt-4 overflow-hidden rounded-2xl">
          {view === "month" && <MonthView cursor={cursor} entries={entries} onPick={setDetails} />}
          {view === "week" && <WeekView cursor={cursor} entries={entries} onPick={setDetails} />}
          {view === "day" && <DayView cursor={cursor} entries={entries} onPick={setDetails} />}
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-indigo-500" /> Hosted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Invited
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/40" /> Past
          </span>
        </p>
      </main>

      <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="sm:max-w-sm">
          {details && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{details.title}</DialogTitle>
                <DialogDescription className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {format(details.start, "EEEE, MMMM d · h:mm a")} –{" "}
                  {format(details.end, "h:mm a")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-border/80 bg-card/50 px-3 py-2">
                  <span className="font-mono text-sm tracking-tight">{details.code}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                      details.status === "scheduled" && "bg-primary/10 text-primary",
                      details.status === "active" && "bg-emerald-500/15 text-emerald-500",
                      details.status === "ended" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {details.status === "scheduled"
                      ? "Scheduled"
                      : details.status === "active"
                        ? "Live"
                        : "Ended"}
                  </span>
                </div>
                {details.kind !== "past" && details.attendeeCount > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserPlus className="size-3.5" /> {details.attendeeCount} invited
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    className="flex-1 rounded-full"
                    onClick={() => {
                      setDetails(null);
                      navigate(`/call/${details.code}`);
                    }}
                  >
                    <Play className="mr-1.5 size-3.5" /> Join
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9 rounded-full"
                    onClick={() => void handleCopy(details.code)}
                    aria-label="Copy invite link"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- month ---------------- */

function MonthView({
  cursor,
  entries,
  onPick,
}: {
  cursor: Date;
  entries: Entry[];
  onPick: (e: Entry) => void;
}) {
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  return (
    <div className="grid grid-cols-7 border-b border-border/60 text-xs">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div
          key={d}
          className="border-r border-border/60 px-2 py-2 text-center font-medium text-muted-foreground last:border-r-0"
        >
          {d}
        </div>
      ))}
      {days.map((day) => {
        const dayEntries = entries
          .filter(
            (e) =>
              isSameDay(new Date(e.start), day) &&
              (isSameMonth(day, cursor) || e.status === "active"),
          )
          .slice(0, 3);
        const overflow = entries.filter((e) => isSameDay(new Date(e.start), day)).length - 3;
        const today = isSameDay(day, new Date());
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-24 border-r border-b border-border/60 p-1.5 last:border-r-0",
              !isSameMonth(day, cursor) && "bg-muted/30",
            )}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[11px]",
                today
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {format(day, "d")}
            </span>
            <div className="mt-1 space-y-1">
              {dayEntries.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => onPick(e)}
                  className={cn(
                    "block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-medium leading-none transition-colors hover:opacity-80",
                    e.kind === "hosted" && "bg-indigo-500/15 text-indigo-400",
                    e.kind === "invited" && "bg-emerald-500/15 text-emerald-500",
                    e.kind === "past" && "bg-muted text-muted-foreground",
                  )}
                  title={e.title}
                >
                  {format(e.start, "h:mm")} {e.title}
                </button>
              ))}
              {overflow > 0 && (
                <p className="px-1 text-[10px] text-muted-foreground">+{overflow} more</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- week ---------------- */

function WeekView({
  cursor,
  entries,
  onPick,
}: {
  cursor: Date;
  entries: Entry[];
  onPick: (e: Entry) => void;
}) {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-[48px_repeat(7,1fr)] text-xs">
        <div />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "border-l border-border/60 px-2 py-2 text-center font-medium",
              isSameDay(day, new Date())
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            {format(day, "EEE d")}
          </div>
        ))}
        {HOURS.map((hour) => (
          <div key={hour} className="contents">
            <div className="border-t border-border/60 px-2 py-1.5 text-right text-[10px] text-muted-foreground">
              {format(new Date().setHours(hour, 0, 0, 0), "h a")}
            </div>
            {days.map((day) => {
              const hourStart = day.setHours(hour, 0, 0, 0);
              const hourEnd = day.setHours(hour + 1, 0, 0, 0);
              const dayEntries = entries.filter(
                (e) => e.start < hourEnd && e.end > hourStart && e.start >= day.setHours(0, 0, 0, 0) && e.start < day.setHours(23, 59, 59, 999),
              );
              return (
                <div key={day.toISOString()} className="border-l border-t border-border/60 p-1">
                  {dayEntries.map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => onPick(e)}
                      className={cn(
                        "mb-1 block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-medium leading-tight transition-colors hover:opacity-80",
                        e.kind === "hosted" && "bg-indigo-500/15 text-indigo-400",
                        e.kind === "invited" && "bg-emerald-500/15 text-emerald-500",
                        e.kind === "past" && "bg-muted text-muted-foreground",
                      )}
                      title={e.title}
                    >
                      {format(e.start, "h:mm")} {e.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- day ---------------- */

function DayView({
  cursor,
  entries,
  onPick,
}: {
  cursor: Date;
  entries: Entry[];
  onPick: (e: Entry) => void;
}) {
  const dayEntries = entries.filter((e) => isSameDay(new Date(e.start), cursor));

  return (
    <div className="grid grid-cols-[64px_1fr] text-sm">
      <div />
      <div className="border-l border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
        {format(cursor, "EEEE, MMMM d")}
      </div>
      {HOURS.map((hour) => (
        <div key={hour} className="contents">
          <div className="border-t border-border/60 px-2 py-3 text-right text-[10px] text-muted-foreground">
            {format(new Date().setHours(hour, 0, 0, 0), "h a")}
          </div>
          <div className="border-l border-t border-border/60 p-1.5">
            {dayEntries
              .filter((e) => {
                const h = new Date(e.start).getHours();
                return h === hour;
              })
              .map((e) => (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => onPick(e)}
                  className={cn(
                    "mb-1.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:opacity-80",
                    e.kind === "hosted" && "bg-indigo-500/15 text-indigo-300",
                    e.kind === "invited" && "bg-emerald-500/15 text-emerald-500",
                    e.kind === "past" && "bg-muted text-muted-foreground",
                  )}
                >
                  <span className="text-[10px] tabular-nums opacity-70">
                    {format(e.start, "h:mm")}
                  </span>
                  <span className="truncate text-xs font-medium">{e.title}</span>
                  {e.kind === "hosted" && (
                    <Check className="ml-auto size-3 shrink-0 opacity-60" />
                  )}
                </button>
              ))}
          </div>
        </div>
      ))}
      {dayEntries.length === 0 && (
        <p className="col-span-2 py-10 text-center text-sm text-muted-foreground">
          Nothing scheduled this day.
        </p>
      )}
    </div>
  );
}
