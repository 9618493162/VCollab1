import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  BarChart3,
  Check,
  ChevronUp,
  ClipboardList,
  FileUp,
  LinkIcon,
  MessageCircleQuestion,
  Pin,
  PinOff,
  Plus,
  Send,
  StickyNote,
  Trash2,
  UploadCloud,
  X,
  FileIcon,
  Download,
  Loader2,
  Lock,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

type WorkspaceTab = "notes" | "tasks" | "polls" | "qa" | "files";

const TABS: { key: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { key: "notes", label: "Notes", icon: <StickyNote className="size-3.5" /> },
  { key: "tasks", label: "Tasks", icon: <ClipboardList className="size-3.5" /> },
  { key: "polls", label: "Polls", icon: <BarChart3 className="size-3.5" /> },
  { key: "qa", label: "Q&A", icon: <MessageCircleQuestion className="size-3.5" /> },
  { key: "files", label: "Files", icon: <FileUp className="size-3.5" /> },
];

const COLUMNS = ["todo", "inProgress", "review", "done"] as const;
const COLUMN_LABELS: Record<(typeof COLUMNS)[number], string> = {
  todo: "To do",
  inProgress: "In progress",
  review: "Review",
  done: "Done",
};

// ─── Notes Tab ───────────────────────────────────────────────

