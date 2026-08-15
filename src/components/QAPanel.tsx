import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { ChevronUp, Pin, PinOff, Send, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function QAPanel({
  code,
  isHost,
  clientId,
  onClose,
}: {
  code: string;
  isHost: boolean;
  clientId: string;
  onClose: () => void;
}) {
  const questions = useQuery(api.qa.listQuestions, { code });
  const ask = useMutation(api.qa.askQuestion);
  const toggleUpvote = useMutation(api.qa.toggleUpvote);
  const removeQuestion = useMutation(api.qa.removeQuestion);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't ask.");
    }
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-border/60 bg-background/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <p className="text-sm font-medium">Q&A</p>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close Q&A"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="border-b border-border/60 p-3">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            placeholder="Ask a question…"
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-lg border border-border/60 bg-muted/50 p-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
          />
          <Button
            size="icon"
            onClick={() => void submit()}
            disabled={!draft.trim()}
            aria-label="Ask question"
            className="h-9 w-9 shrink-0 rounded-full"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {questions === undefined ? (
          <p className="pt-8 text-center text-sm text-muted-foreground/70">Loading…</p>
        ) : questions.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted-foreground/70">
            No questions yet. Ask the first one.
          </p>
        ) : (
          questions.map((q) => {
            const mine = q.clientId === clientId;
            const upvoted = q.upvoters.includes(clientId);
            return (
              <div
                key={q._id}
                className={cn(
                  "rounded-xl border bg-muted/50 p-3",
                  q.pinned ? "border-amber-400/40" : "border-border/60",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {q.pinned && (
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                        <Pin className="size-2.5" /> Pinned
                      </span>
                    )}
                    <p className="text-sm text-foreground">{q.text}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {mine ? "You" : q.authorName} ·{" "}
                      {new Date(q.createdAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleUpvote({ code, questionId: q._id, clientId })}
                    className={cn(
                      "flex shrink-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-1 text-[11px] transition-colors",
                      upvoted
                        ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                        : "border-border/60 text-muted-foreground hover:border-border/80 hover:text-foreground",
                    )}
                    aria-label="Upvote question"
                  >
                    <ChevronUp className="size-3.5" />
                    <span className="tabular-nums">{q.upvotes}</span>
                  </button>
                </div>

                {q.answered && q.answer && (
                  <div className="mt-2.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                      Answer
                    </p>
                    <p className="mt-0.5 text-xs text-foreground">{q.answer}</p>
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
                  {isHost && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setAnsweringId(answeringId === q._id ? null : q._id);
                          setAnswerDraft(q.answer ?? "");
                        }}
                        className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                      >
                        {q.answered ? "Edit answer" : "Answer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePin({ code, questionId: q._id })}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={q.pinned ? "Unpin question" : "Pin question"}
                        title={q.pinned ? "Unpin" : "Pin to top"}
                      >
                        {q.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteQuestion({ code, questionId: q._id })}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-red-500/20 hover:text-red-600 dark:text-red-400"
                        aria-label="Delete question"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </>
                  )}
                  {(mine || isHost) && (
                    <button
                      type="button"
                      onClick={() => void removeQuestion({ code, questionId: q._id, clientId })}
                      className="ml-auto rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {isHost && answeringId === q._id && (
                  <div className="mt-2 flex gap-2">
                    <textarea
                      value={answerDraft}
                      onChange={(e) => setAnswerDraft(e.target.value)}
                      placeholder="Type an answer…"
                      rows={2}
                      maxLength={800}
                      autoFocus
                      className="w-full resize-none rounded-lg border border-border/60 bg-muted/50 p-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                    />
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        onClick={() =>
                          void answerQuestion({
                            code,
                            questionId: q._id,
                            answer: answerDraft,
                          }).then(() => setAnsweringId(null))
                        }
                        className="h-8 rounded-full px-2.5 text-[11px]"
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAnsweringId(null)}
                        className="h-8 rounded-full border-border/60 px-2.5 text-[11px] text-foreground hover:bg-muted"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isHost && (
        <div className="border-t border-border/60 p-3 text-center">
          <p className="text-[11px] text-muted-foreground/70">
            You're the host — answer, pin, or remove questions.
          </p>
        </div>
      )}
    </aside>
  );
}
