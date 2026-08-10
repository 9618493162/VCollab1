import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useCallRoom, type PeerQuality } from "@/hooks/use-call-room";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Captions,
  Check,
  Copy,
  Hand,
  LayoutGrid,
  Lock,
  LockOpen,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  PhoneOff,
  PictureInPicture2,
  Radio,
  Send,
  Signal,
  Sparkles,
  Square,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "👏", "🎉", "😮", "🙌"];

function extractCode(raw: string): string {
  const match = raw
    .toLowerCase()
    .match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/);
  return match?.[1] ?? "";
}

function useElapsed(start: number | null) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (start === null) return;
    const id = setInterval(
      () => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [start]);
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function VideoSurface({
  stream,
  className,
}: {
  stream: MediaStream | null;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
      <span className="text-4xl font-extralight text-neutral-400">{initial}</span>
    </div>
  );
}

function QualityDot({ quality }: { quality?: PeerQuality }) {
  if (!quality) return null;
  const color =
    quality === "good" ? "bg-emerald-400" : quality === "okay" ? "bg-amber-400" : "bg-red-400";
  return (
    <span
      title={`Network: ${quality}`}
      className={cn("size-1.5 rounded-full", color)}
    />
  );
}

export default function Call() {
  const { code: rawCode } = useParams();
  const code = extractCode(rawCode ?? "");
  const navigate = useNavigate();
  const { user, signOut, isAuthenticated } = useAuth();
  const isHost = useQuery(api.meetings.isHost, code ? { code } : "skip");
  const room = useQuery(api.rooms.getRoom, code ? { code } : "skip");

  const [displayName, setDisplayName] = useState(
    user?.name?.split(" ")[0] ?? "You",
  );
  const [entered, setEntered] = useState(false);
  const [panel, setPanel] = useState<"none" | "chat" | "people">("none");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"gallery" | "speaker" | "focus">("gallery");
  const [showReactions, setShowReactions] = useState(false);
  const [burst, setBurst] = useState<{ id: number; emoji: string; name: string }[]>([]);
  const [selfPos, setSelfPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const [selfMinimized, setSelfMinimized] = useState(false);
  const [selfSize, setSelfSize] = useState<{ w: number; h: number }>({ w: 208, h: 117 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const burstId = useRef(0);

  const call = useCallRoom(code, displayName);
  const lockMeeting = useMutation(api.meetings.lockMeeting);
  const endMeeting = useMutation(api.meetings.endMeeting);

  const elapsed = useElapsed(call.joinedAt);
  const isMissing = room !== undefined && room === null;
  const isChecking = room === undefined;

  // reaction bursts (ours + anyone else's in the room)
  useEffect(() => {
    if (!call.reactions) return;
    for (const r of call.reactions) {
      burstId.current += 1;
      const id = burstId.current;
      setBurst((prev) => [...prev.slice(-14), { id, emoji: r.emoji, name: r.name }]);
      window.setTimeout(() => {
        setBurst((prev) => prev.filter((b) => b.id !== id));
      }, 2600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.reactions?.length]);

  // kicked / ended by host → leave the room
  useEffect(() => {
    if (call.kicked) {
      toast.error("You were removed from the meeting by the host.");
      navigate(isAuthenticated ? "/dashboard" : "/", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.kicked]);

  useEffect(() => {
    if (call.endedByHost) {
      toast.info("The host ended the meeting.");
      navigate(isAuthenticated ? "/dashboard" : "/", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.endedByHost]);

  useEffect(() => {
    if (call.recordingError) {
      toast.warning(call.recordingError);
    }
  }, [call.recordingError]);

  const handleJoin = () => {
    if (!displayName.trim()) {
      toast.error("Tell people your name first.");
      return;
    }
    void call.join();
    setEntered(true);
  };

  const handleLeave = async () => {
    await call.leave();
    navigate(isAuthenticated ? "/dashboard" : "/");
  };

  const handleCopy = async () => {
    const url = `${window.location.origin}/call/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const handleEndForAll = async () => {
    try {
      await endMeeting({ code });
      await call.leave();
      navigate("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't end the meeting.");
    }
  };

  const handleLock = async (locked: boolean) => {
    try {
      await lockMeeting({ code, locked });
      toast.success(locked ? "Meeting locked." : "Meeting unlocked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't lock the meeting.");
    }
  };

  const participantCount = call.participants?.length ?? (entered ? 1 : 0);
  const selfStream = call.sharing ? call.shareStream : call.localStream;

  // view-mode helpers
  const remoteIds = useMemo(() => Object.keys(call.remoteStreams), [call.remoteStreams]);
  const activeSpeakerId = useMemo(
    () => remoteIds.find((id) => call.speaking[id]) ?? remoteIds[0],
    [remoteIds, call.speaking],
  );

  const fireBurst = (emoji: string) => {
    call.fireReaction(emoji);
    setShowReactions(false);
  };

  // floating self-view drag
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: selfPos.x,
      origY: selfPos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setSelfPos({
      x: dragRef.current.origX + e.clientX - dragRef.current.startX,
      y: dragRef.current.origY + e.clientY - dragRef.current.startY,
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (!code) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">That meeting code is invalid.</p>
          <Button asChild variant="outline" className="mt-6 rounded-full">
            <Link to="/dashboard">Back to meetings</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-neutral-950 text-white">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/4 size-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 size-[400px] rounded-full bg-fuchsia-600/10 blur-[120px]" />

      {entered && (
        <>
          {/* ---------- top bar ---------- */}
          <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="font-display text-[15px] font-bold tracking-tight"
              >
                V<span className="text-gradient">Collab</span>
              </button>
              <span className="hidden text-xs tabular-nums text-neutral-400 sm:block">
                {elapsed}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* view mode toggle */}
              <div className="hidden items-center rounded-full border border-white/10 bg-white/5 p-0.5 md:flex">
                {(
                  [
                    { id: "gallery", icon: LayoutGrid, label: "Gallery" },
                    { id: "speaker", icon: MonitorUp, label: "Speaker" },
                    { id: "focus", icon: Maximize2, label: "Focus" },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setView(v.id)}
                    title={v.label}
                    aria-label={v.label}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full transition-colors",
                      view === v.id ? "bg-white/15 text-white" : "text-neutral-400 hover:text-white",
                    )}
                  >
                    <v.icon className="size-4" />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/10"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span className="font-mono tracking-tight">{code}</span>
              </button>

              <button
                type="button"
                onClick={() => setPanel((p) => (p === "people" ? "none" : "people"))}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                  panel === "people"
                    ? "bg-white/15 text-white"
                    : "text-neutral-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Users className="size-3.5" />
                <span className="tabular-nums">{participantCount}</span>
                {call.participants?.some((p) => p.handRaised && p.clientId !== call.clientId) && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px]">
                    ✋
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* ---------- stage ---------- */}
          <main className="relative z-10 flex-1 overflow-hidden p-3 sm:p-4">
            {isMissing ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-sm text-neutral-400">This meeting doesn't exist (yet).</p>
                <Button
                  variant="outline"
                  className="mt-6 rounded-full border-white/20 text-white hover:bg-white/5"
                  onClick={() => navigate("/dashboard")}
                >
                  Back to meetings
                </Button>
              </div>
            ) : view === "focus" && activeSpeakerId ? (
              <Tile
                peerId={activeSpeakerId}
                stream={call.remoteStreams[activeSpeakerId]}
                name={call.names[activeSpeakerId] ?? "Guest"}
                trackState={call.remoteTrackStates[activeSpeakerId]}
                speaking={call.speaking[activeSpeakerId]}
                quality={call.quality[activeSpeakerId]}
                presenting={call.participants?.find((p) => p.clientId === activeSpeakerId)?.sharing}
                large
              />
            ) : (
              <div
                className={cn(
                  "grid h-full w-full content-center gap-3 sm:gap-4",
                  view === "speaker" && activeSpeakerId
                    ? "grid-cols-1 lg:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                )}
              >
                {/* self tile (gallery) */}
                {view === "gallery" && (
                  <SelfTile
                    stream={selfStream}
                    name={displayName}
                    micOn={call.micOn}
                    sharing={call.sharing}
                  />
                )}

                {/* remote tiles */}
                {Object.entries(call.remoteStreams).map(([peerId, stream]) => {
                  const isActive = view === "speaker" && peerId === activeSpeakerId;
                  return (
                    <div
                      key={peerId}
                      className={cn(isActive && view === "speaker" && "lg:col-span-2")}
                    >
                      <Tile
                        peerId={peerId}
                        stream={stream}
                        name={call.names[peerId] ?? "Guest"}
                        trackState={call.remoteTrackStates[peerId]}
                        speaking={call.speaking[peerId]}
                        quality={call.quality[peerId]}
                        presenting={call.participants?.find((p) => p.clientId === peerId)?.sharing}
                      />
                    </div>
                  );
                })}

                {/* present but not connected yet */}
                {call.participants
                  ?.filter(
                    (p) =>
                      p.clientId !== call.clientId &&
                      !(p.clientId in call.remoteStreams),
                  )
                  .map((p) => (
                    <div
                      key={p.clientId}
                      className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10"
                    >
                      <Avatar name={p.name} />
                      <span className="absolute bottom-2.5 left-3 rounded-lg bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                        {p.name} · joining…
                      </span>
                    </div>
                  ))}

                {Object.keys(call.remoteStreams).length === 0 &&
                  call.participants?.length === 1 && (
                    <div className="col-span-full flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                      <p className="text-lg font-extralight text-neutral-300">
                        You're the first one here.
                      </p>
                      <p className="mt-2 max-w-sm text-sm text-neutral-500">
                        Share the code to bring people in. Open the link in
                        another tab to test the call.
                      </p>
                    </div>
                  )}
              </div>
            )}

            {/* floating self view (speaker / focus) */}
            {entered && view !== "gallery" && (
              <div
                className="absolute z-20"
                style={{ left: selfPos.x, top: selfPos.y, width: selfSize.w }}
              >
                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className={cn(
                    "group overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/15 shadow-2xl",
                    selfMinimized ? "h-12 cursor-pointer" : "cursor-grab active:cursor-grabbing",
                  )}
                  style={{ height: selfMinimized ? undefined : selfSize.h }}
                  onClick={() => selfMinimized && setSelfMinimized(false)}
                >
                  {!selfMinimized ? (
                    <>
                      <div className="relative aspect-video">
                        {selfStream ? (
                          <VideoSurface stream={selfStream} />
                        ) : (
                          <Avatar name={displayName} />
                        )}
                        <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-0.5 text-[11px] backdrop-blur-sm">
                          {call.sharing ? "Presenting" : displayName}
                          {!call.micOn && <MicOff className="size-3 text-red-400" />}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelfMinimized(true);
                        }}
                        className="absolute right-1.5 top-1.5 hidden size-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm group-hover:flex"
                        aria-label="Minimize self view"
                      >
                        <Minimize2 className="size-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="flex h-12 items-center gap-2 px-3 text-xs text-neutral-300">
                      <PictureInPicture2 className="size-4" />
                      {displayName}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* reactions burst */}
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
              <AnimatePresence>
                {burst.map((b) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 40, scale: 0.6 }}
                    animate={{ opacity: 1, y: -40, scale: 1.15 }}
                    exit={{ opacity: 0, y: -140, scale: 1.4 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    className="absolute text-5xl drop-shadow-lg"
                  >
                    {b.emoji}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* captions */}
            {call.captionsEnabled && (
              <div className="absolute inset-x-0 bottom-3 z-20 mx-auto flex max-w-2xl flex-col items-center gap-1 px-4">
                {call.captions.slice(-3).map((line, i) => (
                  <span
                    key={i}
                    className="rounded-lg bg-black/60 px-3 py-1 text-sm text-white backdrop-blur-sm"
                  >
                    {line}
                  </span>
                ))}
                {call.interimCaption && (
                  <span className="rounded-lg bg-black/40 px-3 py-1 text-sm text-white/70 backdrop-blur-sm">
                    {call.interimCaption}
                  </span>
                )}
              </div>
            )}
            {call.captionError && (
              <p className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-amber-500/20 px-3 py-1 text-xs text-amber-200 backdrop-blur-sm">
                {call.captionError}
              </p>
            )}
          </main>

          {/* ---------- control bar ---------- */}
          <footer className="relative z-10 flex h-20 shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-black/30 px-3 backdrop-blur-md sm:gap-2.5">
            <ControlButton
              active={call.micOn}
              activeClass="bg-white text-black"
              inactiveClass="bg-red-500/90 text-white hover:bg-red-500"
              onClick={call.toggleMic}
              label={call.micOn ? "Turn off mic" : "Turn on mic"}
            >
              {call.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </ControlButton>

            <ControlButton
              active={call.camOn}
              activeClass="bg-white text-black"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={call.toggleCam}
              label={call.camOn ? "Turn off camera" : "Turn on camera"}
            >
              {call.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </ControlButton>

            <ControlButton
              active={call.sharing}
              activeClass="bg-white text-black"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={() => void call.toggleShare()}
              label={call.sharing ? "Stop presenting" : "Present screen"}
            >
              <MonitorUp className="size-5" />
            </ControlButton>

            <ControlButton
              active={call.handRaised}
              activeClass="bg-amber-400 text-black"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={call.toggleHand}
              label={call.handRaised ? "Lower hand" : "Raise hand"}
            >
              <Hand className={cn("size-5", call.handRaised && "animate-bounce")} />
            </ControlButton>

            {/* reactions */}
            <div className="relative">
              <ControlButton
                active={showReactions}
                activeClass="bg-white text-black"
                inactiveClass="bg-white/10 text-white hover:bg-white/20"
                onClick={() => setShowReactions((v) => !v)}
                label="Reactions"
              >
                <Sparkles className="size-5" />
              </ControlButton>
              {showReactions && (
                <div className="absolute bottom-14 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-neutral-900/95 p-2 shadow-2xl backdrop-blur-md">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => fireBurst(emoji)}
                      className="flex size-9 items-center justify-center rounded-xl text-xl transition-all hover:scale-125 hover:bg-white/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* captions */}
            <ControlButton
              active={call.captionsEnabled}
              activeClass="bg-white text-black"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={call.toggleCaptions}
              label="Live captions"
            >
              <Captions className="size-5" />
            </ControlButton>

            {/* recording */}
            <ControlButton
              active={call.recording}
              activeClass="bg-red-500 text-white animate-pulse"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={() =>
                call.recording ? call.stopRecording() : void call.startRecording()
              }
              label={call.recording ? "Stop recording" : "Record meeting"}
            >
              {call.recording ? (
                <Square className="size-4" />
              ) : (
                <Radio className="size-5" />
              )}
            </ControlButton>

            <ControlButton
              active={panel === "chat"}
              activeClass="bg-white text-black"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={() => setPanel((p) => (p === "chat" ? "none" : "chat"))}
              label="Chat"
            >
              <MessageSquare className="size-5" />
            </ControlButton>

            {isHost && (
              <div className="ml-1 flex items-center gap-1.5 border-l border-white/10 pl-2">
                <ControlButton
                  active={room?.locked === true}
                  activeClass="bg-white text-black"
                  inactiveClass="bg-white/10 text-white hover:bg-white/20"
                  onClick={() => void handleLock(room?.locked !== true)}
                  label={room?.locked ? "Unlock meeting" : "Lock meeting"}
                >
                  {room?.locked ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
                </ControlButton>
                <Button
                  onClick={() => void handleEndForAll()}
                  className="h-12 w-12 rounded-full bg-red-500 p-0 text-white hover:bg-red-600"
                  aria-label="End meeting for everyone"
                  title="End for everyone"
                >
                  <PhoneOff className="size-5" />
                </Button>
              </div>
            )}

            {!isHost && (
              <Button
                onClick={handleLeave}
                className="ml-1 h-12 w-12 rounded-full bg-red-500 p-0 text-white hover:bg-red-600"
                aria-label="Leave meeting"
              >
                <PhoneOff className="size-5" />
              </Button>
            )}
          </footer>

          {/* ---------- side panels ---------- */}
          {panel === "chat" && (
            <ChatPanel
              code={code}
              call={call}
              onClose={() => setPanel("none")}
            />
          )}
          {panel === "people" && (
            <PeoplePanel
              code={code}
              call={call}
              isHost={isHost === true}
              onClose={() => setPanel("none")}
            />
          )}
        </>
      )}

      {/* ---------- PRE-JOIN ---------- */}
      {!entered && (
        <div className="relative z-10 flex h-full items-center justify-center overflow-y-auto bg-neutral-950 p-6">
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="font-display text-lg font-bold tracking-tight"
              >
                V<span className="text-gradient">Collab</span>
              </button>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => void signOut().then(() => navigate("/"))}
                  className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-white"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              ) : (
                <Link
                  to={`/auth?returnTo=/call/${code}`}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-white/5"
                >
                  Sign in to keep meetings
                </Link>
              )}
            </div>

            <p className="mt-10 text-[11px] font-medium uppercase tracking-[0.3em] text-neutral-500">
              Ready to join?
            </p>
            <p className="mt-2 font-mono text-sm tracking-tight text-neutral-300">{code}</p>

            <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10">
              {call.localStream ? (
                <VideoSurface stream={call.localStream} />
              ) : (
                <Avatar name={displayName} />
              )}
              <div className="absolute bottom-2.5 left-3 rounded-lg bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                {displayName}
              </div>
            </div>

            {call.mediaError && (
              <p className="mt-3 text-xs text-amber-400/90">
                {call.mediaError} You can still join to listen and chat.
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={call.toggleMic}
                  aria-label={call.micOn ? "Turn off mic" : "Turn on mic"}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full transition-colors",
                    call.micOn
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-red-500/90 text-white hover:bg-red-500",
                  )}
                >
                  {call.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                </button>
                <button
                  type="button"
                  onClick={call.toggleCam}
                  aria-label={call.camOn ? "Turn off camera" : "Turn on camera"}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full transition-colors",
                    call.camOn
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-red-500/90 text-white hover:bg-red-500",
                  )}
                >
                  {call.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
                </button>
              </div>

              <Button
                onClick={handleJoin}
                disabled={isChecking || isMissing}
                className="h-11 rounded-full px-8 btn-glow"
              >
                Join now
              </Button>
            </div>

            <label className="mt-7 block text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-500">
              Your name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should people see you?"
              maxLength={40}
              className="mt-2 h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-neutral-500"
            />

            <div className="mt-8 border-t border-white/10 pt-6 text-center">
              <p className="text-xs text-neutral-500">
                Peer-to-peer · nothing you say is recorded unless you record it
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- tiles ---------------- */

function SelfTile({
  stream,
  name,
  micOn,
  sharing,
}: {
  stream: MediaStream | null;
  name: string;
  micOn: boolean;
  sharing: boolean;
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10">
      {stream ? <VideoSurface stream={stream} /> : <Avatar name={name} />}
      <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
        <span className="rounded-lg bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
          {name} {sharing ? "· presenting" : "(you)"}
        </span>
        {!micOn && (
          <span className="rounded-lg bg-red-500/80 p-1 backdrop-blur-sm">
            <MicOff className="size-3" />
          </span>
        )}
      </div>
    </div>
  );
}

function Tile({
  peerId,
  stream,
  name,
  trackState,
  speaking,
  quality,
  presenting,
  large,
}: {
  peerId: string;
  stream: MediaStream;
  name: string;
  trackState?: { audio: boolean; video: boolean };
  speaking?: boolean;
  quality?: PeerQuality;
  presenting?: boolean;
  large?: boolean;
}) {
  const camOff = trackState ? !trackState.video : false;
  const micOff = trackState ? !trackState.audio : false;
  return (
    <div
      key={peerId}
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900 transition-shadow",
        speaking ? "ring-2 ring-primary speaking-ring" : "ring-1 ring-white/10",
      )}
    >
      {camOff ? (
        <Avatar name={name} />
      ) : (
        <VideoSurface stream={stream} />
      )}
      <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5">
        <span className="rounded-lg bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
          {name}
        </span>
        {presenting && (
          <span className="flex items-center gap-1 rounded-lg bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
            <MonitorUp className="size-3" /> presenting
          </span>
        )}
        {micOff && (
          <span className="rounded-lg bg-black/50 p-1 backdrop-blur-sm">
            <MicOff className="size-3" />
          </span>
        )}
      </div>
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
        <QualityDot quality={quality} />
        {speaking && (
          <span className="flex items-center gap-1 rounded-full bg-primary/80 px-2 py-0.5 text-[10px] font-medium text-white">
            <Signal className="size-2.5" /> speaking
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- control button ---------------- */

function ControlButton({
  children,
  onClick,
  label,
  active,
  activeClass,
  inactiveClass,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active: boolean;
  activeClass: string;
  inactiveClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-12 items-center justify-center rounded-full transition-all hover:scale-105",
        active ? activeClass : inactiveClass,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- chat panel ---------------- */

function ChatPanel({
  code,
  call,
  onClose,
}: {
  code: string;
  call: ReturnType<typeof useCallRoom>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [call.messages?.length]);

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-white/10 bg-neutral-900/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <p className="text-sm font-medium">Chat</p>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 transition-colors hover:text-white"
          aria-label="Close chat"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {call.messages?.length === 0 && (
          <p className="pt-8 text-center text-sm text-neutral-500">
            No messages yet. Say hi.
          </p>
        )}
        {call.messages?.map((msg) => (
          <div key={msg._id}>
            <p className="text-xs text-neutral-400">
              <span className="font-medium text-neutral-200">{msg.name}</span> ·{" "}
              {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <p className="mt-0.5 text-sm text-neutral-100">{msg.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex shrink-0 gap-2 border-t border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void call.postMessage(draft);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a message"
          className="h-10 flex-1 rounded-full border-white/10 bg-white/5 text-sm text-white placeholder:text-neutral-500"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full border-white/10 text-white hover:bg-white/10"
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </aside>
  );
}

/* ---------------- people panel ---------------- */

function PeoplePanel({
  code,
  call,
  isHost,
  onClose,
}: {
  code: string;
  call: ReturnType<typeof useCallRoom>;
  isHost: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const kick = useMutation(api.call.kickParticipant);
  const mute = useMutation(api.call.muteParticipant);
  const lowered = useMutation(api.call.setHandRaised);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = call.participants ?? [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  }, [call.participants, search]);

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-white/10 bg-neutral-900/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <p className="text-sm font-medium">
          People{" "}
          <span className="ml-1 text-xs text-neutral-500 tabular-nums">
            {call.participants?.length ?? 0}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 transition-colors hover:text-white"
          aria-label="Close people panel"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="border-b border-white/10 p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search participants…"
          className="h-9 rounded-full border-white/10 bg-white/5 text-sm text-white placeholder:text-neutral-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {list.length === 0 && (
          <p className="pt-8 text-center text-sm text-neutral-500">
            {search ? "No matches." : "Nobody else here yet."}
          </p>
        )}
        {list.map((p) => {
          const self = p.clientId === call.clientId;
          const speaking = call.speaking[p.clientId];
          const trackState = call.remoteTrackStates[p.clientId];
          return (
            <div
              key={p.clientId}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors",
                speaking ? "bg-primary/15" : "hover:bg-white/5",
              )}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  speaking
                    ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white"
                    : "bg-white/10 text-white",
                )}
              >
                {(p.name[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {p.name}
                  {self && <span className="ml-1.5 text-xs text-neutral-500">(you)</span>}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-neutral-500">
                  {p.handRaised && (
                    <span className="flex items-center gap-0.5 text-amber-400">
                      <Hand className="size-3" /> hand raised
                    </span>
                  )}
                  {trackState && !trackState.audio && (
                    <span className="flex items-center gap-0.5">
                      <MicOff className="size-3" /> muted
                    </span>
                  )}
                  {trackState && !trackState.video && (
                    <span className="flex items-center gap-0.5">
                      <VideoOff className="size-3" /> camera off
                    </span>
                  )}
                  {p.sharing && (
                    <span className="flex items-center gap-0.5">
                      <MonitorUp className="size-3" /> presenting
                    </span>
                  )}
                  {!trackState && !p.handRaised && !p.sharing && "in call"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <QualityDot quality={call.quality[p.clientId]} />
                {isHost && !self && (
                  <>
                    <button
                      type="button"
                      onClick={() => void mute({ code, target: p.clientId })}
                      title="Mute"
                      aria-label="Mute participant"
                      className="flex size-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <MicOff className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void kick({ code, target: p.clientId })}
                      title="Remove from meeting"
                      aria-label="Remove participant"
                      className="flex size-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                    >
                      <X className="size-3.5" />
                    </button>
                    {p.handRaised && (
                      <button
                        type="button"
                        onClick={() => void lowered({ code, clientId: p.clientId, raised: false })}
                        title="Lower hand"
                        aria-label="Lower hand"
                        className="flex size-7 items-center justify-center rounded-full text-amber-400 transition-colors hover:bg-amber-500/20"
                      >
                        <Hand className="size-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isHost && (
        <div className="border-t border-white/10 p-3 text-center">
          <p className="text-[11px] text-neutral-500">
            You're the host — you can mute or remove anyone.
          </p>
        </div>
      )}
    </aside>
  );
}
