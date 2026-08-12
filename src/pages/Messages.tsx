import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePresence } from "@/hooks/use-presence";
import { PresenceDot } from "@/components/PresenceDot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, PenSquare, Search, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

function timeLabel(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Messages() {
  usePresence();
  const threads = useQuery(api.dms.listThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<Id<"dmThreads"> | null>(null);
  const [composer, setComposer] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useQuery(
    api.dms.listMessages,
    selectedThreadId ? { threadId: selectedThreadId } : "skip",
  );
  const markThreadRead = useMutation(api.dms.markThreadRead);
  const sendMessage = useMutation(api.dms.sendMessage);
  const getOrCreateThread = useMutation(api.dms.getOrCreateThread);

  const otherIds = useMemo(
    () => (threads ?? []).map((t) => t.otherUser._id),
    [threads],
  );
  const presence = useQuery(
    api.presence.listStatus,
    otherIds.length > 0 ? { userIds: otherIds } : "skip",
  );

  const selected = (threads ?? []).find((t) => t._id === selectedThreadId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, selectedThreadId]);

  // mark the open thread read whenever it changes or new messages arrive
  useEffect(() => {
    if (selectedThreadId) void markThreadRead({ threadId: selectedThreadId });
  }, [selectedThreadId, messages?.length, markThreadRead]);

  // ---- new-message picker ----
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const results = useQuery(api.users.searchUsers, search.trim() ? { query: search } : "skip");

  const pickUser = async (userId: Id<"users">) => {
    setBusy(true);
    try {
      const threadId = await getOrCreateThread({ otherUserId: userId });
      setSelectedThreadId(threadId);
      setPickerOpen(false);
      setSearch("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open conversation.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!selectedThreadId || composer.trim().length === 0) return;
    try {
      await sendMessage({ threadId: selectedThreadId, text: composer });
      setComposer("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send message.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
          <p className="text-xs text-muted-foreground">Direct messages with teammates.</p>
        </div>
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          <PenSquare className="size-4" /> New message
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Thread list */}
        <aside className="rounded-2xl border border-border/80 bg-card/50 p-2 lg:h-[calc(100vh-11rem)] lg:overflow-y-auto">
          {threads === undefined ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : threads.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <MessageSquare className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium">No conversations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start one with a teammate to see it here.
              </p>
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t._id}
                type="button"
                onClick={() => setSelectedThreadId(t._id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                  t._id === selectedThreadId
                    ? "bg-primary/10"
                    : "hover:bg-muted/60",
                )}
              >
                <div className="relative shrink-0">
                  <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-sm font-semibold text-primary">
                    {t.otherUser.name.trim()[0]?.toUpperCase()}
                  </div>
                  <PresenceDot
                    status={presence?.[t.otherUser._id]?.status ?? "offline"}
                    className="absolute -bottom-0.5 -right-0.5"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{t.otherUser.name}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(t.lastMessageAt, { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {t.lastMessagePreview || "Say hi 👋"}
                    </p>
                    {t.unread > 0 && (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[9px] font-bold text-white">
                        {t.unread > 9 ? "9+" : t.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </aside>

        {/* Conversation */}
        <main className="flex h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/50">
          {selected ? (
            <>
              <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
                <div className="relative">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-xs font-semibold text-primary">
                    {selected.otherUser.name.trim()[0]?.toUpperCase()}
                  </div>
                  <PresenceDot
                    status={presence?.[selected.otherUser._id]?.status ?? "offline"}
                    className="absolute -bottom-0.5 -right-0.5"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selected.otherUser.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {selected.otherUser.email || "Direct message"}
                  </p>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages === undefined ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No messages yet. Say hi 👋
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = m.fromId !== selected.otherUser._id;
                    return (
                      <div key={m._id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-3.5 py-2",
                            mine
                              ? "rounded-br-sm bg-gradient-to-br from-indigo-500 to-violet-500 text-white"
                              : "rounded-bl-sm bg-muted/70",
                          )}
                        >
                          <p className="break-words text-sm">{m.text}</p>
                          <p
                            className={cn(
                              "mt-0.5 text-right text-[10px]",
                              mine ? "text-white/70" : "text-muted-foreground",
                            )}
                          >
                            {timeLabel(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                    placeholder={`Message ${selected.otherUser.name.split(" ")[0]}`}
                  />
                  <Button size="icon" onClick={() => void submit()} disabled={composer.trim().length === 0}>
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <MessageSquare className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-3 text-sm font-medium">Pick a conversation</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  …or start a new one with a teammate.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* New-message picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>Find a teammate by name or email.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {search.trim().length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Type at least one character to search.
              </p>
            ) : results === undefined ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No matches.</p>
            ) : (
              results.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => void pickUser(u._id)}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-xs font-semibold text-primary">
                    {(u.name ?? "?").trim()[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </div>
  );
}
