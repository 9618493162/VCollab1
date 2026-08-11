import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { MessageSquareText, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatTime(ts: number) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(
    undefined,
    sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        },
  );
}

/**
 * Persistent chat for a meeting. Every message posted during the live call
 * (and from the Collab page) is stored per meeting code, so anyone with access
 * can review or continue the conversation after the call ends.
 */
export function MeetingChat({
  code,
  readOnly = false,
  className,
}: {
  code: string;
  /** Hide the composer (e.g. inside the History details dialog). */
  readOnly?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const messages = useQuery(api.call.listMessages, { code });
  const sendMessage = useMutation(api.call.sendMessage);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || !user) return;
    setSending(true);
    try {
      await sendMessage({
        code,
        from: user._id,
        name: user.name?.trim() || "Guest",
        text,
      });
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  const mine = (from: string) => user !== null && user !== undefined && from === user._id;

  return (
    <div className={cn("flex flex-col", className)}>
      {messages === undefined ? (
        <div className="flex-1 space-y-3 py-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <MessageSquareText className="size-5 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">
            {readOnly
              ? "No chat messages for this meeting."
              : "No messages yet. Start the conversation."}
          </p>
          {readOnly && (
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground/70">
              Messages posted during the call and from the meeting page appear
              here.
            </p>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((msg) => {
            const isMine = mine(msg.from);
            return (
              <div
                key={msg._id}
                className={cn(
                  "flex items-end gap-2.5",
                  isMine && "flex-row-reverse",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-bold text-white",
                    isMine && "from-fuchsia-500 to-indigo-500",
                  )}
                >
                  {(msg.name.trim()[0] ?? "?").toUpperCase()}
                </span>
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl border px-3.5 py-2.5",
                    isMine
                      ? "rounded-br-sm border-primary/25 bg-primary/10"
                      : "rounded-bl-sm border-border/60 bg-muted/70",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-baseline gap-2 text-xs",
                      isMine && "flex-row-reverse",
                    )}
                  >
                    <span className="font-medium">
                      {isMine ? "You" : msg.name}
                    </span>
                    <span className="text-muted-foreground/70">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6">
                    {msg.text}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {!readOnly && (
        <form
          onSubmit={handleSend}
          className="mt-4 flex shrink-0 items-center gap-2"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the meeting…"
            maxLength={500}
            aria-label="Message the meeting"
            className="h-11 flex-1 rounded-full"
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            disabled={sending || !draft.trim() || !user}
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        </form>
      )}

      {readOnly && messages !== undefined && messages.length > 0 && (
        <p className="mt-3 shrink-0 text-center text-[11px] text-muted-foreground/70">
          Continue the conversation from the{" "}
          <Link
            to={`/collab/${code}`}
            className="font-medium text-foreground/80 underline-offset-2 hover:underline"
          >
            meeting page
          </Link>
          .
        </p>
      )}
    </div>
  );
}
