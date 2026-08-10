import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useCallRoom } from "@/hooks/use-call-room";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "convex/react";
import {
  Check,
  Copy,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Send,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
    <div className="flex h-full w-full items-center justify-center bg-neutral-800">
      <span className="text-4xl font-extralight text-neutral-400">
        {initial}
      </span>
    </div>
  );
}

export default function Call() {
  const { code: rawCode } = useParams();
  const code = extractCode(rawCode ?? "");
  const navigate = useNavigate();
  const { user, signOut, isAuthenticated } = useAuth();

  const [displayName, setDisplayName] = useState(
    user?.name?.split(" ")[0] ?? "You",
  );
  const [entered, setEntered] = useState(false);
  const [panel, setPanel] = useState<"none" | "chat" | "people">("none");
  const [copied, setCopied] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const room = useQuery(api.rooms.getRoom, code ? { code } : "skip");
  const call = useCallRoom(code, displayName);

  const elapsed = useElapsed(call.joinedAt);
  const isMissing = room !== undefined && room === null;
  const isChecking = room === undefined;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [call.messages?.length]);

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

  const sendChat = () => {
    void call.postMessage(chatDraft);
    setChatDraft("");
  };

  // participants includes our own presence row once joined
  const participantCount = call.participants?.length ?? (entered ? 1 : 0);
  const isSharing = call.sharing;
  const selfStream = isSharing ? call.shareStream : call.localStream;

  if (!code) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <p className="text-sm text-muted-foreground">That meeting code is invalid.</p>
          <Button asChild variant="outline" className="mt-6 rounded-full">
            <Link to="/dashboard">Back to meetings</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-white">
      {/* ---------- IN CALL ---------- */}
      {entered && (
        <>
          {/* Top bar */}
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-[15px] font-semibold tracking-tight text-white"
            >
              hiiiiii<span className="text-neutral-500">.</span>
            </button>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs tabular-nums text-neutral-400 sm:block">
                {elapsed}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/5"
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span className="font-mono tracking-tight">{code}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setPanel((p) => (p === "people" ? "none" : "people"))
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                  panel === "people"
                    ? "bg-white/15 text-white"
                    : "text-neutral-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Users className="size-3.5" />
                <span className="tabular-nums">{participantCount}</span>
              </button>
            </div>
          </header>

          {/* Stage */}
          <main className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
            {isMissing && (
              <div className="text-center">
                <p className="text-sm text-neutral-400">
                  This meeting doesn't exist (yet).
                </p>
                <Button
                  variant="outline"
                  className="mt-6 rounded-full border-white/20 text-white hover:bg-white/5"
                  onClick={() => navigate("/dashboard")}
                >
                  Back to meetings
                </Button>
              </div>
            )}

            {!isMissing && (
              <div className="grid h-full w-full grid-cols-1 content-center gap-3 sm:gap-4 md:grid-cols-2">
                {/* self tile */}
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10">
                  {selfStream ? (
                    <VideoSurface stream={selfStream} />
                  ) : (
                    <Avatar name={displayName} />
                  )}
                  <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
                    <span className="rounded-md bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                      {displayName} {isSharing ? "· presenting" : "(you)"}
                    </span>
                    {!call.micOn && (
                      <span className="rounded-md bg-black/50 p-1 backdrop-blur-sm">
                        <MicOff className="size-3" />
                      </span>
                    )}
                  </div>
                </div>

                {/* remote tiles */}
                {Object.entries(call.remoteStreams).map(([peerId, stream]) => {
                  const presenting = call.participants?.find(
                    (p) => p.clientId === peerId,
                  )?.sharing;
                  return (
                    <div
                      key={peerId}
                      className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10"
                    >
                      <VideoSurface stream={stream} />
                      <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
                        <span className="rounded-md bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                          {call.names[peerId] ?? "Guest"}
                        </span>
                        {presenting && (
                          <span className="flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                            <MonitorUp className="size-3" />
                            presenting
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* peers present in the room but not connected yet */}
                {call.participants
                  ?.filter(
                    (p) =>
                      p.clientId !== call.clientId &&
                      !(p.clientId in call.remoteStreams),
                  )
                  .map((p) => (
                    <div
                      key={p.clientId}
                      className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10"
                    >
                      <Avatar name={p.name} />
                      <div className="absolute bottom-2.5 left-3 rounded-md bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                        {p.name} · joining…
                      </div>
                    </div>
                  ))}

                {!isMissing &&
                  Object.keys(call.remoteStreams).length === 0 &&
                  call.participants &&
                  call.participants.length === 1 && (
                    <div className="col-span-full flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                      <p className="text-lg font-extralight text-neutral-300">
                        You're the first one here.
                      </p>
                      <p className="mt-2 max-w-sm text-sm text-neutral-500">
                        Share the code to bring people in. This is a
                        peer-to-peer call — open the link in another tab to
                        test it.
                      </p>
                    </div>
                  )}
              </div>
            )}
          </main>

          {/* Control bar */}
          <footer className="flex h-24 shrink-0 items-center justify-center gap-2 border-t border-white/10 px-4 sm:gap-3">
            <ControlButton
              active={call.micOn}
              activeClass="bg-white text-black"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={call.toggleMic}
              label={call.micOn ? "Turn off mic" : "Turn on mic"}
            >
              {call.micOn ? (
                <Mic className="size-5" />
              ) : (
                <MicOff className="size-5" />
              )}
            </ControlButton>

            <ControlButton
              active={call.camOn}
              activeClass="bg-white text-black"
              inactiveClass="bg-red-500/90 text-white hover:bg-red-500"
              onClick={call.toggleCam}
              label={call.camOn ? "Turn off camera" : "Turn on camera"}
            >
              {call.camOn ? (
                <Video className="size-5" />
              ) : (
                <VideoOff className="size-5" />
              )}
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
              active={panel === "chat"}
              activeClass="bg-white text-black"
              inactiveClass="bg-white/10 text-white hover:bg-white/20"
              onClick={() => setPanel((p) => (p === "chat" ? "none" : "chat"))}
              label="Chat"
            >
              <MessageSquare className="size-5" />
            </ControlButton>

            <Button
              onClick={handleLeave}
              className="ml-1 h-12 w-12 rounded-full bg-red-500 p-0 text-white hover:bg-red-600"
              aria-label="Leave meeting"
            >
              <PhoneOff className="size-5" />
            </Button>
          </footer>

          {/* Side panel */}
          {panel !== "none" && (
            <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-xs flex-col border-l border-white/10 bg-neutral-900">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
                <p className="text-sm font-medium">
                  {panel === "chat" ? "Chat" : "People"}
                </p>
                <button
                  type="button"
                  onClick={() => setPanel("none")}
                  className="text-neutral-400 transition-colors hover:text-white"
                  aria-label="Close panel"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
              </div>

              {panel === "chat" ? (
                <>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {call.messages?.length === 0 && (
                      <p className="pt-8 text-center text-sm text-neutral-500">
                        No messages yet. Say hi.
                      </p>
                    )}
                    {call.messages?.map((msg) => (
                      <div key={msg._id}>
                        <p className="text-xs text-neutral-400">
                          <span className="font-medium text-neutral-200">
                            {msg.name}
                          </span>{" "}
                          ·{" "}
                          {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-100">
                          {msg.text}
                        </p>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form
                    className="flex shrink-0 gap-2 border-t border-white/10 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendChat();
                    }}
                  >
                    <Input
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      placeholder="Send a message"
                      className="h-10 flex-1 rounded-full border-white/15 bg-white/5 text-sm text-white placeholder:text-neutral-500"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-full border-white/15 text-white hover:bg-white/10"
                      aria-label="Send message"
                    >
                      <Send className="size-4" />
                    </Button>
                  </form>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-4">
                  {call.participants?.map((p) => (
                    <div
                      key={p.clientId}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/5"
                    >
                      <div className="flex size-9 items-center justify-center rounded-full bg-white/10 text-sm font-medium">
                        {(p.name[0] ?? "?").toUpperCase()}
                      </div>
                      <p className="text-sm">
                        {p.name}
                        <span className="ml-2 text-xs text-neutral-500">
                          {p.clientId === call.clientId ? "· you" : "· in call"}
                        </span>
                      </p>
                    </div>
                  ))}
                  {call.participants?.length === 0 && (
                    <p className="pt-8 text-center text-sm text-neutral-500">
                      Nobody else here yet.
                    </p>
                  )}
                </div>
              )}
            </aside>
          )}
        </>
      )}

      {/* ---------- PRE-JOIN ---------- */}
      {!entered && (
        <div className="flex h-full items-center justify-center overflow-y-auto bg-neutral-950 p-6">
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-[15px] font-semibold tracking-tight text-white"
              >
                hiiiiii<span className="text-neutral-500">.</span>
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
                  className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Sign in to keep meetings
                </Link>
              )}
            </div>

            <p className="mt-12 text-[11px] font-medium uppercase tracking-[0.3em] text-neutral-500">
              Ready to join?
            </p>
            <p className="mt-3 font-mono text-sm tracking-tight text-neutral-300">
              {code}
            </p>

            <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10">
              {call.localStream ? (
                <VideoSurface stream={call.localStream} />
              ) : (
                <Avatar name={displayName} />
              )}
              <div className="absolute bottom-2.5 left-3 rounded-md bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                {displayName}
              </div>
            </div>

            {call.mediaError && (
              <p className="mt-3 text-xs text-amber-400/90">
                {call.mediaError} You can still join to listen and chat.
              </p>
            )}

            <div className="mt-6 flex items-center justify-between gap-2">
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
                  {call.micOn ? (
                    <Mic className="size-5" />
                  ) : (
                    <MicOff className="size-5" />
                  )}
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
                  {call.camOn ? (
                    <Video className="size-5" />
                  ) : (
                    <VideoOff className="size-5" />
                  )}
                </button>
              </div>

              <Button
                onClick={handleJoin}
                disabled={isChecking || isMissing}
                className="h-11 rounded-full px-8"
              >
                Join now
              </Button>
            </div>

            <label className="mt-8 block text-[11px] font-medium uppercase tracking-[0.25em] text-neutral-500">
              Your name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should people see you?"
              maxLength={40}
              className="mt-2 h-11 rounded-md border-white/15 bg-white/5 text-white placeholder:text-neutral-500"
            />

            <div className="mt-10 border-t border-white/10 pt-6 text-center">
              <p className="text-xs text-neutral-500">
                Peer-to-peer · nothing you say is recorded
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
        "flex size-12 items-center justify-center rounded-full transition-colors",
        active ? activeClass : inactiveClass,
      )}
    >
      {children}
    </button>
  );
}
