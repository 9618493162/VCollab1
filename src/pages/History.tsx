import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useAuth } from "@/hooks/use-auth";
import { ManageAttendeesDialog } from "@/components/ManageAttendeesDialog";
import { MeetingChat } from "@/components/MeetingChat";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CalendarClock,
  CalendarX,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  Play,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-500",
  scheduled: "bg-indigo-500/15 text-indigo-400",
  ended: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground/60",
};

export default function History() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const rooms = useQuery(api.rooms.listMyRooms);
  const scheduled = useQuery(api.meetings.listScheduled);
  const cancelScheduled = useMutation(api.meetings.cancelScheduled);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [details, setDetails] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    code: string;
    title: string;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const convex = useConvex();

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await convex.query(api.export.exportUserData);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vcollab-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Your data is downloading — meetings, notes, tasks, chat, AI, polls.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  type Scheduled = NonNullable<typeof scheduled>[number];
  const [manageTarget, setManageTarget] = useState<Scheduled | null>(null);

  const scheduledByCode = useMemo(() => {
    const map = new Map<string, Scheduled>();
    for (const s of scheduled ?? []) map.set(s.code, s);
    return map;
  }, [scheduled]);

  const rows = useMemo(() => {
    const all = (rooms ?? []).map((room) => {
      const meta = scheduledByCode.get(room.code);
      const status = room.status ?? meta?.status ?? "ended";
      const title = room.title ?? meta?.title ?? "Untitled meeting";
      const startTime = room.startedAt ?? meta?.startTime ?? room.createdAt;
      return { room, meta, title, status, startTime };
    });
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter(
        (r) =>
          !q ||
          r.title.toLowerCase().includes(q) ||
          r.room.code.toLowerCase().includes(q),
      )
      .sort((a, b) => b.startTime - a.startTime);
  }, [rooms, scheduledByCode, query, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [rows]);

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="history" />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Archive
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Meeting history
            </h1>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or code…"
                className="rounded-full pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => void handleExport()}
              disabled={exporting}
              title="Download all your VCollab data as JSON"
            >
              {exporting ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 size-3.5" />
              )}
              Export data
            </Button>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {["all", "active", "scheduled", "ended", "cancelled"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm capitalize transition-colors",
                statusFilter === s
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
              <span className="ml-1.5 text-xs opacity-70">{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="mt-8">
          {rooms === undefined || scheduled === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass h-40 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="glass rounded-2xl py-20 text-center">
              <CalendarClock className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-4 text-sm font-medium">No meetings found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {query
                  ? "Try a different search or filter."
                  : "Start your first meeting from the dashboard."}
              </p>
              <Button
                className="mt-6 rounded-full"
                onClick={() => navigate("/dashboard")}
              >
                New meeting <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(({ room, meta, title, status, startTime }) => {
                const isHost = meta?.hostId === user?._id;
                const invited = meta?.attendees?.length ?? 0;
                return (
                  <div
                    key={room._id}
                    className="glass group relative overflow-hidden rounded-2xl p-5 transition-all hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "rounded-full border-0 capitalize",
                          STATUS_STYLES[status] ?? STATUS_STYLES.ended,
                        )}
                      >
                        {status}
                      </Badge>
                      <p className="font-mono text-xs tracking-tight text-muted-foreground">
                        {room.code}
                      </p>
                    </div>

                    <h3 className="mt-4 truncate font-display text-base font-semibold">
                      {title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(startTime).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    {meta?.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/80">
                        {meta.description}
                      </p>
                    )}
                    {invited > 0 && status === "scheduled" && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="size-3" /> {invited} invited
                        {meta?.rsvps && meta.rsvps.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-500">
                              {meta.rsvps.filter((r) => r.status === "yes").length} going
                            </span>
                            <span className="text-muted-foreground/60">
                              · {meta.rsvps.filter((r) => r.status === "maybe").length} maybe
                            </span>
                          </>
                        )}
                        {!isHost && <span className="text-primary">· you're invited</span>}
                      </p>
                    )}

                    <div className="mt-5 flex items-center gap-2">
                      {(status === "active" || status === "scheduled") && (
                        <Button
                          size="sm"
                          className="rounded-full"
                          onClick={() => navigate(`/call/${room.code}`)}
                        >
                          <Play className="mr-1.5 size-3.5" /> Join
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => navigate(`/collab/${room.code}`)}
                      >
                        <ClipboardList className="mr-1.5 size-3.5" /> Notes & board
                      </Button>
                      {isHost && status === "scheduled" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full"
                            onClick={() => meta && setManageTarget(meta)}
                          >
                            <Users className="mr-1.5 size-3.5" /> Attendees
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setCancelTarget({ code: room.code, title })}
                          >
                            <CalendarX className="mr-1.5 size-3.5" /> Cancel
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto size-8 rounded-full"
                        aria-label="AI summary"
                        onClick={() => setDetails(room.code)}
                      >
                        <Sparkles className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {details && <MeetingDetails code={details} onClose={() => setDetails(null)} />}

      <ManageAttendeesDialog
        open={manageTarget !== null}
        onOpenChange={(open) => !open && setManageTarget(null)}
        meeting={manageTarget}
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

/** AI + recording details for a single meeting. */
function MeetingDetails({ code, onClose }: { code: string; onClose: () => void }) {
  const summaries = useQuery(api.aiData.getAiData, { code, kind: "summary" });
  const transcripts = useQuery(api.aiData.getAiData, { code, kind: "transcript" });
  const actionItems = useQuery(api.aiData.getAiData, { code, kind: "actionItems" });
  const recordings = useQuery(api.call.listRecordings, { code });
  const summarize = useAction(api.ai.summarizeTranscript);
  const [generating, setGenerating] = useState(false);

  const summary = summaries?.[0];
  const transcript = transcripts?.[0];
  const items = actionItems?.[0]?.items ?? [];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await summarize({ code });
      toast.success("Summary generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Summary failed.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Meeting details</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {code}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="summary">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="summary">
              <Sparkles className="mr-1.5 size-3.5" /> Summary
            </TabsTrigger>
            <TabsTrigger value="actions">
              <ClipboardList className="mr-1.5 size-3.5" /> Action items
            </TabsTrigger>
            <TabsTrigger value="transcript">
              <FileText className="mr-1.5 size-3.5" /> Transcript
            </TabsTrigger>
            <TabsTrigger value="recordings">
              <MessageSquareText className="mr-1.5 size-3.5" /> Recordings
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquareText className="mr-1.5 size-3.5" /> Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="max-h-96 overflow-y-auto">
            {summary ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
                {summary.content}
              </pre>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No summary yet{transcript ? " for this transcript" : ""}.
                </p>
                <Button
                  className="mt-4 rounded-full"
                  onClick={handleGenerate}
                  disabled={generating || !transcript}
                >
                  {generating ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  {transcript ? "Generate with AI" : "Record & transcribe first"}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="actions" className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No action items yet — generate a summary to extract them.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-border/60 p-3"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-6">{item}</p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="transcript" className="max-h-96 overflow-y-auto">
            {transcript ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
                {transcript.content}
              </pre>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No transcript yet — record the meeting and it will be
                transcribed automatically.
              </p>
            )}
          </TabsContent>

          <TabsContent value="chat">
            <MeetingChat code={code} readOnly className="max-h-96" />
          </TabsContent>

          <TabsContent value="recordings" className="max-h-96 overflow-y-auto">
            {recordings === undefined ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : recordings.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No recordings for this meeting.
              </p>
            ) : (
              <ul className="space-y-3">
                {recordings.map((r) => (
                  <li key={r._id} className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                      {r.durationMs
                        ? ` · ${Math.round(r.durationMs / 60_000)}m ${Math.round((r.durationMs / 1000) % 60)}s`
                        : ""}
                    </p>
                    <audio controls src={r.url} className="h-9 w-full" />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
