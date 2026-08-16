import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardList, Loader2, Plus, StickyNote, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const COLUMNS = ["todo", "inProgress", "review", "done"] as const;
const COLUMN_LABELS: Record<(typeof COLUMNS)[number], string> = {
  todo: "To do",
  inProgress: "In progress",
  review: "Review",
  done: "Done",
};

export function NotesTasksPanel({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"notes" | "tasks">("notes");

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-border/60 bg-background/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setTab("notes")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
              tab === "notes" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <StickyNote className="size-3.5" /> Notes
          </button>
          <button
            type="button"
            onClick={() => setTab("tasks")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
              tab === "tasks" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardList className="size-3.5" /> Tasks
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close notes and tasks"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "notes" ? (
          <NotesTab code={code} />
        ) : (
          <TasksTab code={code} />
        )}
      </div>
    </aside>
  );
}

function NotesTab({ code }: { code: string }) {
  const note = useQuery(api.collab.getNotes, { code });
  const saveNotes = useMutation(api.collab.saveNotes);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  // hydrate once the server doc arrives
  useEffect(() => {
    if (note === undefined || hydratedRef.current) return;
    hydratedRef.current = true;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
  }, [note]); // hydrate once when the note arrives

  const schedule = (fn: () => void) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setSaveState("saving");
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      fn();
    }, 700);
  };

  const persist = async (t: string, c: string) => {
    try {
      await saveNotes({ code, title: t, content: c });
      setSaveState("saved");
    } catch {
      setSaveState("idle");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule(() => void persist(e.target.value, content));
          }}
          placeholder="Meeting notes title"
          className="h-9 border-border/60 bg-muted/50 text-sm font-medium text-foreground placeholder:text-muted-foreground"
        />
        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            schedule(() => void persist(title, e.target.value));
          }}
          placeholder="Type notes here — they autosave and are shared with everyone in the meeting…"
          className="min-h-[220px] flex-1 resize-none border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between border-t border-border/60 px-4 text-[11px] text-muted-foreground/70">
        <span>Shared notes</span>
        <span className="flex items-center gap-1">
          {saveState === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin" /> Saving…
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> Saved
            </>
          )}
          {saveState === "idle" && "Autosave on"}
        </span>
      </div>
    </div>
  );
}

function TasksTab({ code }: { code: string }) {
  const cards = useQuery(api.collab.getCards, { code });
  const addCard = useMutation(api.collab.addCard);
  const moveCard = useMutation(api.collab.moveCard);
  const deleteCard = useMutation(api.collab.deleteCard);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const map: Record<string, NonNullable<typeof cards>> = {
      todo: [],
      inProgress: [],
      review: [],
      done: [],
    };
    for (const c of COLUMNS) map[c] = (cards ?? []).filter((card) => card.column === c);
    return map;
  }, [cards]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await addCard({
        code,
        column: "todo",
        title,
        assignee: assignee.trim() || undefined,
      });
      setTitle("");
      setAssignee("");
    } catch (error) {
      // surface via the button state; keep the draft
      console.error(error);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} className="space-y-2 border-b border-border/60 p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task…"
          className="h-9 border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <div className="flex gap-2">
          <Input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Assignee (optional)"
            className="h-8 flex-1 border-border/60 bg-muted/50 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <Button type="submit" size="sm" className="h-8 shrink-0 px-3 text-xs">
            <Plus className="mr-1 size-3.5" /> Add
          </Button>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto p-3">
        {cards !== undefined && cards.length === 0 && (
          <p className="pt-4 text-center text-sm text-muted-foreground/70">
            No tasks yet — add one above, then drag cards between columns.
          </p>
        )}
        {COLUMNS.map((col) => {
          const colCards = byColumn[col] ?? [];
          const isOver = dragOverCol === col;
          return (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverCol(col);
              }}
              onDragLeave={(e) => {
                // only clear when the pointer actually leaves the column
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDragOverCol((prev) => (prev === col ? null : prev));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) void moveCard({ cardId: id as Id<"kanbanCards">, column: col });
                setDragOverCol(null);
              }}
              className={cn(
                "mb-3 rounded-xl border p-2 transition-colors",
                isOver
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/50",
              )}
            >
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {COLUMN_LABELS[col]} · {colCards.length}
              </p>
              {colCards.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 px-2 py-3 text-center text-[11px] text-muted-foreground/40">
                  Drop tasks here
                </p>
              ) : (
                <div className="space-y-2">
                  {colCards.map((card) => (
                    <div
                      key={card._id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(card._id));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragOverCol(null)}
                      className={cn(
                        "group cursor-grab rounded-xl border border-border/60 bg-muted/50 p-2.5 transition-shadow active:cursor-grabbing",
                        isOver && "opacity-60",
                      )}
                    >
                      <p className="text-sm text-foreground">{card.title}</p>
                      {(card.assignee || card.priority) && (
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {card.assignee && `→ ${card.assignee}`}
                          {card.assignee && card.priority && " · "}
                          {card.priority && <span className="capitalize">{card.priority}</span>}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <select
                          value={card.column}
                          onChange={(e) => void moveCard({ cardId: card._id, column: e.target.value })}
                          aria-label="Move task"
                          className="h-7 flex-1 rounded-md border border-border/60 bg-muted/60 px-1.5 text-[11px] text-muted-foreground"
                        >
                          {COLUMNS.map((c) => (
                            <option key={c} value={c}>
                              {COLUMN_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void deleteCard({ cardId: card._id })}
                          aria-label="Delete task"
                          title="Delete task"
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-600 dark:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
