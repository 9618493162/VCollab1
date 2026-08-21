import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useCallRoom, type PeerQuality } from "@/hooks/use-call-room";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FluidPanel } from "@/components/ui/fluid";
import {
  AlertCircle, BadgeCheck, CheckCircle2,
  Ban,
  BarChart3,
  Bot,
  Captions,
  Check,
  CheckCheck,
  ClipboardList,
  Copy,
  Crown,
  DoorOpen,
  Hand,
  Info,
  Keyboard,
  Languages,
  LayoutGrid,
  ListChecks,
  Loader2,
  Lock,
  LockOpen,
  LogOut,
  Maximize2,
  MessageSquare,
  MessagesSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MoreVertical,
  Speaker,
  Pause,
  PenLine,
  PhoneOff,
  PictureInPicture2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  Shield,
  Signal,
  Sparkles,
  Square,
  UserPlus,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { AIPanel } from "@/components/AIPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeviceSettingsPanel } from "@/components/DeviceSettingsPanel";
import { MeetingInfoModal } from "@/components/MeetingInfoModal";
import { NotesTasksPanel } from "@/components/NotesTasksPanel";
import { SecurityPanel } from "@/components/SecurityPanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PollsPanel } from "@/components/PollsPanel";
import { QAPanel } from "@/components/QAPanel";
import { AgendaPanel } from "@/components/AgendaPanel";
import { BreakoutsPanel } from "@/components/BreakoutsPanel";
import { WhiteboardOverlay } from "@/components/WhiteboardOverlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "👏", "🎉", "😮", "😢", "🔥", "🚀", "💯"];

function extractCode(raw: string): string {
  // Match both new VC-XXXXXX format and legacy abc-defg-hij format.
  // The backend normalizeCode() handles canonical conversion.
  const match = raw
    .toLowerCase()
    .match(/([a-z0-9]{2,3}-[a-z0-9]{3,6}(?:-[a-z0-9]{0,3})?)/);
  return match?.[1] ?? raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
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
  peer,
}: {
  stream: MediaStream | null;
  className?: string;
  peer?: string;
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
      data-peer={peer}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

/**
 * Hidden audio element that plays a remote participant's audio track.
 * This is necessary because VideoSurface is always muted (to prevent
 * feedback on self-view), so remote audio needs a separate renderer.
 */
function RemoteAudioPlayer({ stream, peer }: { stream: MediaStream | null; peer: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      // Ensure playback starts (handles browsers that block autoplay)
      ref.current.play().catch(() => {
        // Autoplay blocked — user needs to interact first
      });
    }
  }, [stream]);
  // Also resume when the stream's audio tracks change (e.g. unmute)
  useEffect(() => {
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const track = audioTracks[0];
    const onUnmute = () => {
      ref.current?.play().catch(() => {});
    };
    track.addEventListener("unmute", onUnmute);
    return () => track.removeEventListener("unmute", onUnmute);
  }, [stream]);
  return (
    <audio ref={ref} data-peer={peer} autoPlay playsInline className="hidden" />
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

/**
 * Dedicated post-lifecycle screen. Shown for ended / expired / cancelled /
 * missing meetings — never renders the video lobby, never requests a token.
 */
function MeetingOverScreen({
  status,
  code,
  isAuthenticated,
  onCreateNew,
  onBack,
}: {
  status: "ended" | "expired" | "cancelled" | "notfound";
  code: string;
  isAuthenticated: boolean;
  onCreateNew?: () => void;
  onBack: () => void;
}) {
  const copy = {
    ended: {
      icon: PhoneOff,
      title: "Meeting Ended",
      body: "This meeting has ended and the meeting link is no longer active.",
    },
    expired: {
      icon: Ban,
      title: "Meeting Not Available",
      body: "This meeting code has expired.",
    },
    cancelled: {
      icon: Ban,
      title: "Meeting Not Available",
      body: "This meeting was cancelled.",
    },
    notfound: {
      icon: Ban,
      title: "Meeting Not Available",
      body: "This meeting code isn't valid or the meeting was never created.",
    },
  }[status];
  const Icon = copy.icon;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-muted/50">
          <Icon className="size-7 text-muted-foreground" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground/60">{code}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
          {status === "ended" && (
            <Button
              onClick={onCreateNew}
              className="h-11 rounded-full px-7 btn-glow"
            >
              <Plus className="mr-2 size-4" /> Create New Meeting
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 rounded-full border-border px-7 text-foreground hover:bg-muted"
            onClick={onBack}
          >
            {status === "ended"
              ? "Back to VCollab"
              : isAuthenticated
                ? "Back to dashboard"
                : "Back"}
          </Button>
        </div>
      </div>
    </main>
  );
}

export default function Call() {
  const { code: rawCode } = useParams();
  const code = extractCode(rawCode ?? "");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t") ?? undefined;
  const { user, signOut, isAuthenticated } = useAuth();
  const isHost = useQuery(api.meetings.isHost, code ? { code } : "skip");
  const room = useQuery(api.rooms.getRoom, code ? { code } : "skip");

  const [displayName, setDisplayName] = useState(
    user?.name?.split(" ")[0] ?? "You",
  );
  const [entered, setEntered] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [panel, setPanel] = useState<
    | "none"
    | "chat"
    | "people"
    | "polls"
    | "qa"
    | "agenda"
    | "breakouts"
    | "whiteboard"
    | "devices"
    | "notes"
    | "ai"
  >("none");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [hostLeaveMode, setHostLeaveMode] = useState<false | "pick-transfer" | false>(false);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"gallery" | "speaker" | "focus">("gallery");
  const [showReactions, setShowReactions] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [burst, setBurst] = useState<{ id: number; emoji: string; name: string; x: number }[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const lastMessageCountRef = useRef(0);
  const [selfPos, setSelfPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const [selfMinimized, setSelfMinimized] = useState(false);
  const [selfSize] = useState<{ w: number; h: number }>({ w: 208, h: 117 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const reduceMotion = useReducedMotion();
  const burstId = useRef(0);
  const lastParticipantCountRef = useRef(0);
  const [transferTarget, setTransferTarget] = useState<{ clientId: string; name: string; userId?: Id<"users"> } | null>(null);
  const lastReactionCount = useRef(0);
  const reactionRateRef = useRef<number[]>([]);

  const call = useCallRoom(
    code,
    displayName,
    {
      getVideoTiles: () =>
        Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-peer]")).map(
          (el) => ({ id: el.dataset.peer ?? "", el }),
        ),
    },
    token,
  );

  /** Resume audio on all remote players — needed when browser blocks autoplay */
  const unblockAudio = useCallback(() => {
    document.querySelectorAll<HTMLAudioElement>("audio[data-peer]").forEach((el) => {
      el.play().catch(() => {});
    });
    setAudioBlocked(false);
  }, []);

  // Detect audio autoplay blocking
  useEffect(() => {
    if (!entered) return;
    const check = () => {
      const audios = document.querySelectorAll<HTMLAudioElement>("audio[data-peer]");
      const blocked = Array.from(audios).some((el) => el.paused && !el.ended);
      setAudioBlocked(blocked && call.remoteStreams && Object.keys(call.remoteStreams).length > 0);
    };
    const timer = setTimeout(check, 2000);
    const id = setInterval(check, 5000);
    return () => { clearTimeout(timer); clearInterval(id); };
  }, [entered, call.remoteStreams]);

  const lockMeeting = useMutation(api.meetings.lockMeeting);
  const endMeeting = useMutation(api.meetings.endMeeting);
  const createRoom = useMutation(api.rooms.createRoom);
  const transferHost = useMutation(api.meetings.transferHost);
  const transferAndLeave = useMutation(api.security.transferAndLeave);

  const meetingSettings = useQuery(api.security.getMeetingSettings, code ? { code } : "skip");
  const waitingList = useQuery(api.security.listWaitingParticipants, code ? { code } : "skip");
  const prevWaitingCount = useRef(0);
  const renameRoom = useMutation(api.rooms.renameRoom);
  const admitParticipant = useMutation(api.security.admitParticipant);
  const admitAllWaiting = useMutation(api.security.admitAllWaiting);
  const rejectParticipant = useMutation(api.security.rejectParticipant);
  const makeCoHost = useMutation(api.security.makeCoHost);
  const muteAll = useMutation(api.security.muteAll);
  const isCoHost = meetingSettings?.coHosts?.includes(call.clientId) === true;
  const isModerator = isHost === true || isCoHost;

  // Toast notification when someone new enters the waiting room
  useEffect(() => {
    if (!isModerator || !waitingList) return;
    if (waitingList.length > prevWaitingCount.current) {
      const newcomer = waitingList[waitingList.length - 1];
      toast.info(`${newcomer?.name ?? "Someone"} is waiting to join`);
    }
    prevWaitingCount.current = waitingList.length;
  }, [waitingList, isModerator]);

  const settings = useQuery(api.settings.getSettings);
  const preJoinTouched = useRef(false);

  // Apply "Join with microphone/camera" defaults from Settings once, before the
  // user interacts with the pre-join toggles (their manual choice always wins).
  useEffect(() => {
    if (preJoinTouched.current || entered) return;
    if (settings === undefined) return;
    preJoinTouched.current = true;
    if (settings.joinWithMic === false && call.micOn) call.toggleMic();
    if (settings.joinWithCam === false && call.camOn) call.toggleCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, entered]);

  const elapsed = useElapsed(call.joinedAt);
  const recElapsed = useElapsed(call.recordingState?.startedAt ?? null);
  const isMissing = room !== undefined && room === null;
  const isChecking = room === undefined;

  // reaction bursts — only animate NEW reactions (not all of them each time)
  useEffect(() => {
    if (!call.reactions) return;
    const len = call.reactions.length;
    if (len <= lastReactionCount.current) {
      lastReactionCount.current = len;
      return;
    }
    const newReactions = call.reactions.slice(lastReactionCount.current);
    lastReactionCount.current = len;
    for (const r of newReactions) {
      burstId.current += 1;
      const id = burstId.current;
      const xPos = -60 + Math.random() * 120;
      setBurst((prev) => [...prev.slice(-18), { id, emoji: r.emoji, name: r.name, x: xPos }]);
      window.setTimeout(() => {
        setBurst((prev) => prev.filter((b) => b.id !== id));
      }, 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.reactions?.length]);

  // Track unread chat messages when chat panel is closed
  useEffect(() => {
    if (!call.messages) return;
    const len = call.messages.length;
    if (panel !== "chat" && len > lastMessageCountRef.current) {
      setUnreadChat((prev) => prev + (len - lastMessageCountRef.current));
    }
    lastMessageCountRef.current = len;
  }, [call.messages?.length, panel]);

  // Clear unread when chat panel opens
  useEffect(() => {
    if (panel === "chat") setUnreadChat(0);
  }, [panel]);

  // Join/leave notifications
  useEffect(() => {
    if (!call.participants || !entered) return;
    const prev = lastParticipantCountRef.current;
    const curr = call.participants.length;
    if (prev > 0 && curr > prev) {
      const newPs = call.participants.filter(
        (p) => p.clientId !== call.clientId && !p.waiting,
      );
      const newcomer = newPs[newPs.length - 1];
      if (newcomer) toast.info(`${newcomer.name} joined the meeting`);
    } else if (prev > 0 && curr < prev) {
      toast.info("A participant left the meeting");
    }
    lastParticipantCountRef.current = curr;
  }, [call.participants?.length, entered]);

  // Hand raised notifications
  useEffect(() => {
    if (!call.participants) return;
    const raised = call.participants.filter((p) => p.handRaised && p.clientId !== call.clientId);
    if (raised.length > 0) {
      const name = raised[raised.length - 1].name;
      toast(`${name} raised their hand`, { icon: "✋" });
    }
  }, [call.participants?.filter((p) => p.handRaised)?.length]);

  // kicked / ended by host → leave the room
  useEffect(() => {
    if (call.kicked) {
      toast.error("You were removed from the meeting by the host.");
      navigate(isAuthenticated ? "/dashboard" : "/", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.kicked]);

  // Ended by host (realtime signal): stop the call and show the ended screen.
  useEffect(() => {
    if (call.endedByHost) {
      toast.info("The host ended the meeting.");
      setMeetingEnded(true);
      void call.leave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.endedByHost]);

  // The backend is the source of truth: whenever the room's stored status
  // flips to a terminal state (host ended it, another tab ended it, or it
  // expired/cancelled), every open tab of this meeting shows the ended
  // screen — no reliance on the page refreshing or on client state alone.
  useEffect(() => {
    if (!room) return;
    if (
      room.status === "ended" ||
      room.status === "expired" ||
      room.status === "cancelled" ||
      room.expired === true
    ) {
      setMeetingEnded(true);
      if (call.joined) void call.leave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.expired, call.joined]);

  useEffect(() => {
    if (call.recordingError) {
      toast.warning(call.recordingError);
    } else if (call.recordingStatus === "ready") {
      toast.success("Recording saved — transcription is processing.");
    }
  }, [call.recordingError, call.recordingStatus]);

  // ---- live caption translation (server-side via ai.translateText) ----
  const translateText = useAction(api.ai.translateText);
  const [translateTo, setTranslateTo] = useState<string | null>(null);
  const [translated, setTranslated] = useState<{ line: string; text: string } | null>(null);
  const [translationNotice, setTranslationNotice] = useState<string | null>(null);
  const translatedIndexRef = useRef(-1);
  const translateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const lines = call.captions;
    if (!translateTo || lines.length === 0) return;
    const lastIndex = lines.length - 1;
    if (lastIndex <= translatedIndexRef.current) return;
    const text = lines[lastIndex];
    if (!text.trim()) return;

    if (translateTimerRef.current) window.clearTimeout(translateTimerRef.current);
    translateTimerRef.current = window.setTimeout(() => {
      translatedIndexRef.current = lastIndex;
      void translateText({ text, target: translateTo })
        .then((res) => {
          if (translatedIndexRef.current === lastIndex) {
            setTranslated({ line: text, text: res });
          }
        })
        .catch((error) => {
          const msg = error instanceof Error ? error.message : "";
          if (/isn't configured|not configured/i.test(msg)) {
            setTranslationNotice(
              "Live translation needs an AI provider key — add NVIDIA_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in the project Keys tab.",
            );
          } else if (msg) {
            setTranslationNotice("Live translation isn't available right now.");
          }
        });
    }, 700);

    return () => {
      if (translateTimerRef.current) window.clearTimeout(translateTimerRef.current);
    };
  }, [call.captions, translateTo, translateText]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts while typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      switch (e.key.toLowerCase()) {
        case "m":
          e.preventDefault();
          call.toggleMic();
          break;
        case "v":
          e.preventDefault();
          call.toggleCam();
          break;
        case "c":
          e.preventDefault();
          setPanel((p) => (p === "chat" ? "none" : "chat"));
          break;
        case "p":
          e.preventDefault();
          setPanel((p) => (p === "people" ? "none" : "people"));
          break;
        case "r":
          e.preventDefault();
          setShowReactions((v) => !v);
          break;
        case "escape":
          e.preventDefault();
          if (showReactions) setShowReactions(false);
          else if (showMobileMenu) setShowMobileMenu(false);
          else if (panel !== "none") setPanel("none");
          else if (showShortcuts) setShowShortcuts(false);
          else if (showInfo) setShowInfo(false);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [call.toggleMic, call.toggleCam, panel, showReactions, showMobileMenu, showShortcuts, showInfo]);

  const handleJoin = async () => {
    if (!displayName.trim()) {
      toast.error("Tell people your name first.");
      return;
    }
    if (joining) return;
    setJoining(true);
    try {
      await call.join();
      setEntered(true);
    } catch {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await call.leave();
      navigate(isAuthenticated ? "/dashboard" : "/");
    } catch {
      setLeaving(false);
      toast.error("Failed to leave meeting. Please try again.");
    }
  };

  const handleCopy = async () => {
    // Share link carries the secure join token (?t=...). The backend revokes
    // it the moment the meeting ends, so saved links die with the meeting.
    const url = `${window.location.origin}/join/${code}${room?.joinToken ? `?t=${room.joinToken}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const handleEndForAll = async () => {
    setConfirmEnd(false);
    if (leaving) return;
    setLeaving(true);
    try {
      await endMeeting({ code });
      setMeetingEnded(true);
      await call.leave();
      navigate(isAuthenticated ? "/dashboard" : "/");
    } catch (error) {
      setLeaving(false);
      toast.error(error instanceof Error ? error.message : "Couldn't end the meeting.");
    }
  };

  const handleCreateNew = async () => {
    try {
      const next = await createRoom();
      navigate(`/call/${next}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start a meeting.");
    }
  };

  const handleTransferHost = async (targetUserId: Id<"users">) => {
    try {
      await transferHost({ code, targetUserId });
      toast.success("Hosting transferred.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't transfer hosting.");
    }
  };

  const handleTransferAndLeave = async () => {
    if (!transferTarget?.userId) {
      toast.error("Select a participant to transfer host to.");
      return;
    }
    try {
      await transferAndLeave({ code, targetUserId: transferTarget.userId, clientId: call.clientId });
      toast.success("Host transferred. Leaving meeting…");
      await call.leave();
      navigate(isAuthenticated ? "/dashboard" : "/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't transfer and leave.");
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

  const handleRename = async () => {
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!title) return;
    try {
      await renameRoom({ code, title });
      toast.success("Meeting renamed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't rename the meeting.");
    }
  };

  const handleMuteAll = async () => {
    try {
      await muteAll({ code, clientId: call.clientId });
      toast.success("Everyone muted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't mute everyone.");
    }
  };

  // meeting keyboard shortcuts (M/C/S/R/H/P/T/A/?). Ignored while typing.
  useEffect(() => {
    if (!entered) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "m") {
        event.preventDefault();
        call.toggleMic();
      } else if (key === "c") {
        event.preventDefault();
        call.toggleCam();
      } else if (key === "s") {
        event.preventDefault();
        void call.toggleShare();
      } else if (key === "h") {
        event.preventDefault();
        call.toggleHand();
      } else if (key === "r") {
        event.preventDefault();
        setShowReactions((v) => !v);
      } else if (key === "p") {
        event.preventDefault();
        setPanel((p) => (p === "people" ? "none" : "people"));
      } else if (key === "t") {
        event.preventDefault();
        setPanel((p) => (p === "chat" ? "none" : "chat"));
      } else if (key === "a") {
        event.preventDefault();
        setPanel((p) => (p === "ai" ? "none" : "ai"));
      } else if (key === "?") {
        event.preventDefault();
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);


  // Lock body/html scroll during the meeting to prevent vertical shift
  useEffect(() => {
    if (!entered) return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    const prevBodyPos = document.body.style.position;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = "0";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.classList.add("meeting-active");
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.body.style.position = prevBodyPos;
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.classList.remove("meeting-active");
    };
  }, [entered]);

  const participantCount = call.participants?.length ?? (entered ? 1 : 0);
  const selfStream = call.sharing ? call.shareStream : call.localStream;

  // view-mode helpers
  const remoteIds = useMemo(() => Object.keys(call.remoteStreams), [call.remoteStreams]);
  const activeSpeakerId = useMemo(
    () => remoteIds.find((id) => call.speaking[id]) ?? remoteIds[0],
    [remoteIds, call.speaking],
  );

  const fireBurst = (emoji: string) => {
    // client-side rate limit: max 5 reactions per second
    const now = Date.now();
    reactionRateRef.current = reactionRateRef.current.filter((t) => now - t < 1000);
    if (reactionRateRef.current.length >= 5) return;
    reactionRateRef.current.push(now);
    // optimistic local display — show immediately
    burstId.current += 1;
    const id = burstId.current;
    const xPos = -60 + Math.random() * 120;
    setBurst((prev) => [...prev.slice(-18), { id, emoji, name: displayName, x: xPos }]);
    window.setTimeout(() => {
      setBurst((prev) => prev.filter((b) => b.id !== id));
    }, 3000);
    // send to other participants via Convex
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
    if (dragRef.current) {
      // clamp to the viewport so the floating self-view can't get lost
      setSelfPos((prev) => ({
        x: Math.min(Math.max(prev.x, 8), window.innerWidth - selfSize.w - 8),
        y: Math.min(Math.max(prev.y, 8), window.innerHeight - 96),
      }));
    }
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

  const goHome = () => navigate(isAuthenticated ? "/dashboard" : "/");

  // ---- loading state: Convex is still fetching room data ----
  if (room === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <Loader2 className="size-8 animate-spin text-primary/60" />
            <div className="absolute inset-0 size-8 rounded-full border border-primary/20" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Loading meeting...</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Verifying meeting code</p>
          </div>
        </div>
      </main>
    );
  }

  // ---- terminal lifecycle states: backend status wins over any UI state ----
  if (room !== undefined && room !== null && room.expired === true) {
    return (
      <MeetingOverScreen
        status="expired"
        code={code}
        isAuthenticated={isAuthenticated}
        onBack={goHome}
      />
    );
  }
  if (room !== undefined && room !== null && room.status === "ended") {
    return (
      <MeetingOverScreen
        status="ended"
        code={code}
        isAuthenticated={isAuthenticated}
        onCreateNew={() => void handleCreateNew()}
        onBack={goHome}
      />
    );
  }
  if (room !== undefined && room !== null && room.status === "expired") {
    return (
      <MeetingOverScreen
        status="expired"
        code={code}
        isAuthenticated={isAuthenticated}
        onBack={goHome}
      />
    );
  }
  if (room !== undefined && room !== null && room.status === "cancelled") {
    return (
      <MeetingOverScreen
        status="cancelled"
        code={code}
        isAuthenticated={isAuthenticated}
        onBack={goHome}
      />
    );
  }
  if (meetingEnded) {
    return (
      <MeetingOverScreen
        status="ended"
        code={code}
        isAuthenticated={isAuthenticated}
        onCreateNew={() => void handleCreateNew()}
        onBack={goHome}
      />
    );
  }
  if (room !== undefined && room === null) {
    return (
      <MeetingOverScreen
        status="notfound"
        code={code}
        isAuthenticated={isAuthenticated}
        onBack={goHome}
      />
    );
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/4 size-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 size-[400px] rounded-full bg-fuchsia-600/10 blur-[120px]" />

      {/* ---------- waiting room ---------- */}
      {call.waiting && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-muted/50">
            {room?.locked ? <Lock className="size-7 text-muted-foreground" /> : <DoorOpen className="size-7 text-muted-foreground" />}
          </div>
          <div>
            <p className="font-display text-xl font-semibold">
              {room?.locked ? "Meeting is locked" : "You're in the waiting room"}
            </p>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              {room?.locked
                ? "The host has locked this meeting. They've been notified that you want to join."
                : <>The host will let you into <span className="font-mono text-muted-foreground">{code}</span>{" "}shortly. Keep your mic and camera ready.</>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
            <span className="size-1.5 animate-pulse rounded-full bg-amber-400 [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-amber-400 [animation-delay:300ms]" />
            <span className="ml-2 text-xs text-muted-foreground/70">Waiting for the host…</span>
          </div>
          <Button
            variant="outline"
            className="mt-2 border-border/60 text-foreground hover:bg-muted"
            onClick={() => void handleLeave()}
          >
            Leave waiting room
          </Button>
        </div>
      )}

      {!call.waiting && entered && (
        <>
          {/* ---------- top bar ---------- */}
          <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/60 px-4 backdrop-blur-md sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="font-display text-[15px] font-bold tracking-tight"
              >
                V<span className="text-gradient">Collab</span>
              </button>
              <span className="hidden size-1 rounded-full bg-emerald-400 sm:block" />
              <span className="hidden text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:block">Live</span>

              {editingTitle && isModerator ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleRename();
                  }}
                >
                  <Input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => void handleRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingTitle(false);
                        setTitleDraft(room?.title ?? "");
                      }
                    }}
                    placeholder="Meeting title"
                    className="h-8 w-52 rounded-lg border-border/60 bg-muted/60 text-sm text-foreground"
                    aria-label="Meeting title"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!isModerator) return;
                    setTitleDraft(room?.title ?? "");
                    setEditingTitle(true);
                  }}
                  title={isModerator ? "Rename meeting" : room?.title ?? "Untitled meeting"}
                  aria-label={isModerator ? "Rename meeting" : "Meeting title"}
                  className="hidden max-w-[220px] truncate text-sm font-medium text-foreground transition-colors sm:block sm:hover:text-foreground md:max-w-xs"
                >
                  {room?.title || "Untitled meeting"}
                </button>
              )}
              <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
                {elapsed}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* recording status — server-backed so EVERY participant sees it */}
              {call.recordingState?.active === true && (
                <button
                  type="button"
                  onClick={
                    call.isRecordingStarter ? () => setConfirmStop(true) : undefined
                  }
                  title={
                    call.recordingState.paused
                      ? "Recording paused"
                      : call.isRecordingStarter
                        ? "Recording in progress — click to stop"
                        : `${call.recordingState.byName ?? "The host"} is recording this meeting${call.recordingState.mode === "cloud" ? " (cloud recording, keeps going if they leave)" : ""}`
                  }
                  aria-label="Recording in progress"
                  className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:text-red-300 transition-colors hover:bg-red-500/25"
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full bg-red-400",
                      !call.recordingState.paused && "animate-pulse",
                    )}
                  />
                  {call.recordingState.paused ? "REC paused" : `REC ${recElapsed}`}
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowSecurity(true)}
                title="Security"
                aria-label="Security settings"
                className={cn(
                  "hidden size-8 items-center justify-center rounded-full transition-colors md:flex",
                  meetingSettings?.waitingRoom || room?.locked
                    ? "text-amber-600 dark:text-amber-300 hover:bg-muted"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Shield className="size-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowInfo(true)}
                title="Meeting information"
                aria-label="Meeting information"
                className="hidden size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
              >
                <Info className="size-4" />
              </button>

              <ThemeToggle className="flex" />

              {/* view mode toggle */}
              <div className="hidden items-center rounded-full border border-border/60 bg-muted/50 p-0.5 md:flex">
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
                      view === v.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <v.icon className="size-4" />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span className="font-mono tracking-tight">{code}</span>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More meeting options"
                    title="More options"
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setShowInfo(true)}>
                    <Info className="mr-2 size-4" /> Meeting info
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSecurity(true)}>
                    <Shield className="mr-2 size-4" /> Security
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "devices" ? "none" : "devices"))}
                  >
                    <Settings2 className="mr-2 size-4" /> Device settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "ai" ? "none" : "ai"))}
                  >
                    <Bot className="mr-2 size-4" /> AI assistant
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "notes" ? "none" : "notes"))}
                  >
                    <ClipboardList className="mr-2 size-4" /> Notes & tasks
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "polls" ? "none" : "polls"))}
                  >
                    <BarChart3 className="mr-2 size-4" /> Polls
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "qa" ? "none" : "qa"))}
                  >
                    <MessagesSquare className="mr-2 size-4" /> Q&A
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "agenda" ? "none" : "agenda"))}
                  >
                    <ListChecks className="mr-2 size-4" /> Agenda
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "breakouts" ? "none" : "breakouts"))}
                  >
                    <Users className="mr-2 size-4" /> Breakout rooms
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPanel((p) => (p === "whiteboard" ? "none" : "whiteboard"))}
                  >
                    <PenLine className="mr-2 size-4" /> Whiteboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowShortcuts(true)}>
                    <Keyboard className="mr-2 size-4" /> Keyboard shortcuts
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={() => setPanel((p) => (p === "people" ? "none" : "people"))}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                  panel === "people"
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
          <main className="call-page-main relative z-10 min-h-0 p-3 sm:p-4">
            {isMissing ? (
              <div className="flex h-full flex-col items-center justify-center text-center px-4">
                <div className="flex size-14 items-center justify-center rounded-2xl border border-border/40 bg-muted/40 mb-4">
                  <Ban className="size-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">Meeting not found</p>
                <p className="mt-1 text-xs text-muted-foreground/60">This meeting doesn't exist or hasn't been created yet.</p>
                <Button
                  variant="outline"
                  className="mt-6 rounded-full border-border text-foreground hover:bg-muted"
                  onClick={() => navigate("/dashboard")}
                >
                  Back to meetings
                </Button>
              </div>
            ) : entered && !call.joined && !call.waiting ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                {call.joinError ? (
                  <>
                    <p className="max-w-sm text-sm text-red-600 dark:text-red-300">{call.joinError}</p>
                    <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row">
                      <Button
                        onClick={() => void call.join()}
                        className="h-11 rounded-full px-7 btn-glow"
                      >
                        <RefreshCw className="mr-2 size-4" /> Try again
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 rounded-full border-border px-7 text-foreground hover:bg-muted"
                        onClick={() => void handleLeave()}
                      >
                        Leave
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <Loader2 className="size-8 animate-spin text-primary/60" />
                      <div className="absolute inset-0 size-8 rounded-full border border-primary/20" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Connecting to meeting…
                    </p>
                    <p className="text-xs text-muted-foreground/60">Setting up your connection</p>
                  </div>
                )}
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
                handRaised={call.participants?.find((p) => p.clientId === activeSpeakerId)?.handRaised}
              />
            ) : (
              <div
                className={cn(
                  "grid h-full w-full content-center justify-items-center gap-2 p-2 overflow-y-auto sm:gap-3 sm:p-3",
                  (() => {
                    const remoteCount = Object.keys(call.remoteStreams).length;
                    const totalTiles = remoteCount + (view === "gallery" ? 1 : 0);
                    const hasPresenter = call.participants?.some((p) => p.sharing);
                    if (hasPresenter) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
                    if (totalTiles <= 1) return "grid-cols-1 max-w-3xl mx-auto";
                    if (totalTiles === 2) return "grid-cols-1 sm:grid-cols-2 max-w-4xl mx-auto";
                    if (totalTiles <= 4) return "grid-cols-2 max-w-5xl mx-auto";
                    if (totalTiles <= 6) return "grid-cols-2 sm:grid-cols-3 max-w-6xl mx-auto";
                    if (totalTiles <= 9) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 max-w-6xl mx-auto";
                    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
                  })(),
                )}
              >
                {/* self tile (gallery) */}
                {view === "gallery" && (
                  <SelfTile
                    stream={selfStream}
                    name={displayName}
                    micOn={call.micOn}
                    sharing={call.sharing}
                    peerId={call.clientId}
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
                        handRaised={call.participants?.find((p) => p.clientId === peerId)?.handRaised}
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
                      className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-muted/60 ring-1 ring-black/10 dark:ring-white/10"
                    >
                      <Avatar name={p.name} />
                      {p.handRaised && (
                        <span className="absolute left-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-amber-400 text-sm shadow-lg animate-bounce">
                          ✋
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent pt-8 pb-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="size-3 animate-spin text-white/70" />
                          <span className="text-xs font-medium text-white/80">
                            {p.name} joining…
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                {Object.keys(call.remoteStreams).length === 0 &&
                  call.participants?.length === 1 && (
                    <div className="col-span-full flex flex-col items-center justify-center text-center px-4 py-8">
                      <div className="flex size-16 items-center justify-center rounded-2xl border border-border/40 bg-muted/40 mb-4">
                        <Users className="size-7 text-muted-foreground/50" />
                      </div>
                      <p className="text-base font-medium text-muted-foreground">
                        Waiting for others to join
                      </p>
                      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground/60">
                        Share the meeting code with participants to get started.
                      </p>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">{code}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full h-8"
                          onClick={() => {
                            void navigator.clipboard.writeText(code);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? <CheckCheck className="size-3.5" /> : <Copy className="size-3.5" />}
                        </Button>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* floating self view (speaker / focus) */}
            {entered && view !== "gallery" && (
              <motion.div
                className="absolute left-0 top-0 z-20"
                style={{ width: selfSize.w }}
                initial={false}
                animate={{ x: selfPos.x, y: selfPos.y }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 460, damping: 34, mass: 0.9 }
                }
              >
                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className={cn(
                    "group overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-black/10 dark:ring-white/15 shadow-2xl",
                    selfMinimized ? "h-12 cursor-pointer" : "cursor-grab active:cursor-grabbing",
                  )}
                  style={{ height: selfMinimized ? undefined : selfSize.h }}
                  onClick={() => selfMinimized && setSelfMinimized(false)}
                >
                  {!selfMinimized ? (
                    <>
                      <div className="relative aspect-video">
                        {selfStream ? (
                          <VideoSurface stream={selfStream} peer={call.clientId} />
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
                    <div className="flex h-12 items-center gap-2 px-3 text-xs text-muted-foreground">
                      <PictureInPicture2 className="size-4" />
                      {displayName}
                    </div>
                  )}
                </div>
            </motion.div>
            )}

            {/* reactions burst */}
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
              <AnimatePresence>
                {burst.map((b) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 60, scale: 0.5 }}
                    animate={{ opacity: [0, 1, 1, 0], y: [60, 10, -20, -80], scale: [0.5, 1.2, 1.1, 0.8] }}
                    transition={{ duration: 2.5, ease: "easeOut", times: [0, 0.15, 0.6, 1] }}
                    style={{ left: `calc(50% + ${b.x}px)` }}
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
                <div className="mb-1 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur-sm">
                  <Languages className="size-3.5" />
                  <span className="opacity-70">Translate</span>
                  <select
                    value={translateTo ?? ""}
                    onChange={(e) => {
                      setTranslateTo(e.target.value || null);
                      setTranslated(null);
                      setTranslationNotice(null);
                      translatedIndexRef.current = -1;
                    }}
                    aria-label="Translate captions to"
                    className="cursor-pointer rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-[11px] text-white outline-none transition-colors hover:border-white/40 [&>option]:bg-background [&>option]:text-foreground"
                  >
                    <option value="">Off</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Telugu">Telugu</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Portuguese">Portuguese</option>
                    <option value="Bengali">Bengali</option>
                    <option value="Tamil">Tamil</option>
                    <option value="Kannada">Kannada</option>
                    <option value="Japanese">Japanese</option>
                  </select>
                </div>
                {call.captions.slice(-3).map((line, i) => (
                  <span
                    key={i}
                    className="rounded-lg bg-black/60 px-3 py-1 text-sm text-white backdrop-blur-sm"
                  >
                    {line}
                  </span>
                ))}
                {translated && translated.line === call.captions[call.captions.length - 1] && (
                  <span className="rounded-lg border border-primary/50 bg-primary/25 px-3 py-1 text-sm text-white backdrop-blur-sm">
                    {translated.text}
                  </span>
                )}
                {call.interimCaption && (
                  <span className="rounded-lg bg-black/40 px-3 py-1 text-sm text-white/70 backdrop-blur-sm">
                    {call.interimCaption}
                  </span>
                )}
                {translationNotice && (
                  <span className="rounded-lg bg-amber-500/20 px-3 py-1 text-[11px] text-amber-600 dark:text-amber-200 backdrop-blur-sm">
                    {translationNotice}
                  </span>
                )}
              </div>
            )}
            {call.captionError && (
              <p className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-amber-500/20 px-3 py-1 text-xs text-amber-600 dark:text-amber-200 backdrop-blur-sm">
                {call.captionError}
              </p>
            )}
          </main>

          {/* ---------- audio unblock banner ---------- */}
          {audioBlocked && (
            <div className="relative z-10 flex justify-center px-4 pb-1">
              <button
                type="button"
                onClick={unblockAudio}
                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-300 backdrop-blur-sm transition-colors hover:bg-amber-500/20"
              >
                🔊 Enable Meeting Audio
              </button>
            </div>
          )}

          {/* ---------- control bar ---------- */}
          <footer className="relative z-10 flex w-full shrink-0 items-center justify-center px-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-5 sm:px-3">
            <div className="flex w-full max-w-3xl items-center justify-center">
            <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/60 bg-background/80 px-2 py-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:gap-2 sm:p-2">
            <ControlButton
              active={call.micOn}
              activeClass="bg-foreground text-background"
              inactiveClass="bg-red-500/90 text-white hover:bg-red-500"
              onClick={call.toggleMic}
              label={call.micOn ? "Turn off mic" : "Turn on mic"}
            >
              {call.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </ControlButton>

            <ControlButton
              active={call.camOn}
              activeClass="bg-foreground text-background"
              inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
              onClick={call.toggleCam}
              label={call.camOn ? "Turn off camera" : "Turn on camera"}
            >
              {call.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </ControlButton>

            {/* Speaker/Devices — mobile only */}
            <div className="flex sm:hidden">
              <ControlButton
                active={panel === "devices"}
                activeClass="bg-foreground text-background"
                inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
                onClick={() => setPanel((p) => (p === "devices" ? "none" : "devices"))}
                label="Speaker & devices"
              >
                <Speaker className="size-5" />
              </ControlButton>
            </div>

            {/* Desktop-only buttons: Screen Share, Hand, Reactions, Captions, Recording, AI, Chat */}
            <div className="hidden sm:flex items-center gap-1 sm:gap-2">
            <ControlButton
              active={call.sharing}
              activeClass="bg-foreground text-background"
              inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
              onClick={() => void call.toggleShare()}
              label={call.sharing ? "Stop presenting" : "Present screen"}
            >
              <MonitorUp className="size-5" />
            </ControlButton>

            <ControlButton
              active={call.handRaised}
              activeClass="bg-amber-400 text-black"
              inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
              onClick={call.toggleHand}
              label={call.handRaised ? "Lower hand" : "Raise hand"}
            >
              <Hand className={cn("size-5", call.handRaised && "animate-bounce")} />
            </ControlButton>

            {/* reactions */}
            <div className="relative">
              <ControlButton
                active={showReactions}
                activeClass="bg-foreground text-background"
                inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
                onClick={() => setShowReactions((v) => !v)}
                label="Reactions"
              >
                <Sparkles className="size-5" />
              </ControlButton>
              {showReactions && (
                <>
                  {/* backdrop to close on outside click */}
                  <div className="fixed inset-0 z-20" onClick={() => setShowReactions(false)} />
                  <div className="absolute bottom-14 left-1/2 z-30 flex -translate-x-1/2 flex-wrap justify-center gap-1 rounded-2xl border border-border/60 bg-background/95 p-2 shadow-2xl backdrop-blur-2xl max-w-[280px] sm:max-w-none">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => fireBurst(emoji)}
                        className="flex size-10 items-center justify-center rounded-xl text-2xl transition-all hover:scale-125 hover:bg-muted active:scale-90"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* captions */}
            <ControlButton
              active={call.captionsEnabled}
              activeClass="bg-foreground text-background"
              inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
              onClick={call.toggleCaptions}
              label="Live captions"
            >
              <Captions className="size-5" />
            </ControlButton>

            {/* recording — host/co-host only; everyone else sees the indicator */}
            {isModerator && (
              <div className="flex items-center">
                {call.recordingState?.active === true ? (
                  call.isRecordingStarter ? (
                    <>
                      {/* LiveKit's room-composite egress has no pause; only
                          local captures can be paused/resumed */}
                      {call.recordingState?.mode !== "cloud" && (
                        <ControlButton
                          active={call.recordingPaused}
                          activeClass="bg-amber-400 text-black"
                          inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
                          onClick={
                            call.recordingPaused
                              ? call.resumeRecording
                              : call.pauseRecording
                          }
                          label={call.recordingPaused ? "Resume recording" : "Pause recording"}
                        >
                          {call.recordingPaused ? (
                            <Play className="size-5" />
                          ) : (
                            <Pause className="size-5" />
                          )}
                        </ControlButton>
                      )}
                      <ControlButton
                        active
                        activeClass="bg-red-500 text-white animate-pulse"
                        inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
                        onClick={() => setConfirmStop(true)}
                        label="Stop recording"
                      >
                        <Square className="size-4" />
                      </ControlButton>
                    </>
                  ) : (
                    <span
                      className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-[11px] font-medium text-red-600 dark:text-red-300"
                      title={
                        call.recordingState?.mode === "cloud"
                          ? "Cloud recording in progress — it keeps running even if the host leaves"
                          : "The host is recording this meeting"
                      }
                    >
                      <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
                      REC
                    </span>
                  )
                ) : (
                  <ControlButton
                    active={false}
                    activeClass="bg-red-500 text-white animate-pulse"
                    inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
                    onClick={() => void call.startRecording()}
                    label="Record meeting"
                  >
                    <Radio className="size-5" />
                  </ControlButton>
                )}
              </div>
            )}

            <ControlButton
              active={panel === "ai"}
              activeClass="bg-foreground text-background"
              inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
              onClick={() => setPanel((p) => (p === "ai" ? "none" : "ai"))}
              label="AI assistant"
            >
              <Bot className="size-5" />
            </ControlButton>

            <ControlButton
              active={panel === "chat"}
              activeClass="bg-foreground text-background"
              inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
              onClick={() => setPanel((p) => (p === "chat" ? "none" : "chat"))}
              label="Chat"
            >
              <div className="relative">
                <MessageSquare className="size-5" />
                {unreadChat > 0 && panel !== "chat" && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {unreadChat > 9 ? "9+" : unreadChat}
                  </span>
                )}
              </div>
            </ControlButton>
            </div>{/* end desktop-only buttons */}
            <div className="flex sm:hidden">
              <ControlButton
                active={showMobileMenu}
                activeClass="bg-foreground text-background"
                inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
                onClick={() => setShowMobileMenu((v) => !v)}
                label="More options"
              >
                <MoreVertical className="size-5" />
              </ControlButton>
            </div>

            {isHost && (
              <div className="ml-1 flex items-center gap-1.5 border-l border-border/60 pl-2">
                <ControlButton
                  active={room?.locked === true}
                  activeClass="bg-foreground text-background"
                  inactiveClass="bg-foreground/10 text-foreground hover:bg-foreground/20"
                  onClick={() => void handleLock(room?.locked !== true)}
                  label={room?.locked ? "Unlock meeting" : "Lock meeting"}
                >
                  {room?.locked ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
                </ControlButton>
              </div>
            )}
          </div>
            {/* End/Leave */}
            {isHost ? (
              <Button
                onClick={() => setConfirmEnd(true)}
                className="ml-2 h-10 w-10 shrink-0 rounded-full bg-red-500 p-0 text-white hover:bg-red-600 sm:h-11 sm:w-11 md:h-12 md:w-12"
                aria-label="End or leave meeting"
                title="End / Leave"
              >
                <PhoneOff className="size-5" />
              </Button>
            ) : (
              <Button
                onClick={handleLeave}
                disabled={leaving}
                className="ml-2 h-10 w-10 shrink-0 rounded-full bg-red-500 p-0 text-white hover:bg-red-600 sm:h-11 sm:w-11 md:h-12 md:w-12 disabled:opacity-50"
                aria-label="Leave meeting"
              >
                {leaving ? <Loader2 className="size-5 animate-spin" /> : <PhoneOff className="size-5" />}
              </Button>
            )}
            </div>
          </footer>

          {/* ---------- mobile more menu overlay ---------- */}
          <AnimatePresence>
          {showMobileMenu && (
            <div className="fixed inset-0 z-50 sm:hidden">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="absolute inset-x-0 bottom-0 z-10 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border/60 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">More</p>
                  <button type="button" onClick={() => setShowMobileMenu(false)} className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="size-4" />
                  </button>
                </div>
                {/* Meeting code quick copy */}
                <button
                  type="button"
                  onClick={() => { void handleCopy(); }}
                  className="mb-3 flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{code}</span>
                    <span className="text-[10px] text-muted-foreground">meeting code</span>
                  </div>
                  {copied ? <CheckCheck className="size-4 text-emerald-500" /> : <Copy className="size-4 text-muted-foreground" />}
                </button>
                <div className="grid grid-cols-4 gap-2">
                  <button type="button" onClick={() => { void call.toggleShare(); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className={cn("flex size-10 items-center justify-center rounded-full", call.sharing ? "bg-foreground text-background" : "bg-foreground/10 text-foreground")}><MonitorUp className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Share</span>
                  </button>
                  <button type="button" onClick={() => { setShowReactions(true); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><Sparkles className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">React</span>
                  </button>
                  <button type="button" onClick={() => { call.toggleHand(); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className={cn("flex size-10 items-center justify-center rounded-full", call.handRaised ? "bg-amber-400 text-black" : "bg-foreground/10 text-foreground")}><Hand className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Hand</span>
                  </button>
                  <button type="button" onClick={() => { call.toggleCaptions(); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className={cn("flex size-10 items-center justify-center rounded-full", call.captionsEnabled ? "bg-foreground text-background" : "bg-foreground/10 text-foreground")}><Captions className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Captions</span>
                  </button>
                  <button type="button" onClick={() => { setPanel((p) => (p === "chat" ? "none" : "chat")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="relative"><div className={cn("flex size-10 items-center justify-center rounded-full", panel === "chat" ? "bg-foreground text-background" : "bg-foreground/10 text-foreground")}><MessageSquare className="size-5" /></div>{unreadChat > 0 && panel !== "chat" && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{unreadChat > 9 ? "9+" : unreadChat}</span>}</div>
                    <span className="text-[10px] text-muted-foreground">Chat</span>
                  </button>
                  <button type="button" onClick={() => { setPanel((p) => (p === "ai" ? "none" : "ai")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className={cn("flex size-10 items-center justify-center rounded-full", panel === "ai" ? "bg-foreground text-background" : "bg-foreground/10 text-foreground")}><Bot className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">AI</span>
                  </button>
                  <button type="button" onClick={() => { setPanel((p) => (p === "people" ? "none" : "people")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="relative"><div className={cn("flex size-10 items-center justify-center rounded-full", panel === "people" ? "bg-foreground text-background" : "bg-foreground/10 text-foreground")}><Users className="size-5" /></div>{(call.participants?.length ?? 0) > 1 && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{call.participants?.length}</span>}</div>
                    <span className="text-[10px] text-muted-foreground">People</span>
                  </button>
                  {isModerator && (
                    <button type="button" onClick={() => { if (call.recordingState?.active === true) { if (call.isRecordingStarter) setConfirmStop(true); } else { void call.startRecording(); } setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                      <div className={cn("flex size-10 items-center justify-center rounded-full", call.recordingState?.active ? "bg-red-500 text-white" : "bg-foreground/10 text-foreground")}><Radio className="size-5" /></div>
                      <span className="text-[10px] text-muted-foreground">Record</span>
                    </button>
                  )}
                  <button type="button" onClick={() => { setPanel((p) => (p === "notes" ? "none" : "notes")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><PenLine className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Notes</span>
                  </button>
                  <button type="button" onClick={() => { setPanel((p) => (p === "polls" ? "none" : "polls")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><BarChart3 className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Polls</span>
                  </button>
                  <button type="button" onClick={() => { setPanel((p) => (p === "qa" ? "none" : "qa")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><MessagesSquare className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Q&A</span>
                  </button>
                  <button type="button" onClick={() => { setPanel((p) => (p === "agenda" ? "none" : "agenda")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><ClipboardList className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Agenda</span>
                  </button>
                  <button type="button" onClick={() => { setPanel((p) => (p === "whiteboard" ? "none" : "whiteboard")); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><LayoutGrid className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Board</span>
                  </button>
                  <button type="button" onClick={() => { setShowInfo(true); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><Info className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Info</span>
                  </button>
                  <button type="button" onClick={() => { setShowShortcuts(true); setShowMobileMenu(false); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-muted">
                    <div className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-foreground"><Keyboard className="size-5" /></div>
                    <span className="text-[10px] text-muted-foreground">Keys</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </AnimatePresence>

          {/* ---------- host transfer confirmation ---------- */}
          <AlertDialog open={!!transferTarget} onOpenChange={(open) => { if (!open) setTransferTarget(null); }}>
            <AlertDialogContent className="border-border/60 sm:max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Transfer host role</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  Transfer host to <span className="font-medium text-foreground">{transferTarget?.name}</span>? They will be able to manage the meeting, admit participants, and control settings.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full"
                  onClick={() => {
                    if (transferTarget?.userId) {
                      void handleTransferHost(transferTarget.userId);
                      toast.success(`Host transferred to ${transferTarget.name}`);
                    }
                    setTransferTarget(null);
                  }}
                >
                  <Crown className="mr-1.5 size-3.5" /> Transfer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ---------- host leave dialog: Transfer & Leave / End / Cancel ---------- */}
          <AlertDialog open={confirmEnd} onOpenChange={(open) => { setConfirmEnd(open); if (!open) { setHostLeaveMode(false); setTransferTarget(null); } }}>
            <AlertDialogContent className="border-border/60 sm:max-w-md">
              {!hostLeaveMode ? (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>You're the host</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      Choose what to do before leaving. You can transfer host to a participant, end the meeting for everyone, or simply leave.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="flex flex-col gap-2 py-2">
                    <Button
                      variant="outline"
                      className="justify-start gap-3 rounded-xl border-border/60"
                      onClick={() => setHostLeaveMode("pick-transfer")}
                    >
                      <Crown className="size-4 text-amber-500" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Transfer host & leave</p>
                        <p className="text-[11px] text-muted-foreground">Hand off to another participant, then leave</p>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start gap-3 rounded-xl border-border/60 hover:border-red-500/40 hover:bg-red-500/5"
                      onClick={() => void handleEndForAll()}
                    >
                      <PhoneOff className="size-4 text-red-500" />
                      <div className="text-left">
                        <p className="text-sm font-medium">End meeting for everyone</p>
                        <p className="text-[11px] text-muted-foreground">Close the meeting for all participants</p>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start gap-3 rounded-xl border-border/60"
                      onClick={handleLeave}
                    >
                      <LogOut className="size-4 text-muted-foreground" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Leave meeting</p>
                        <p className="text-[11px] text-muted-foreground">Meeting continues without you</p>
                      </div>
                    </Button>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                  </AlertDialogFooter>
                </>
              ) : (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Transfer host to…</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      Select a participant to make them the new host. You'll leave the meeting after the transfer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="max-h-60 space-y-1 overflow-y-auto py-2">
                    {(call.participants ?? []).filter((p) => p.userId && p.userId !== user?._id && !p.waiting).map((p) => (
                      <button
                        key={p.clientId}
                        type="button"
                        onClick={() => setTransferTarget({ clientId: p.clientId, name: p.name, userId: p.userId })}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          transferTarget?.userId === p.userId
                            ? "bg-primary/10 ring-1 ring-primary/50"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                          {p.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          {isCoHost && p.clientId === call.clientId && (
                            <p className="text-[10px] text-muted-foreground">you</p>
                          )}
                        </div>
                        {transferTarget?.userId === p.userId && (
                          <Check className="size-4 text-primary" />
                        )}
                      </button>
                    ))}
                    {(call.participants ?? []).filter((p) => p.userId && p.userId !== user?._id && !p.waiting).length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">No eligible participants to transfer to.</p>
                    )}
                  </div>
                  <AlertDialogFooter>
                    <Button variant="ghost" className="rounded-full" onClick={() => setHostLeaveMode(false)}>
                      Back
                    </Button>
                    <Button
                      className="rounded-full"
                      disabled={!transferTarget?.userId}
                      onClick={() => void handleTransferAndLeave()}
                    >
                      Transfer & Leave
                    </Button>
                  </AlertDialogFooter>
                </>
              )}
            </AlertDialogContent>
          </AlertDialog>

          {/* ---------- confirm before stopping a recording ---------- */}
          <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
            <AlertDialogContent className="border-border/60">
              <AlertDialogHeader>
                <AlertDialogTitle>Stop recording?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  The recording will be saved, processed, and transcribed
                  automatically. This can't be undone once you stop.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border/60">
                  Keep recording
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 text-white hover:bg-red-600"
                  onClick={() => call.stopRecording()}
                >
                  Stop recording
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ---------- side panels ---------- */}
          <AnimatePresence>
            {panel === "chat" && (
              <FluidPanel key="chat">
                <ChatPanel call={call} onClose={() => setPanel("none")} />
              </FluidPanel>
            )}
            {panel === "people" && (
              <FluidPanel key="people">
                <PeoplePanel
                  code={code}
                  call={call}
                  isHost={isHost === true}
                  isCoHost={isCoHost}
                  coHosts={meetingSettings?.coHosts}
                  waitingList={waitingList}
                  onAdmit={(clientId) => void admitParticipant({ code, clientId })}
                  onAdmitAll={() => void admitAllWaiting({ code })}
                  onReject={(clientId) => void rejectParticipant({ code, clientId })}
                  onMakeCoHost={(clientId) =>
                    void makeCoHost({ code, clientId }).catch((error) =>
                      toast.error(error instanceof Error ? error.message : "Couldn't update co-host."),
                    )
                  }
                  onTransferHost={(userId) => void handleTransferHost(userId)}
                  onSetTransferTarget={setTransferTarget}
                  onMuteAll={() => void handleMuteAll()}
                  onClose={() => setPanel("none")}
                />
              </FluidPanel>
            )}
            {panel === "devices" && (
              <FluidPanel key="devices">
                <DeviceSettingsPanel call={call} onClose={() => setPanel("none")} />
              </FluidPanel>
            )}
            {panel === "notes" && (
              <FluidPanel key="notes">
                <NotesTasksPanel code={code} onClose={() => setPanel("none")} />
              </FluidPanel>
            )}
            {panel === "ai" && (
              <FluidPanel key="ai">
                <AIPanel code={code} call={call} onClose={() => setPanel("none")} />
              </FluidPanel>
            )}
            {panel === "polls" && (
              <FluidPanel key="polls">
                <PollsPanel
                  code={code}
                  isHost={isHost === true}
                  clientId={call.clientId}
                  onClose={() => setPanel("none")}
                />
              </FluidPanel>
            )}
            {panel === "qa" && (
              <FluidPanel key="qa">
                <QAPanel
                  code={code}
                  isHost={isHost === true}
                  clientId={call.clientId}
                  onClose={() => setPanel("none")}
                />
              </FluidPanel>
            )}
            {panel === "agenda" && (
              <FluidPanel key="agenda">
                <AgendaPanel
                  code={code}
                  isHost={isHost === true}
                  onClose={() => setPanel("none")}
                />
              </FluidPanel>
            )}
            {panel === "breakouts" && (
              <FluidPanel key="breakouts">
                <BreakoutsPanel
                  code={code}
                  isHost={isHost === true}
                  clientId={call.clientId}
                  name={call.participants?.find((p) => p.clientId === call.clientId)?.name ?? displayName}
                  onClose={() => setPanel("none")}
                />
              </FluidPanel>
            )}
          </AnimatePresence>
          {panel === "whiteboard" && (
            <WhiteboardOverlay
              code={code}
              isHost={isHost === true}
              clientId={call.clientId}
              name={call.participants?.find((p) => p.clientId === call.clientId)?.name ?? displayName}
              onClose={() => setPanel("none")}
            />
          )}
        </>
      )}

      {/* ---------- meeting info + security modals ---------- */}
      <MeetingInfoModal
        open={showInfo}
        onOpenChange={setShowInfo}
        code={code}
        title={room?.title}
        hostName={room?.hostName}
        startedAt={call.joinedAt ?? undefined}
        participantCount={participantCount}
        durationLabel={elapsed}
        joinToken={room?.joinToken}
      />
      {showSecurity && (
        <SecurityPanel
          code={code}
          isHost={isHost === true}
          isCoHost={isCoHost}
          onClose={() => setShowSecurity(false)}
        />
      )}

      {/* ---------- keyboard shortcuts help ---------- */}
      {showShortcuts && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border/60 bg-background p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Keyboard shortcuts</p>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                aria-label="Close shortcuts"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                ["M", "Mute / unmute microphone"],
                ["C", "Turn camera on / off"],
                ["S", "Start / stop presenting"],
                ["R", "Open reactions"],
                ["H", "Raise / lower hand"],
                ["P", "People panel"],
                ["T", "Chat"],
                ["A", "AI assistant"],
                ["?", "Show this help"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <kbd className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground/70">
              Shortcuts are ignored while you're typing.
            </p>
          </div>
        </div>
      )}

          {/* ---------- PRE-JOIN ---------- */}
      {!entered && (
        <div className="relative z-10 flex h-full items-center justify-center overflow-y-auto bg-background px-4 py-8 sm:p-6">
          <div className="w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="font-display text-lg font-bold tracking-tight"
              >
                V<span className="text-gradient">Collab</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle className="flex" />
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => void signOut().then(() => navigate("/"))}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground/70 transition-colors hover:text-foreground"
                  >
                    <LogOut className="size-3.5" />
                    Sign out
                  </button>
                ) : (
                  <Link
                    to={`/auth?returnTo=/call/${code}`}
                    className="flex items-center gap-1.5 rounded-full border border-border/60 px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>

            {/* Meeting info */}
            <div className="mt-8 sm:mt-10">
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground/70">
                {isHost ? "Start your meeting" : "Ready to join?"}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <p className="font-mono text-sm tracking-tight text-muted-foreground">{code}</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1 rounded-full bg-emerald-400" />
                  Active
                </span>
              </div>
              {isHost && (
                <p className="mt-1 text-xs text-muted-foreground/60">You're the host</p>
              )}
            </div>

            {/* Camera preview */}
            <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-2xl bg-muted/60 ring-1 ring-black/10 dark:ring-white/10">
              {call.localStream && call.camOn ? (
                <VideoSurface stream={call.localStream} />
              ) : (
                <Avatar name={displayName} />
              )}
              <div className="absolute bottom-2.5 left-3 rounded-lg bg-black/50 px-2 py-0.5 text-xs backdrop-blur-sm">
                {displayName}
              </div>
              {/* Camera off indicator */}
              {!call.camOn && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex size-14 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm">
                      <VideoOff className="size-6 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground/70">Camera off</span>
                  </div>
                </div>
              )}
            </div>

            {/* Device status */}
            <div className="mt-4 flex items-center gap-4 text-[11px]">
              <span className={cn(
                "flex items-center gap-1.5",
                call.mediaError ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
              )}>
                {call.mediaError ? (
                  <AlertCircle className="size-3" />
                ) : (
                  <CheckCircle2 className="size-3" />
                )}
                {call.mediaError ? "Mic unavailable" : "Mic ready"}
              </span>
              <span className={cn(
                "flex items-center gap-1.5",
                !call.camOn ? "text-muted-foreground/60" : "text-emerald-600 dark:text-emerald-400"
              )}>
                {!call.camOn ? (
                  <VideoOff className="size-3" />
                ) : (
                  <CheckCircle2 className="size-3" />
                )}
                {!call.camOn ? "Camera off" : "Camera ready"}
              </span>
            </div>

            {/* Media error */}
            {call.mediaError && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                {call.mediaError} You can still join to listen and chat.
              </p>
            )}

            {/* Controls row */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    preJoinTouched.current = true;
                    call.toggleMic();
                  }}
                  aria-label={call.micOn ? "Turn off mic" : "Turn on mic"}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full transition-colors",
                    call.micOn
                      ? "bg-foreground/10 text-foreground hover:bg-foreground/20"
                      : "bg-red-500/90 text-white hover:bg-red-500",
                  )}
                >
                  {call.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    preJoinTouched.current = true;
                    call.toggleCam();
                  }}
                  aria-label={call.camOn ? "Turn off camera" : "Turn on camera"}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full transition-colors",
                    call.camOn
                      ? "bg-foreground/10 text-foreground hover:bg-foreground/20"
                      : "bg-red-500/90 text-white hover:bg-red-500",
                  )}
                >
                  {call.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("devices")}
                  aria-label="Device settings"
                  className="flex size-11 items-center justify-center rounded-full bg-foreground/10 text-foreground transition-colors hover:bg-foreground/20"
                >
                  <Settings2 className="size-5" />
                </button>
              </div>

              <Button
                onClick={() => void handleJoin()}
                disabled={isChecking || isMissing || joining}
                className="h-11 rounded-full px-8 btn-glow"
              >
                {joining ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Joining...
                  </>
                ) : isChecking ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Loading...
                  </>
                ) : isHost ? (
                  "Start Meeting"
                ) : (
                  "Join Meeting"
                )}
              </Button>
            </div>

            {/* Connection error */}
            {call.joinError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-sm text-red-600 dark:text-red-300">{call.joinError}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setJoining(false);
                      void call.join();
                      setEntered(true);
                    }}
                    size="sm"
                    className="rounded-full"
                  >
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Try Again
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => void handleLeave()}
                  >
                    Leave
                  </Button>
                </div>
              </div>
            )}

            {/* Name input */}
            <label className="mt-7 block text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground/70">
              Your name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should people see you?"
              maxLength={40}
              className="mt-2 h-11 rounded-xl border-border/60 bg-muted/50 text-foreground placeholder:text-muted-foreground"
            />

            {/* Footer */}
            <div className="mt-8 border-t border-border/60 pt-6 text-center">
              <p className="text-xs text-muted-foreground/70">
                Peer-to-peer · nothing you say is recorded unless you record it
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Device settings panel overlay */}
      {panel === "devices" && !entered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm sm:p-6">
          <div className="w-full max-w-sm">
            <DeviceSettingsPanel call={call} onClose={() => setPanel("none")} />
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
  peerId,
}: {
  stream: MediaStream | null;
  name: string;
  micOn: boolean;
  sharing: boolean;
  peerId: string;
}) {
  return (
    <div className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-muted/70 ring-1 ring-black/10 dark:ring-white/10 shadow-lg shadow-black/10 dark:shadow-black/25 transition-shadow hover:shadow-xl">
      {stream ? <VideoSurface stream={stream} peer={peerId} /> : <Avatar name={name} />}
      {/* Bottom info bar */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pt-8 pb-2.5 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white drop-shadow-md">
              {name}
            </span>
            {sharing && (
              <span className="flex items-center gap-1 rounded-md bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                <MonitorUp className="size-3" /> presenting
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!micOn && (
              <span className="rounded-md bg-red-500/80 p-1 backdrop-blur-sm">
                <MicOff className="size-3 text-white" />
              </span>
            )}
            <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
              You
            </span>
          </div>
        </div>
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
  handRaised,
}: {
  peerId: string;
  stream: MediaStream;
  name: string;
  trackState?: { audio: boolean; video: boolean };
  speaking?: boolean;
  quality?: PeerQuality;
  presenting?: boolean;
  handRaised?: boolean;
}) {
  const camOff = trackState ? !trackState.video : false;
  const micOff = trackState ? !trackState.audio : false;
  return (
    <div
      key={peerId}
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-2xl bg-muted/70 shadow-lg shadow-black/10 dark:shadow-black/25 transition-all duration-300",
        speaking
          ? "ring-2 ring-primary/80 shadow-primary/10 speaking-ring"
          : "ring-1 ring-black/10 dark:ring-white/10 hover:ring-black/20 dark:hover:ring-white/20",
      )}
    >
      <RemoteAudioPlayer stream={stream} peer={peerId} />
      {camOff ? (
        <Avatar name={name} />
      ) : (
        <VideoSurface stream={stream} peer={peerId} />
      )}

      {/* Hand raised indicator (top-left) */}
      {handRaised && (
        <div className="absolute left-2.5 top-2.5 z-10">
          <span
            className="flex size-7 items-center justify-center rounded-full bg-amber-400 text-sm shadow-lg animate-bounce"
            title="Hand raised"
          >
            ✋
          </span>
        </div>
      )}

      {/* Connection quality (top-right) */}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 z-10">
        <QualityDot quality={quality} />
        {presenting && (
          <span className="flex items-center gap-1 rounded-md bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <MonitorUp className="size-3" /> presenting
          </span>
        )}
      </div>

      {/* Speaking indicator (top-center) */}
      {speaking && (
        <div className="absolute left-1/2 top-2.5 z-10 -translate-x-1/2">
          <span className="flex items-center gap-1 rounded-full bg-primary/80 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm shadow-lg">
            <Signal className="size-2.5" /> speaking
          </span>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pt-8 pb-2.5 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-white drop-shadow-md">
              {name}
            </span>
          </div>
          {micOff && (
            <span className="rounded-md bg-red-500/80 p-1 backdrop-blur-sm">
              <MicOff className="size-3 text-white" />
            </span>
          )}
        </div>
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
        "flex size-10 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 sm:size-11 md:size-12",
        active ? activeClass : inactiveClass,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- chat panel ---------------- */

function ChatPanel({
  call,
  onClose,
}: {
  call: ReturnType<typeof useCallRoom>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [call.messages?.length]);

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex h-full w-full flex-col border-l border-border/60 bg-background/90 backdrop-blur-2xl sm:w-80">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Chat</p>
          {call.messages && call.messages.length > 0 && (
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {call.messages.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close chat"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {call.messages?.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border/40 bg-muted/40 mb-3">
              <MessageSquare className="size-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Send a message to get the conversation started.</p>
          </div>
        )}
        {call.messages?.map((msg, i) => {
          const isMe = msg.from === call.clientId;
          const showHeader = i === 0 || call.messages?.[i - 1]?.from !== msg.from;
          return (
            <div key={msg._id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
              {showHeader && (
                <p className={cn("mb-0.5 flex items-center gap-1.5 text-[11px]", isMe ? "text-primary/70" : "text-muted-foreground")}>
                  <span className="font-medium">{isMe ? "You" : msg.name}</span>
                  <span className="tabular-nums text-muted-foreground/50">
                    {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  isMe
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md",
                )}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="flex shrink-0 gap-2 border-t border-border/60 p-3"
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
          placeholder="Type a message..."
          className="h-10 flex-1 rounded-full border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          disabled={!draft.trim()}
          className="h-10 w-10 shrink-0 rounded-full border-border/60 text-foreground hover:bg-muted disabled:opacity-40"
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
  isCoHost,
  coHosts,
  waitingList,
  onAdmit,
  onAdmitAll,
  onReject,
  onMakeCoHost,
  onTransferHost,
  onMuteAll,
  onSetTransferTarget,
  onClose,
}: {
  code: string;
  call: ReturnType<typeof useCallRoom>;
  isHost: boolean;
  isCoHost: boolean;
  coHosts?: string[];
  waitingList?: { clientId: string; name: string; joinedAt: number }[];
  onAdmit: (clientId: string) => void;
  onAdmitAll: () => void;
  onReject: (clientId: string) => void;
  onMakeCoHost: (clientId: string) => void;
  onTransferHost: (userId: Id<"users">) => void;
  onMuteAll: () => void;
  onSetTransferTarget: (target: { clientId: string; name: string; userId?: Id<"users"> } | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const kick = useMutation(api.call.kickParticipant);
  const mute = useMutation(api.call.muteParticipant);
  const lowered = useMutation(api.call.setHandRaised);
  const isModerator = isHost || isCoHost;
  const coHostIds = useMemo(() => new Set(coHosts ?? []), [coHosts]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = call.participants ?? [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  }, [call.participants, search]);

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex h-full w-full flex-col border-l border-border/60 bg-background/90 backdrop-blur-2xl">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <p className="text-sm font-medium">
          People{" "}
          <span className="ml-1 text-xs text-muted-foreground/70 tabular-nums">
            {call.participants?.length ?? 0}
          </span>
        </p>
        <div className="flex items-center gap-1">
          {isModerator && (call.participants?.length ?? 0) > 1 && (
            <button
              type="button"
              onClick={onMuteAll}
              title="Mute everyone"
              aria-label="Mute everyone"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MicOff className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close people panel"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-border/60 p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search participants…"
          className="h-9 rounded-full border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {isModerator && waitingList !== undefined && waitingList.length > 0 && (
        <div className="border-b border-amber-400/20 bg-amber-400/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-300">
              <DoorOpen className="size-3.5" /> Waiting room · {waitingList.length}
            </p>
            <button
              type="button"
              onClick={onAdmitAll}
              className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-300 transition-colors hover:text-amber-700 dark:hover:text-amber-200"
            >
              <CheckCheck className="size-3" /> Admit all
            </button>
          </div>
          <div className="space-y-1.5">
            {waitingList.map((w) => (
              <div
                key={w.clientId}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-2 py-1.5"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/60 text-xs font-semibold">
                  {(w.name[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-foreground">{w.name}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    Waiting since{" "}
                    {new Date(w.joinedAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAdmit(w.clientId)}
                  title="Admit"
                  aria-label={`Admit ${w.name}`}
                  className="flex size-7 items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/20"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onReject(w.clientId)}
                  title="Reject"
                  aria-label={`Reject ${w.name}`}
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400"
                >
                  <Ban className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border/40 bg-muted/40 mb-3">
              <Users className="size-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{search ? "No matches" : "Nobody else here yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground/60">{search ? "Try a different search" : "Participants will appear here"}</p>
          </div>
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
                speaking ? "bg-primary/15" : "hover:bg-muted/60",
              )}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  speaking
                    ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white"
                    : "bg-muted/60 text-foreground",
                )}
              >
                {(p.name[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
                  <span className="truncate">{p.name}</span>
                  {self && <span className="shrink-0 text-xs text-muted-foreground/70">(you)</span>}
                  {isHost && self && (
                    <span
                      className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-400/15 px-1.5 py-px text-[9px] font-medium text-amber-600 dark:text-amber-300"
                      title="Host"
                    >
                      <Crown className="size-2.5" /> host
                    </span>
                  )}
                  {coHostIds.has(p.clientId) && (
                    <span
                      className="flex shrink-0 items-center gap-0.5 rounded-full bg-indigo-400/15 px-1.5 py-px text-[9px] font-medium text-indigo-600 dark:text-indigo-300"
                      title="Co-host"
                    >
                      <BadgeCheck className="size-2.5" /> co-host
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  {p.handRaised && (
                    <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
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
                {isHost && !self && !coHostIds.has(p.clientId) && (
                  <button
                    type="button"
                    onClick={() => onMakeCoHost(p.clientId)}
                    title="Make co-host"
                    aria-label="Make co-host"
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-300"
                  >
                    <UserPlus className="size-3.5" />
                  </button>
                )}
                {isHost && !self && coHostIds.has(p.clientId) && (
                  <button
                    type="button"
                    onClick={() => onMakeCoHost(p.clientId)}
                    title="Remove co-host"
                    aria-label="Remove co-host"
                    className="flex size-7 items-center justify-center rounded-full text-indigo-600/70 dark:text-indigo-400/70 transition-colors hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400"
                  >
                    <BadgeCheck className="size-3.5" />
                  </button>
                )}
                {isHost && !self && p.userId && !coHostIds.has(p.clientId) && (
                  <button
                    type="button"
                    onClick={() => onSetTransferTarget({ clientId: p.clientId, name: p.name, userId: p.userId })}
                    title="Transfer host"
                    aria-label="Transfer host"
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-amber-500/20 hover:text-amber-600 dark:hover:text-amber-300"
                  >
                    <Crown className="size-3.5" />
                  </button>
                )}
                {isModerator && !self && (
                  <>
                    <button
                      type="button"
                      onClick={() => void mute({ code, target: p.clientId })}
                      title="Mute"
                      aria-label="Mute participant"
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MicOff className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void kick({ code, target: p.clientId })}
                      title="Remove from meeting"
                      aria-label="Remove participant"
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400"
                    >
                      <X className="size-3.5" />
                    </button>
                    {p.handRaised && (
                      <button
                        type="button"
                        onClick={() => void lowered({ code, clientId: p.clientId, raised: false })}
                        title="Lower hand"
                        aria-label="Lower hand"
                        className="flex size-7 items-center justify-center rounded-full text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-500/20"
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

      {isModerator && (
        <div className="border-t border-border/60 p-3 text-center">
          <p className="text-[11px] text-muted-foreground/70">
            {isHost
              ? "You're the host — mute, remove, or make co-hosts from this panel."
              : "You're a co-host — you can mute or remove participants."}
          </p>
        </div>
      )}
    </aside>
  );
}
