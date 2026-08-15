import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  DoorOpen,
  LogOut,
  Plus,
  Send,
  Timer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BreakoutsPanel({
  code,
  isHost,
  clientId,
  name,
  onClose,
}: {
  code: string;
  isHost: boolean;
  clientId: string;
  name: string;
  onClose: () => void;
}) {
  const data = useQuery(api.breakouts.listBreakouts, { code });
  const createBreakout = useMutation(api.breakouts.createBreakout);
  const deleteBreakout = useMutation(api.breakouts.deleteBreakout);
  const joinBreakout = useMutation(api.breakouts.joinBreakout);
  const leaveBreakout = useMutation(api.breakouts.leaveBreakout);
  const assignToBreakout = useMutation(api.breakouts.assignToBreakout);
  const setBreakoutTimer = useMutation(api.breakouts.setBreakoutTimer);
  const clearBreakoutTimer = useMutation(api.breakouts.clearBreakoutTimer);
  const endBreakoutSession = useMutation(api.breakouts.endBreakoutSession);
  const sendBreakoutMessage = useMutation(api.breakouts.sendBreakoutMessage);

  const session = data?.session ?? null;
  const rooms = useMemo(() => data?.rooms ?? [], [data?.rooms]);
  const participants = useMemo(() => data?.participants ?? [], [data?.participants]);

  const myRoomId = useMemo(
    () => participants.find((p) => p.clientId === clientId)?.roomId ?? null,
    [participants, clientId],
  );

  const [timerMinutes, setTimerMinutes] = useState("10");
  const [expandedRoom, setExpandedRoom] = useState<Id<"breakoutRooms"> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // ticking clock for the countdown
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session?.timerEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.timerEndsAt]);

  const remaining = session?.timerEndsAt ? session.timerEndsAt - now : 0;
  const timerRunning = session?.active === true && session.timerEndsAt !== undefined && remaining > 0;

  const roomMessages = useQuery(
    api.breakouts.listBreakoutMessages,
    expandedRoom ? { code, roomId: expandedRoom } : "skip",
  );

  const assign = (roomId: Id<"breakoutRooms"> | null, participant: { clientId: string; name: string }) => {
    const call = roomId
      ? assignToBreakout({ code, roomId, clientId: participant.clientId, name: participant.name })
      : leaveBreakout({ code, clientId: participant.clientId });
    void call.catch((error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't update the room."),
    );
  };

  const sendRoomMessage = async (roomId: Id<"breakoutRooms">) => {
    const text = drafts[roomId] ?? "";
    if (text.trim().length === 0) return;
    try {
      await sendBreakoutMessage({ code, roomId, clientId, name, text });
      setDrafts((d) => ({ ...d, [roomId]: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the message.");
    }
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-border/60 bg-background/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" /> Breakouts
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close breakouts"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {session === null ? (
          <div className="rounded-xl border border-border/60 bg-muted/50 p-4 text-center">
            <Users className="mx-auto size-6 text-muted-foreground/70" />
            <p className="mt-2 text-sm text-muted-foreground">
              {isHost ? "Split the call into smaller groups." : "Breakout rooms aren't running."}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              {isHost
                ? "Create a room to start a breakout session."
                : "The host can start one at any time."}
            </p>
            {isHost && (
              <Button
                size="sm"
                onClick={() =>
                  void createBreakout({ code }).catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Couldn't start breakouts."),
                  )
                }
                className="mt-3 rounded-full"
              >
                Start breakout rooms
              </Button>
            )}
          </div>
        ) : session.active ? (
          <>
            {/* timer */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <Timer className="size-3.5 text-muted-foreground" />
                {timerRunning ? (
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {formatCountdown(remaining)}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/70">
                    {session.timerEndsAt ? "Timer done" : "No timer"}
                  </span>
                )}
              </div>
              {isHost && (
                <div className="flex items-center gap-1">
                  <input
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="min"
                    aria-label="Timer minutes"
                    className="h-7 w-11 rounded-md border border-border/60 bg-muted/50 px-1.5 text-center text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
                  />
                  {timerRunning || session.timerEndsAt ? (
                    <button
                      type="button"
                      onClick={() => void clearBreakoutTimer({ code })}
                      className="h-7 rounded-md px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Clear
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const m = Number(timerMinutes);
                        if (m < 1 || m > 120) {
                          toast.error("Pick between 1 and 120 minutes.");
                          return;
                        }
                        void setBreakoutTimer({ code, minutes: m }).catch((error) =>
                          toast.error(error instanceof Error ? error.message : "Couldn't start the timer."),
                        );
                      }}
                      className="h-7 rounded-md px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Start
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* rooms */}
            <div className="space-y-2">
              {isHost && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void createBreakout({ code }).catch((error) =>
                      toast.error(error instanceof Error ? error.message : "Couldn't add a room."),
                    )
                  }
                  className="w-full rounded-full border-border/60 text-foreground hover:bg-muted"
                >
                  <Plus className="size-3.5" /> Add room
                </Button>
              )}

              {rooms.length === 0 ? (
                <p className="pt-4 text-center text-xs text-muted-foreground/70">
                  No rooms yet — add one to get going.
                </p>
              ) : (
                rooms.map((room) => {
                  const inRoom = myRoomId === room._id;
                  const expanded = expandedRoom === room._id;
                  return (
                    <div
                      key={room._id}
                      className={cn(
                        "rounded-xl border bg-muted/50",
                        inRoom ? "border-indigo-400/50" : "border-border/60",
                      )}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setExpandedRoom(expanded ? null : room._id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                              expanded ? "rotate-180" : "-rotate-90",
                            )}
                          />
                          <span className="truncate text-sm font-medium text-foreground">{room.name}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                            {room.members.length}
                          </span>
                        </button>
                        {inRoom ? (
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">
                            <DoorOpen className="size-3" /> Here
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void joinBreakout({ code, roomId: room._id, clientId, name }).catch(
                                (error) =>
                                  toast.error(error instanceof Error ? error.message : "Couldn't join."),
                              )
                            }
                            className="shrink-0 rounded-full border border-border/70 px-2.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-muted"
                          >
                            Join
                          </button>
                        )}
                        {isHost && (
                          <button
                            type="button"
                            onClick={() =>
                              void deleteBreakout({ code, roomId: room._id }).catch((error) =>
                                toast.error(error instanceof Error ? error.message : "Couldn't delete."),
                              )
                            }
                            aria-label={`Delete ${room.name}`}
                            className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-red-500/20 hover:text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>

                      {room.members.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-3 pb-2.5">
                          {room.members.map((m) => (
                            <span
                              key={m.clientId}
                              className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
                              title={m.name}
                            >
                              {m.name.trim()[0]?.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      )}

                      {expanded && (
                        <div className="border-t border-border/60 px-3 py-2.5">
                          <div className="max-h-36 space-y-1.5 overflow-y-auto">
                            {roomMessages === undefined ? (
                              <p className="text-[11px] text-muted-foreground/70">Loading…</p>
                            ) : roomMessages.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground/70">No messages yet.</p>
                            ) : (
                              roomMessages.map((m) => (
                                <div key={m._id} className="text-[11px]">
                                  <span className="font-medium text-muted-foreground">{m.name}: </span>
                                  <span className="text-muted-foreground">{m.text}</span>
                                </div>
                              ))
                            )}
                          </div>
                          {(inRoom || isHost) && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <Input
                                value={drafts[room._id] ?? ""}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [room._id]: e.target.value }))
                                }
                                onKeyDown={(e) => e.key === "Enter" && void sendRoomMessage(room._id)}
                                placeholder="Message this room…"
                                className="h-8 border-border/60 bg-muted/50 text-xs text-foreground placeholder:text-muted-foreground/70"
                              />
                              <button
                                type="button"
                                onClick={() => void sendRoomMessage(room._id)}
                                aria-label="Send room message"
                                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <Send className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* host: assign participants */}
            {isHost && participants.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-muted/50 p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Participants
                </p>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {participants.map((p) => (
                    <div key={p.clientId} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
                      <Select
                        value={p.roomId ?? "main"}
                        onValueChange={(roomId) => assign(roomId === "main" ? null : (roomId as Id<"breakoutRooms">), p)}
                      >
                        <SelectTrigger className="h-7 w-28 border-border/60 bg-muted/50 px-2 text-[10px] text-muted-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="main" className="text-xs">
                            Main meeting
                          </SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room._id} value={room._id} className="text-xs">
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* self: return to main */}
            {!isHost && myRoomId !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void leaveBreakout({ code, clientId }).catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Couldn't return to the main meeting."),
                  )
                }
                className="w-full rounded-full border-border/60 text-foreground hover:bg-muted"
              >
                <LogOut className="size-3.5" /> Return to main meeting
              </Button>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">Breakout rooms have ended.</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Everyone is back in the main meeting.
            </p>
          </div>
        )}
      </div>

      {isHost && session?.active === true && (
        <div className="border-t border-border/60 p-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void endBreakoutSession({ code }).catch((error) =>
                toast.error(error instanceof Error ? error.message : "Couldn't end breakouts."),
              )
            }
            className="w-full rounded-full border-red-500/40 text-red-600 dark:text-red-300 hover:bg-red-500/15 hover:text-red-600 dark:text-red-300"
          >
            <LogOut className="size-3.5" /> End breakout session
          </Button>
        </div>
      )}
    </aside>
  );
}