function NotesTab({ code }: { code: string }) {
  const notes = useQuery(api.collab.getNotes, { code });
  const saveNotes = useMutation(api.collab.saveNotes);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const presence = useQuery(api.call.listParticipants, { code });

  // Sync from server when notes load/change
  useEffect(() => {
    if (notes != null) {
      setTitle(notes.title);
      setContent(notes.content);
    }
  }, [notes]);

  // Debounced save
  useEffect(() => {
    if (notes == null) return;
    const timeout = setTimeout(async () => {
      if (title === notes.title && content === notes.content) return;
      setSaving(true);
      try {
        await saveNotes({ code, title: title || "Meeting notes", content });
      } catch {
        // Silent — will retry
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [title, content, notes, saveNotes, code]);

  // Handle @mention detection in textarea
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setContent(val);

      // Detect @mention trigger
      const cursorPos = e.target.selectionStart;
      const textBefore = val.slice(0, cursorPos);
      const mentionMatch = textBefore.match(/@([A-Za-z][A-Za-z0-9_]*)$/);
      if (mentionMatch) {
        setShowMentions(true);
        setMentionQuery(mentionMatch[1].toLowerCase());
      } else {
        setShowMentions(false);
      }
    },
    [],
  );

  // Filter participants for mention suggestions
  const mentionSuggestions = useMemo(() => {
    if (!presence) return [];
    const seen = new Set<string>();
    return presence
      .filter((p) => {
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return p.name.toLowerCase().includes(mentionQuery);
      })
      .slice(0, 6)
      .map((p) => p.name);
  }, [presence, mentionQuery]);

  const insertMention = useCallback(
    (name: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursorPos = textarea.selectionStart;
      const textBefore = content.slice(0, cursorPos);
      const textAfter = content.slice(cursorPos);
      const newContent = textBefore.replace(/@[A-Za-z][A-Za-z0-9_]*$/, `@${name} `) + textAfter;
      setContent(newContent);
      setShowMentions(false);
      textarea.focus();
    },
    [content],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled notes"
        className="shrink-0 border-b border-border/60 bg-transparent px-4 py-2.5 text-sm font-medium outline-none placeholder:text-muted-foreground"
      />
      <div className="relative flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          placeholder="Start writing your notes... Use @Name to mention participants"
          className="h-full w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />

        {/* @mention dropdown */}
        {showMentions && mentionSuggestions.length > 0 && (
          <div className="absolute left-4 top-0 z-50 -translate-y-full rounded-lg border border-border/60 bg-background/95 shadow-lg backdrop-blur-md">
            {mentionSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => insertMention(name)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/80 first:rounded-t-lg last:rounded-b-lg"
              >
                <AtSign className="size-3 text-muted-foreground" />
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Save indicator */}
      <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-2">
        <span className="text-[10px] text-muted-foreground">
          {saving ? "Saving..." : notes !== undefined ? "Saved" : ""}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {content.length}/50,000
        </span>
      </div>
    </div>
  );
}

// ─── Tasks Tab ───────────────────────────────────────────────

function TasksTab({ code, isHost }: { code: string; isHost: boolean }) {
  const cards = useQuery(api.collab.getCards, { code });
  const addCard = useMutation(api.collab.addCard);
  const moveCard = useMutation(api.collab.moveCard);
  const deleteCard = useMutation(api.collab.deleteCard);

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async (column: string) => {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      await addCard({
        code,
        column,
        title,
        assignee: newAssignee.trim() || undefined,
      });
      setNewTitle("");
      setNewAssignee("");
      setAddingTo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setBusy(false);
    }
  };

  type CardItem = NonNullable<typeof cards>[number];

  const grouped = useMemo(() => {
    const map: Record<string, CardItem[]> = {
      todo: [],
      inProgress: [],
      review: [],
      done: [],
    };
    if (cards && Array.isArray(cards)) {
      for (const card of cards) {
        const col = COLUMNS.includes(card.column as (typeof COLUMNS)[number])
          ? card.column
          : "todo";
        map[col].push(card as CardItem);
      }
    }
    return map;
  }, [cards]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {COLUMNS.map((col) => (
          <div key={col} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {COLUMN_LABELS[col]}
                <span className="ml-1 text-[10px] opacity-60">
                  ({grouped[col].length})
                </span>
              </span>
              {isHost && (
                <button
                  type="button"
                  onClick={() => setAddingTo(addingTo === col ? null : col)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>

            {/* Add card form */}
            {addingTo === col && (
              <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-2">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Task title..."
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd(col)}
                  autoFocus
                />
                <Input
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  placeholder="Assign to..."
                  className="h-7 text-xs"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={() => handleAdd(col)}
                    disabled={busy || !newTitle.trim()}
                    className="h-6 text-xs"
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAddingTo(null)}
                    className="h-6 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Cards */}
            {grouped[col].map((card) => (
              <div
                key={card._id}
                className="group flex items-start gap-2 rounded-lg border border-border/40 bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug">{card.title}</p>
                  {card.assignee && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      → {card.assignee}
                    </p>
                  )}
                  {card.priority && (
                    <span
                      className={cn(
                        "mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium",
                        card.priority === "high" && "bg-red-500/20 text-red-400",
                        card.priority === "medium" && "bg-yellow-500/20 text-yellow-400",
                        card.priority === "low" && "bg-green-500/20 text-green-400",
                      )}
                    >
                      {card.priority}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {col !== "done" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const idx = COLUMNS.indexOf(col as (typeof COLUMNS)[number]);
                        if (idx < COLUMNS.length - 1) {
                          await moveCard({ cardId: card._id, column: COLUMNS[idx + 1] });
                        }
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      title="Move forward"
                    >
                      <Check className="size-3" />
                    </button>
                  )}
                  {isHost && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteCard({ cardId: card._id });
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {grouped[col].length === 0 && (
              <p className="py-2 text-center text-[10px] text-muted-foreground/60">
                No tasks
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Polls Tab ───────────────────────────────────────────────

function PollsTab({
  code,
  isHost,
  clientId,
}: {
  code: string;
  isHost: boolean;
  clientId: string;
}) {
  const polls = useQuery(api.polls.listPolls, { code, viewer: clientId });
  const createPoll = useMutation(api.polls.createPoll);
  const launchPoll = useMutation(api.polls.launchPoll);
  const closePoll = useMutation(api.polls.closePoll);
  const deletePoll = useMutation(api.polls.deletePoll);
  const setPollVote = useMutation(api.polls.setPollVote);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"single" | "multiple" | "anonymous">("single");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const list = options
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      await createPoll({ code, title, type, options: list });
      setTitle("");
      setOptions("");
      setCreating(false);
      toast.success("Poll created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create poll");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {isHost && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreating(!creating)}
            className="w-full"
          >
            <Plus className="mr-1.5 size-3.5" />
            Create Poll
          </Button>
        )}

        {creating && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Poll question..."
              className="h-8 text-xs"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs"
            >
              <option value="single">Single choice</option>
              <option value="multiple">Multiple choice</option>
              <option value="anonymous">Anonymous</option>
            </select>
            <Textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={"Option 1\nOption 2\nOption 3"}
              className="h-20 text-xs"
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={busy || !title.trim() || options.split("\n").filter((o) => o.trim()).length < 2}
              >
                {busy ? "Creating..." : "Create"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {polls && polls.length === 0 && !creating && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No polls yet. {isHost ? "Create one to get started." : "The host can create polls."}
          </p>
        )}

        {polls?.map((poll) => {
          const totalVotes = poll.voterCount || 0;
          const maxVotes = Math.max(...poll.totals, 1);

          return (
            <div
              key={poll._id}
              className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{poll.title}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                    </span>
                    {poll.closed && (
                      <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] text-red-400">
                        Closed
                      </span>
                    )}
                    {!poll.launched && (
                      <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[9px] text-yellow-400">
                        Draft
                      </span>
                    )}
                  </div>
                </div>
                {isHost && (
                  <div className="flex shrink-0 gap-1">
                    {!poll.launched && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => launchPoll({ code, pollId: poll._id })}
                        className="h-6 text-[10px]"
                      >
                        Launch
                      </Button>
                    )}
                    {poll.launched && !poll.closed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => closePoll({ code, pollId: poll._id })}
                        className="h-6 text-[10px]"
                      >
                        <Lock className="mr-1 size-3" />
                        Close
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => deletePoll({ code, pollId: poll._id })}
                      className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="space-y-1.5">
                {poll.options.map((opt, i) => {
                  const votes = poll.totals[i] || 0;
                  const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                  const selected = poll.myChoices.includes(i);

                  return (
                    <button
                      key={`${poll._id}-${i}`}
                      type="button"
                      disabled={poll.closed || !poll.launched}
                      onClick={async () => {
                        try {
                          await setPollVote({
                            code,
                            pollId: poll._id,
                            voter: clientId,
                            choice: i,
                            vote: !selected,
                          });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed");
                        }
                      }}
                      className={cn(
                        "relative w-full overflow-hidden rounded-md border p-2 text-left text-xs transition-all",
                        selected
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/40 hover:border-border/60",
                        poll.closed && "cursor-default",
                      )}
                    >
                      {/* Progress bar background */}
                      {(poll.showResults || poll.closed) && (
                        <div
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-md transition-all duration-500",
                            selected ? "bg-primary/15" : "bg-muted/40",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                      <div className="relative flex items-center justify-between">
                        <span className="font-medium">{opt}</span>
                        {(poll.showResults || poll.closed) && (
                          <span className="text-[10px] text-muted-foreground">
                            {pct}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Q&A Tab ─────────────────────────────────────────────────

function QATab({
  code,
  isHost,
  clientId,
}: {
  code: string;
  isHost: boolean;
  clientId: string;
}) {
  const questions = useQuery(api.qa.listQuestions, { code });
  const ask = useMutation(api.qa.askQuestion);
  const toggleUpvote = useMutation(api.qa.toggleUpvote);
  const answerQuestion = useMutation(api.qa.answerQuestion);
  const togglePin = useMutation(api.qa.togglePin);
  const deleteQuestion = useMutation(api.qa.deleteQuestion);

  const [draft, setDraft] = useState("");
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await ask({ code, clientId, authorName: "You", text });
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't ask");
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {questions && questions.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No questions yet. Be the first to ask!
          </p>
        )}

        {questions?.map((q) => (
          <div
            key={q._id}
            className={cn(
              "rounded-lg border p-3 space-y-2",
              q.pinned
                ? "border-primary/40 bg-primary/5"
                : "border-border/40 bg-muted/20",
            )}
          >
            <div className="flex items-start gap-2">
              {/* Upvote */}
              <button
                type="button"
                onClick={() => toggleUpvote({ code, questionId: q._id, clientId })}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded px-1.5 py-1 transition-colors",
                  q.upvoters.includes(clientId)
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ChevronUp className="size-4" />
                <span className="text-[10px] font-medium">{q.upvotes}</span>
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {q.pinned && (
                    <Pin className="size-3 shrink-0 text-primary" />
                  )}
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {q.authorName}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed">{q.text}</p>

                {/* Answer */}
                {q.answered && q.answer && (
                  <div className="mt-2 rounded-md bg-primary/5 p-2">
                    <p className="text-[10px] font-medium text-primary">Answer:</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{q.answer}</p>
                  </div>
                )}

                {/* Host actions */}
                {isHost && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        togglePin({ code, questionId: q._id })
                      }
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {q.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAnsweringId(answeringId === q._id ? null : q._id);
                        setAnswerDraft(q.answer || "");
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {q.answered ? "Edit answer" : "Answer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteQuestion({ code, questionId: q._id })}
                      className="text-[10px] text-muted-foreground hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                )}

                {/* Answer input */}
                {answeringId === q._id && (
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={answerDraft}
                      onChange={(e) => setAnswerDraft(e.target.value)}
                      placeholder="Type your answer..."
                      className="h-7 flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && answerDraft.trim()) {
                          answerQuestion({
                            code,
                            questionId: q._id,
                            answer: answerDraft.trim(),
                          });
                          setAnsweringId(null);
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (answerDraft.trim()) {
                          answerQuestion({
                            code,
                            questionId: q._id,
                            answer: answerDraft.trim(),
                          });
                          setAnsweringId(null);
                        }
                      }}
                      className="h-7 text-xs"
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ask question input */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-3 py-2.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question..."
          className="h-8 flex-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          size="sm"
          onClick={submit}
          disabled={!draft.trim()}
          className="h-8 shrink-0 px-2.5"
        >
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Files Tab ──────────────────────────────────────────────

function FilesTab({ code }: { code: string }) {
  const files = useQuery(api.supabaseData.listFiles, { code });
  const links = useQuery(api.collab.getLinks, { code });
  const addLink = useMutation(api.collab.addLink);
  const removeLink = useMutation(api.collab.removeLink);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const handleAddLink = async () => {
    if (!linkUrl.trim() || addingLink) return;
    setAddingLink(true);
    try {
      await addLink({ code, title: linkTitle.trim() || linkUrl.trim(), url: linkUrl.trim() });
      setLinkTitle("");
      setLinkUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add link");
    } finally {
      setAddingLink(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Files */}
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">Files</p>
          {files && files.length === 0 && (!links || links.length === 0) && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileUp className="mb-2 size-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No files or links shared yet
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/60">
                Share files and links with your team
              </p>
            </div>
          )}
          {files?.map((file) => (
            <div
              key={file._id}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-2.5"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10">
                <FileIcon className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{file.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {file.uploadedByName} •{" "}
                  {file.size < 1024 * 1024
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Shared Links */}
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">Links</p>
          {links?.map((link) => (
            <div
              key={link._id}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-2.5 mb-1.5"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10">
                <LinkIcon className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-xs font-medium text-primary hover:underline"
                >
                  {link.title}
                </a>
                <p className="text-[10px] text-muted-foreground">{link.addedBy}</p>
              </div>
              <button
                type="button"
                onClick={() => void removeLink({ code, linkId: link._id }).catch(() => {})}
                className="size-6 shrink-0 rounded-full text-muted-foreground/50 hover:bg-muted hover:text-red-500"
                aria-label="Remove link"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}

          {/* Add link form */}
          <div className="mt-2 flex gap-1.5">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 flex-1 rounded-lg border-border/60 bg-muted/50 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") void handleAddLink(); }}
            />
            <Input
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder="Title"
              className="h-8 w-24 rounded-lg border-border/60 bg-muted/50 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleAddLink()}
              disabled={!linkUrl.trim() || addingLink}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              aria-label="Add link"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Workspace ──────────────────────────────────────────

export function CollaborationWorkspace({
  code,
  isHost,
  clientId,
  onClose,
  initialTab,
}: {
  code: string;
  isHost: boolean;
  clientId: string;
  onClose: () => void;
  initialTab?: WorkspaceTab;
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab || "notes");

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-border/60 bg-background/95 backdrop-blur-md sm:w-96">
      {/* Header with tabs */}
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                tab === t.key
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Tab content */}
      {tab === "notes" && <NotesTab code={code} />}
      {tab === "tasks" && <TasksTab code={code} isHost={isHost} />}
      {tab === "polls" && (
        <PollsTab code={code} isHost={isHost} clientId={clientId} />
      )}
      {tab === "qa" && (
        <QATab code={code} isHost={isHost} clientId={clientId} />
      )}
      {tab === "files" && <FilesTab code={code} />}
    </aside>
  );
}
