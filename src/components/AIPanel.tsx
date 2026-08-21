import { useEffect, useRef, useState } from "react";
import { Bot, FileText, ListChecks, Lightbulb, MessageCircleQuestion, Send, Sparkles, X, Loader2, AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "convex/react";
import { useCallRoom } from "@/hooks/use-call-room";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; text: string };

const QUICK_ACTIONS = [
  { id: "summarize", label: "Summarize meeting", icon: Sparkles, prompt: "Provide a meeting summary with: Overview, Key Discussions, Decisions, Action Items, and Next Steps." },
  { id: "actions", label: "Action items", icon: ListChecks, prompt: "Extract all action items from this meeting. For each, identify the task and the person responsible." },
  { id: "decisions", label: "Decisions", icon: Lightbulb, prompt: "List all decisions that were made during this meeting." },
  { id: "questions", label: "Open questions", icon: MessageCircleQuestion, prompt: "What questions remain unresolved or need follow-up after this meeting?" },
];

export function AIPanel({
  code,
  call,
  onClose,
}: {
  code: string;
  call: ReturnType<typeof useCallRoom>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"assistant" | "transcript">("assistant");

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-border/60 bg-background/95 backdrop-blur-md sm:w-80">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setTab("assistant")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
              tab === "assistant" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bot className="size-3.5" /> Assistant
          </button>
          <button
            type="button"
            onClick={() => setTab("transcript")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
              tab === "transcript" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="size-3.5" /> Transcript
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close AI panel"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "assistant" ? <AssistantTab code={code} /> : <TranscriptTab call={call} />}
      </div>
    </aside>
  );
}

function AssistantTab({ code }: { code: string }) {
  const ask = useAction(api.ai.askAssistant);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    setLoading(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    try {
      const res = await ask({ code, question: trimmed });
      setMessages((prev) => [...prev, { role: "assistant", text: res.answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/not configured|isn\'t configured|no.*key|api.*key/i.test(msg)) {
        setError("AI Assistant isn\'t available. Configure an AI provider (NVIDIA, Groq, OpenRouter, or OpenAI) in the project Keys tab to enable meeting intelligence.");
      } else {
        setError(msg || "AI couldn\'t complete this request. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !loading && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center pt-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 mb-3">
                <Bot className="size-6 text-indigo-500" />
              </div>
              <p className="text-sm font-medium text-foreground">AI Meeting Assistant</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Ask anything about this meeting
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">Quick actions</p>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => void submit(action.prompt)}
                    className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <action.icon className="size-3.5 shrink-0 text-primary/70" />
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">Or ask a question</p>
              {[
                "What decisions were made?",
                "Who is responsible for what?",
                "What did we discuss about the backend?",
              ].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void submit(ex)}
                  className="block w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
            <div
              className={msg.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "space-y-1"
              }
            >
              {msg.role === "assistant" && (
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">Assistant</p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Thinking...
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex shrink-0 gap-2 border-t border-border/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this meeting..."
          className="h-10 flex-1 rounded-full border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          disabled={loading || !question.trim()}
          className="h-10 w-10 shrink-0 rounded-full border-border/60 text-foreground hover:bg-muted"
          aria-label="Ask assistant"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function TranscriptTab({ call }: { call: ReturnType<typeof useCallRoom> }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [call.captions?.length]);

  if (!call.captionsEnabled) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/40 bg-muted/40 mb-3">
          <FileText className="size-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Transcription off</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Turn on captions with the CC button to see live transcription here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {call.captions && call.captions.length > 0 ? (
          call.captions.map((c, i) => {
            const time = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            return (
              <div key={i} className="group">
                <p className="text-[10px] font-mono text-muted-foreground/50 mb-0.5">{time}</p>
                <p className="text-xs leading-relaxed text-foreground/80">{c}</p>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center pt-12 text-center">
            <div className="relative mb-3">
              <Loader2 className="size-6 animate-spin text-primary/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Listening...</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Transcript will appear as people speak</p>
          </div>
        )}
        {call.interimCaption && (
          <p className="text-xs italic text-muted-foreground/60 border-l-2 border-primary/30 pl-2">{call.interimCaption}</p>
        )}
        <div ref={endRef} />
      </div>
      <p className="shrink-0 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground/70">
        {call.captionError ?? "Live captions · in-meeting only, not saved"}
      </p>
    </div>
  );
}
