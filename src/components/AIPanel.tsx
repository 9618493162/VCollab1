import { useEffect, useRef, useState } from "react";
import { Bot, FileText, Loader2, Send, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "convex/react";
import { useCallRoom } from "@/hooks/use-call-room";

const EXAMPLES = [
  "What decisions have been made?",
  "Who is responsible for the API?",
  "What did we discuss about the database?",
  "What are the unresolved issues?",
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
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-white/10 bg-neutral-900/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5">
          <button
            type="button"
            onClick={() => setTab("assistant")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
              tab === "assistant" ? "bg-white/15 text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Bot className="size-3.5" /> Assistant
          </button>
          <button
            type="button"
            onClick={() => setTab("transcript")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
              tab === "transcript" ? "bg-white/15 text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            <FileText className="size-3.5" /> Transcript
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 transition-colors hover:text-white"
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
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answer, loading]);

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    setLoading(true);
    setError(null);
    try {
      const res = await ask({ code, question: trimmed });
      setAnswer(res.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant couldn't respond.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {answer === null && !loading && (
          <div className="space-y-2">
            <p className="text-sm text-neutral-300">
              Ask about this meeting — answers come from the recorded transcript and
              AI summary only.
            </p>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => void submit(ex)}
                className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                “{ex}”
              </button>
            ))}
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Loader2 className="size-3.5 animate-spin" /> Reading the meeting…
          </div>
        )}
        {answer !== null && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Assistant
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
              {answer}
            </p>
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex shrink-0 gap-2 border-t border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this meeting…"
          className="h-10 flex-1 rounded-full border-white/10 bg-white/5 text-sm text-white placeholder:text-neutral-500"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          disabled={loading || !question.trim()}
          className="h-10 w-10 shrink-0 rounded-full border-white/10 text-white hover:bg-white/10"
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
      <div className="p-6 text-center">
        <p className="text-sm text-neutral-400">
          Live captions are off. Turn them on with the captions button to see the transcript here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {call.captions && call.captions.length > 0 ? (
          call.captions.map((c, i) => (
            <p key={i} className="text-xs leading-relaxed text-neutral-300">
              <span className="mr-2 font-mono text-[10px] text-neutral-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              {c}
            </p>
          ))
        ) : (
          <p className="pt-8 text-center text-sm text-neutral-500">
            Captions will appear here as people speak.
          </p>
        )}
        {call.interimCaption && (
          <p className="text-xs italic text-neutral-500">{call.interimCaption}</p>
        )}
        <div ref={endRef} />
      </div>
      <p className="shrink-0 border-t border-white/10 px-4 py-2 text-[11px] text-neutral-500">
        {call.captionError ?? "Live captions · in-meeting only, not saved"}
      </p>
    </div>
  );
}
