import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppHeader } from "@/components/AppHeader";
import { FileSharingPanel } from "@/components/FileSharingPanel";
import { MeetingChat } from "@/components/MeetingChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  CalendarPlus,
  Check,
  ClipboardList,
  FileText,
  GripVertical,
  Loader2,
  MessageSquareText,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { id: "todo", label: "To Do", dot: "bg-slate-400" },
  { id: "inProgress", label: "In Progress", dot: "bg-amber-400" },
  { id: "review", label: "Review", dot: "bg-sky-400" },
  { id: "done", label: "Done", dot: "bg-emerald-400" },
] as const;

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-emerald-500/15 text-emerald-400",
};

function extractCode(raw: string): string {
  const match = raw
    .toLowerCase()
    .match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/);
  return match?.[1] ?? "";
}

type Card = {
  _id: Id<"kanbanCards">;
  code: string;
  column: string;
  title: string;
  description?: string;
  assignee?: string;
  dueDate?: number;
  priority?: string;
  labels: string[];
  createdAt: number;
  updatedAt: number;
};

export default function Collab() {
  const { code: rawCode } = useParams();
  const code = extractCode(rawCode ?? "");
  const navigate = useNavigate();
  const [tab, setTab] = useState<"notes" | "chat" | "board" | "ai" | "files">("notes");

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Invalid meeting code.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="history" />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </button>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Collaboration
            </h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{code}</p>
          </div>
          <div className="flex rounded-full border border-border/70 bg-card/60 p-1 backdrop-blur">
            {(
              [
                { id: "notes", label: "Notes", icon: FileText },
                { id: "chat", label: "Chat", icon: MessageSquareText },
                { id: "board", label: "Board", icon: ClipboardList },
                { id: "ai", label: "AI", icon: Sparkles },
                { id: "files", label: "Files", icon: Paperclip },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-all",
                  tab === t.id
                    ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          {tab === "notes" && <NotesTab code={code} />}
          {tab === "chat" && (
            <div className="glass rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <MessageSquareText className="size-4 text-primary" /> Meeting chat
                </h2>
                <p className="text-xs text-muted-foreground">
                  Shared with everyone in the meeting
                </p>
              </div>
              <div className="mt-2 h-px bg-border/70" />
              <MeetingChat code={code} className="mt-4 h-[58vh]" />
            </div>
          )}
          {tab === "board" && <BoardTab code={code} />}
          {tab === "ai" && <AiTab code={code} />}
          {tab === "files" && <FileSharingPanel code={code} />}
        </div>
      </main>
    </div>
  );
}

/* ---------------- Notes ---------------- */

function NotesTab({ code }: { code: string }) {
  const notes = useQuery(api.collab.getNotes, { code });
  const saveNotes = useMutation(api.collab.saveNotes);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (notes === undefined) return;
    setTitle(notes?.title ?? "");
    setContent(notes?.content ?? "");
  }, [notes]);

  const persist = (nextTitle: string, nextContent: string) => {
    setSaved(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void saveNotes({ code, title: nextTitle, content: nextContent })
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
    }, 800);
  };

  return (
    <div className="glass rounded-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            persist(e.target.value, content);
          }}
          placeholder="Meeting notes"
          className="h-12 border-0 bg-transparent px-0 font-display text-2xl font-bold shadow-none focus-visible:ring-0"
        />
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {saved ? (
            <>
              <Check className="size-3.5 text-emerald-500" /> Saved
            </>
          ) : (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Saving…
            </>
          )}
        </span>
      </div>
      <div className="mt-2 h-px bg-border/70" />
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          persist(title, e.target.value);
        }}
        placeholder={"Agenda, decisions, links… shared live with anyone who opens this meeting."}
        className="mt-4 min-h-[55vh] border-0 bg-transparent p-0 text-[15px] leading-7 shadow-none focus-visible:ring-0"
      />
      {notes && (
        <p className="mt-4 text-right text-xs text-muted-foreground/70">
          Last saved {new Date(notes.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

/* ---------------- Kanban board ---------------- */

function BoardTab({ code }: { code: string }) {
  const cards = useQuery(api.collab.getCards, { code });
  const addCard = useMutation(api.collab.addCard);
  const moveCard = useMutation(api.collab.moveCard);
  const deleteCard = useMutation(api.collab.deleteCard);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ column: string; card?: Card } | null>(null);

  const byColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of COLUMNS) map.set(c.id, []);
    for (const card of cards ?? []) map.get(card.column)?.push(card);
    for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    return map;
  }, [cards]);

  const handleDrop = (column: string) => {
    if (draggingId && column !== overColumn) {
      const card = cards?.find((c) => c._id === draggingId);
      if (card) void moveCard({ cardId: card._id, column });
    }
    setDraggingId(null);
    setOverColumn(null);
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(col.id);
            }}
            onDragLeave={() => setOverColumn((v) => (v === col.id ? null : v))}
            onDrop={() => handleDrop(col.id)}
            className={cn(
              "flex min-h-[300px] flex-col rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors",
              overColumn === col.id && "border-primary/50 bg-primary/5",
            )}
          >
            <div className="flex items-center justify-between px-1 pb-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn("size-2 rounded-full", col.dot)} />
                {col.label}
                <span className="text-xs font-normal text-muted-foreground">
                  {byColumn.get(col.id)?.length ?? 0}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDialog({ column: col.id })}
                aria-label={`Add card to ${col.label}`}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2.5">
              {byColumn.get(col.id)?.map((card) => (
                <div
                  key={card._id}
                  draggable
                  onDragStart={() => setDraggingId(card._id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverColumn(null);
                  }}
                  onClick={() => setDialog({ column: col.id, card })}
                  className={cn(
                    "group cursor-grab rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
                    draggingId === card._id && "opacity-40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-5">{card.title}</p>
                    <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />
                  </div>
                  {card.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {card.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {card.priority && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          PRIORITY_STYLES[card.priority],
                        )}
                      >
                        {card.priority}
                      </span>
                    )}
                    {card.assignee && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {card.assignee}
                      </span>
                    )}
                    {card.dueDate && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {new Date(card.dueDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {(byColumn.get(col.id)?.length ?? 0) === 0 && (
                <button
                  type="button"
                  onClick={() => setDialog({ column: col.id })}
                  className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-8 text-xs text-muted-foreground/70 transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Drop cards here or add one
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {dialog && (
        <CardDialog
          code={code}
          column={dialog.column}
          card={dialog.card}
          onClose={() => setDialog(null)}
          onSave={(values) => {
            void addCard({ code, column: dialog.column, ...values }).then(() =>
              toast.success("Card added."),
            );
            setDialog(null);
          }}
          onDelete={(id) => {
            void deleteCard({ cardId: id }).then(() => toast.success("Card deleted."));
            setDialog(null);
          }}
        />
      )}
    </>
  );
}

function CardDialog({
  code,
  column,
  card,
  onClose,
  onSave,
  onDelete,
}: {
  code: string;
  column: string;
  card?: Card;
  onClose: () => void;
  onSave: (values: {
    title: string;
    description?: string;
    assignee?: string;
    dueDate?: number;
    priority?: string;
    labels?: string[];
  }) => void;
  onDelete?: (id: Id<"kanbanCards">) => void;
}) {
  const updateCard = useMutation(api.collab.updateCard);
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [assignee, setAssignee] = useState(card?.assignee ?? "");
  const [priority, setPriority] = useState(card?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(
    card?.dueDate ? new Date(card.dueDate).toISOString().slice(0, 10) : "",
  );
  const [labels, setLabels] = useState((card?.labels ?? []).join(", "));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {card ? "Edit card" : `New card · ${COLUMNS.find((c) => c.id === column)?.label}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details…"
              className="mt-1.5 min-h-20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assignee</label>
              <Input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Name"
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Labels</label>
              <Input
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="comma, separated"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {card && onDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(card._id)}
              >
                <Trash2 className="mr-1.5 size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!title.trim()}
                onClick={() => {
                  if (card) {
                    void updateCard({
                      cardId: card._id,
                      title,
                      description: description || undefined,
                      assignee: assignee || undefined,
                      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
                      priority,
                      labels: labels
                        .split(",")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    }).then(() => toast.success("Card updated."));
                    onClose();
                  } else {
                    onSave({
                      title,
                      description: description || undefined,
                      assignee: assignee || undefined,
                      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
                      priority,
                      labels: labels
                        .split(",")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    });
                  }
                }}
              >
                {card ? "Save changes" : "Add card"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- AI ---------------- */

function AiTab({ code }: { code: string }) {
  const summaries = useQuery(api.aiData.getAiData, { code, kind: "summary" });
  const transcripts = useQuery(api.aiData.getAiData, { code, kind: "transcript" });
  const actionItems = useQuery(api.aiData.getAiData, { code, kind: "actionItems" });
  const recordings = useQuery(api.call.listRecordings, { code });
  const transcribe = useAction(api.ai.transcribeMeeting);
  const summarize = useAction(api.ai.summarizeTranscript);
  const ask = useAction(api.ai.askAssistant);

  const [busy, setBusy] = useState<"transcribe" | "summarize" | null>(null);
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);

  const summary = summaries?.[0];
  const transcript = transcripts?.[0];
  const items = actionItems?.[0]?.items ?? [];

  const handleTranscribe = async (storageId: Id<"_storage">) => {
    setBusy("transcribe");
    try {
      await transcribe({ code, storageId });
      toast.success("Transcribed — summary & action items are ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transcription failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleSummarize = async () => {
    setBusy("summarize");
    try {
      await summarize({ code });
      toast.success("Summary generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Summary failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setQuestion("");
    setAsking(true);
    try {
      const result = await ask({ code, question: q });
      setThread((prev) => [...prev, { q, a: result.answer }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assistant unavailable.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Summary + action items */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles className="size-4 text-primary" /> Meeting summary
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={handleSummarize}
            disabled={busy !== null || !transcript}
            title={transcript ? "Generate with OpenAI" : "No transcript yet"}
          >
            {busy === "summarize" ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 size-3.5" />
            )}
            Generate
          </Button>
        </div>
        <div className="mt-4 max-h-64 overflow-y-auto">
          {summary ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
              {summary.content}
            </pre>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {transcript
                ? "Hit Generate to summarize the transcript."
                : "No summary yet. Record the meeting and transcribe it to get AI insights."}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-border/60 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarPlus className="size-4 text-primary" /> Action items
          </h3>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No action items extracted yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-xl border border-border/60 p-3 text-sm leading-5"
                >
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Transcript */}
        <div className="glass rounded-2xl p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <FileText className="size-4 text-primary" /> Transcript
          </h2>
          <div className="mt-4 max-h-40 overflow-y-auto">
            {transcript ? (
              <pre className="whitespace-pre-wrap font-sans text-xs leading-5 text-muted-foreground">
                {transcript.content}
              </pre>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing transcribed yet.
              </p>
            )}
          </div>
          {(recordings?.length ?? 0) > 0 && (
            <div className="mt-4 border-t border-border/60 pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Recordings to transcribe
              </p>
              <ul className="mt-2 space-y-2">
                {/* only local captures (uploaded to Convex storage) can be
                    transcribed — LiveKit cloud recordings are MP4s that stay
                    on the cloud server */}
                {(recordings ?? [])
                  .filter((r) => r.storageId)
                  .map((r) => (
                  <li key={r._id} className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-full"
                      onClick={() => handleTranscribe(r.storageId!)}
                      disabled={busy !== null}
                    >
                      {busy === "transcribe" ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <MessageSquareText className="mr-1.5 size-3.5" />
                      )}
                      Transcribe
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Assistant */}
        <div className="glass rounded-2xl p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Bot className="size-4 text-primary" /> Ask the meeting
          </h2>
          <div className="mt-4 max-h-52 space-y-3 overflow-y-auto">
            {thread.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                "What did we decide about the API?" · "Who owns the follow-ups?"
              </p>
            )}
            {thread.map((t, i) => (
              <div key={i} className="space-y-2">
                <p className="rounded-2xl rounded-bl-sm bg-primary/10 px-3.5 py-2 text-sm">
                  {t.q}
                </p>
                <p className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm leading-6">
                  {t.a}
                </p>
              </div>
            ))}
          </div>
          <form onSubmit={handleAsk} className="mt-4 flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this meeting…"
              className="rounded-full"
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 rounded-full"
              disabled={asking || !question.trim()}
              aria-label="Ask"
            >
              {asking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="hidden" />
              )}
              <Bot className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
