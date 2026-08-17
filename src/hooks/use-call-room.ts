import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useAction, useMutation, useQuery } from "convex/react";
import { Room, Track } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

type Signal = {
  _id: string;
  code: string;
  from: string;
  to: string;
  kind: string;
  payload?: string;
  createdAt: number;
};

export type Participant = {
  clientId: string;
  name: string;
  sharing?: boolean;
  handRaised?: boolean;
  waiting?: boolean;
  userId?: Id<"users">;
};

export type PeerQuality = "good" | "okay" | "poor";
export type TrackStates = { audio: boolean; video: boolean };

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: {
          length: number;
          [i: number]: { isFinal: boolean; [j: number]: { transcript: string } };
        };
      }) => void)
    | null;
  onerror: ((event: unknown) => void) | null;
};

/**
 * Composite the rendered self + remote video tiles onto a canvas and return a
 * capture track so recordings include video. Returns null when the browser
 * can't do it (caller falls back to audio-only). Tiles are drawn as a grid
 * using object-fit:cover math at ~4fps to keep CPU low.
 */
function buildVideoCapture(
  getTiles: () => { id: string; el: HTMLVideoElement | null }[],
): { track: MediaStreamTrack; stop: () => void } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let stream: MediaStream | null = null;
  try {
    stream = canvas.captureStream(4);
  } catch {
    return null;
  }
  const track = stream.getVideoTracks()[0];
  if (!track) return null;

  const PAD = 8;
  const GAP = 8;
  let timer = 0;

  const draw = () => {
    const tiles = getTiles().filter((t) => t.id && t.el);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (tiles.length === 0) return;
    const cols = Math.ceil(Math.sqrt(tiles.length));
    const rows = Math.ceil(tiles.length / cols);
    const cellW = (canvas.width - PAD * 2 - GAP * (cols - 1)) / cols;
    const cellH = (canvas.height - PAD * 2 - GAP * (rows - 1)) / rows;
    tiles.forEach((tile, i) => {
      const el = tile.el!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * (cellW + GAP);
      const y = PAD + row * (cellH + GAP);
      if (el.readyState >= 2 && el.videoWidth > 0) {
        const s = Math.max(cellW / el.videoWidth, cellH / el.videoHeight);
        const sw = el.videoWidth * s;
        const sh = el.videoHeight * s;
        ctx.drawImage(el, x + (cellW - sw) / 2, y + (cellH - sh) / 2, sw, sh);
      } else {
        ctx.fillStyle = "#171717";
        ctx.fillRect(x, y, cellW, cellH);
      }
    });
  };

  draw();
  timer = window.setInterval(draw, 250);
  return {
    track,
    stop: () => {
      window.clearInterval(timer);
      track.stop();
    },
  };
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * A peer-to-peer mesh call room with real media, signaling via Convex.
 * Adds: speaking detection, remote mic/cam state, network quality,
 * raise hand, reactions, live captions (Web Speech API), recording with
 * AI transcription, and host kick/mute/end handling.
 */
export function useCallRoom(
  code: string,
  name: string,
  opts?: { getVideoTiles?: () => { id: string; el: HTMLVideoElement | null }[] },
  token?: string,
) {
  const [clientId] = useState(() =>
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `p_${Math.random().toString(36).slice(2, 12)}`,
  );

  // ---- media ----
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // ---- call state ----
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [sharing, setSharing] = useState(false);
  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [endedByHost, setEndedByHost] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [remoteTrackStates, setRemoteTrackStates] = useState<Record<string, TrackStates>>({});
  const { user } = useAuth();
  const userId = user?._id;
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [quality, setQuality] = useState<Record<string, PeerQuality>>({});

  // ---- captions ----
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captions, setCaptions] = useState<string[]>([]);
  const [interimCaption, setInterimCaption] = useState("");
  const [captionError, setCaptionError] = useState<string | null>(null);

  // ---- recording ----
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "recording" | "processing" | "ready" | "error"
  >("idle");
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const pcRef = useRef(new Map<string, RTCPeerConnection>());
  const streamRef = useRef(new Map<string, MediaStream>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const processedRef = useRef(new Set<string>());
  const joinedRef = useRef(false);
  const handRaisedRef = useRef(false);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoCaptureRef = useRef<{ track: MediaStreamTrack; stop: () => void } | null>(null);

  // LiveKit cloud recording: while the room's recording state is a cloud
  // recording, every participant publishes their tracks to the LiveKit room
  // so the server-side egress captures everyone at full quality.
  const lkRoomRef = useRef<Room | null>(null);
  const lkConnectingRef = useRef(false);
  const lkPublishedRef = useRef<{
    audio?: MediaStreamTrack;
    video?: MediaStreamTrack;
    share?: MediaStreamTrack;
  }>({});

  // ---- convex ----
  const joinRoom = useMutation(api.call.joinRoom);
  const leaveRoom = useMutation(api.call.leaveRoom);
  const heartbeat = useMutation(api.call.heartbeat);
  const sendSignal = useMutation(api.call.sendSignal);
  const sendMessage = useMutation(api.call.sendMessage);
  const announceSharing = useMutation(api.call.setSharing);
  const setHandRaisedM = useMutation(api.call.setHandRaised);
  const sendReaction = useMutation(api.call.sendReaction);
  const generateUploadUrl = useMutation(api.rooms.generateUploadUrl);
  const saveRecording = useMutation(api.call.saveRecording);
  const transcribeMeeting = useAction(api.ai.transcribeMeeting);
  const recordingState = useQuery(api.recording.getRecordingState, joined ? { code } : "skip");
  const setRecordingState = useMutation(api.recording.setRecordingState);
  const getParticipantToken = useAction(api.livekit.getParticipantToken);
  const startRoomRecordingAction = useAction(api.livekit.startRoomRecording);
  const stopRoomRecordingAction = useAction(api.livekit.stopRoomRecording);
  const checkEgressAction = useAction(api.livekit.checkEgress);

  const signals = useQuery(api.call.listSignals, joined ? { code, to: clientId } : "skip");
  const participants = useQuery(api.call.listParticipants, joined ? { code } : "skip");
  const messages = useQuery(api.call.listMessages, joined ? { code } : "skip");
  const reactions = useQuery(api.call.listReactions, joined ? { code } : "skip");

  // ---- acquire media on mount ----
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStreamRef.current = stream;
          setLocalStream(stream);
          setCamOn(false);
        } catch {
          if (!cancelled) setMediaError("No camera or microphone available.");
        }
      }
    }
    void acquire();
    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const pc = pcRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
    }
    pcRef.current.delete(peerId);
    streamRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setRemoteTrackStates((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setSpeaking((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  /** Get (or create) the peer connection to another participant. */
  const ensurePeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = pcRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current.set(peerId, pc);

      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) pc.addTrack(track, local);
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal({
            code,
            from: clientId,
            to: peerId,
            kind: "ice",
            payload: JSON.stringify(event.candidate.toJSON()),
          });
        }
      };

      pc.ontrack = (event) => {
        let stream = streamRef.current.get(peerId);
        if (!stream) {
          stream = new MediaStream();
          streamRef.current.set(peerId, stream);
        }
        const tracks = event.streams[0]?.getTracks() ?? [event.track];
        for (const track of tracks) {
          if (!stream.getTracks().includes(track)) stream.addTrack(track);
        }

        // track mic/cam state from mute events on the receiver side
        const states: TrackStates = { audio: false, video: false };
        for (const track of tracks) {
          if (track.kind === "audio") {
            states.audio = true;
            track.onmute = () =>
              setRemoteTrackStates((p) => ({ ...p, [peerId]: { ...p[peerId], audio: false } }));
            track.onunmute = () =>
              setRemoteTrackStates((p) => ({ ...p, [peerId]: { ...p[peerId], audio: true } }));
          }
          if (track.kind === "video") {
            states.video = true;
            track.onmute = () =>
              setRemoteTrackStates((p) => ({ ...p, [peerId]: { ...p[peerId], video: false } }));
            track.onunmute = () =>
              setRemoteTrackStates((p) => ({ ...p, [peerId]: { ...p[peerId], video: true } }));
          }
        }
        setRemoteTrackStates((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], ...states },
        }));
        setRemoteStreams((prev) => ({ ...prev, [peerId]: stream! }));
      };

      return pc;
    },
    [clientId, code, sendSignal],
  );

  const flushPendingIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(peerId) ?? [];
    pendingIceRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore invalid candidates
      }
    }
  }, []);

  const leave = useCallback(async () => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    setJoined(false);
    // A cloud recording is owned by the LiveKit server — leaving must NOT stop
    // it (egress keeps recording while anyone remains; it finalizes on its
    // own once the room empties). Local capture dies with the tab, so stop it.
    if (recordingState?.mode === "cloud") {
      lkRoomRef.current?.disconnect();
      lkRoomRef.current = null;
      lkPublishedRef.current = {};
    } else {
      recorderRef.current?.stop();
      videoCaptureRef.current?.stop();
      videoCaptureRef.current = null;
      void setRecordingState({ code, clientId, state: { active: false } }).catch(() => {});
    }
    for (const pc of pcRef.current.values()) pc.close();
    pcRef.current.clear();
    streamRef.current.clear();
    pendingIceRef.current.clear();
    setRemoteStreams({});
    setSpeaking({});
    setQuality({});
    setCaptionsEnabled(false);
    await leaveRoom({ code, clientId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, clientId, leaveRoom, setRecordingState, recordingState?.mode]);

  const handleSignal = useCallback(
    async (sig: Signal) => {
      if (sig.from === clientId) return;
      let payload: Record<string, unknown> = {};
      try {
        payload = sig.payload ? (JSON.parse(sig.payload) as Record<string, unknown>) : {};
      } catch {
        // ignore malformed payloads
      }

      if (sig.kind === "hello") {
        setNames((prev) => ({ ...prev, [sig.from]: String(payload.name ?? "Guest") }));
        if (clientId < sig.from) {
          const pc = ensurePeer(sig.from);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal({
              code,
              from: clientId,
              to: sig.from,
              kind: "offer",
              payload: JSON.stringify(pc.localDescription),
            });
          } catch {
            // connection failed; nothing to do
          }
        }
      } else if (sig.kind === "offer") {
        const pc = ensurePeer(sig.from);
        try {
          await pc.setRemoteDescription(payload as unknown as RTCSessionDescriptionInit);
          await flushPendingIce(sig.from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal({
            code,
            from: clientId,
            to: sig.from,
            kind: "answer",
            payload: JSON.stringify(pc.localDescription),
          });
        } catch {
          removePeer(sig.from);
        }
      } else if (sig.kind === "answer") {
        const pc = ensurePeer(sig.from);
        try {
          await pc.setRemoteDescription(payload as unknown as RTCSessionDescriptionInit);
          await flushPendingIce(sig.from, pc);
        } catch {
          // stale answer; ignore
        }
      } else if (sig.kind === "ice") {
        const pc = pcRef.current.get(sig.from);
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(payload as RTCIceCandidateInit);
          } catch {
            // ignore
          }
        } else if (pc) {
          const pending = pendingIceRef.current.get(sig.from) ?? [];
          pending.push(payload as RTCIceCandidateInit);
          pendingIceRef.current.set(sig.from, pending);
        }
      } else if (sig.kind === "bye") {
        removePeer(sig.from);
      } else if (sig.kind === "kick") {
        setKicked(true);
        void leave();
      } else if (sig.kind === "end") {
        setEndedByHost(true);
        recorderRef.current?.stop();
        videoCaptureRef.current?.stop();
        videoCaptureRef.current = null;
        if (recordingState?.mode === "cloud") {
          lkRoomRef.current?.disconnect();
          lkRoomRef.current = null;
          lkPublishedRef.current = {};
          // best-effort: stop the egress server-side too
          void stopRoomRecordingAction({ code, clientId }).catch(() => {});
        } else {
          void setRecordingState({ code, clientId, state: { active: false } }).catch(() => {});
        }
        void leave();
      } else if (sig.kind === "mute") {
        // mute-all broadcasts to everyone; the sender skips themselves
        if (payload.from === clientId) return;
        localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
        setMicOn(false);
      }
    },
    [clientId, code, ensurePeer, flushPendingIce, leave, removePeer, sendSignal],
  );

  // ---- process the reactive signal feed ----
  useEffect(() => {
    if (!signals) return;
    for (const sig of signals) {
      if (processedRef.current.has(sig._id)) continue;
      processedRef.current.add(sig._id);
      void handleSignal(sig);
    }
  }, [signals, handleSignal]);

  // ---- admitted from the waiting room: join the mesh now ----
  useEffect(() => {
    if (!joined || !waiting) return;
    const me = (participants ?? []).find((p) => p.clientId === clientId);
    if (!me) return;
    // Server data (participants) revealed we're admitted — leave the waiting room.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaiting(false);
    void sendSignal({
      code,
      from: clientId,
      to: "*",
      kind: "hello",
      payload: JSON.stringify({ clientId, name }),
    });
    for (const other of participants ?? []) {
      if (other.clientId === clientId) continue;
      if (clientId < other.clientId) {
        const pc = ensurePeer(other.clientId);
        try {
          void pc.createOffer().then(async (offer) => {
            await pc.setLocalDescription(offer);
            await sendSignal({
              code,
              from: clientId,
              to: other.clientId,
              kind: "offer",
              payload: JSON.stringify(pc.localDescription),
            });
          });
        } catch {
          // connection failed; ignore
        }
      }
    }
  }, [joined, waiting, participants, clientId, code, ensurePeer, name, sendSignal]);

  // ---- heartbeat while in the room ----
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(() => {
      void heartbeat({ code, clientId });
    }, 15_000);
    return () => clearInterval(id);
  }, [joined, code, clientId, heartbeat]);

  // ---- speaking detection from remote audio levels ----
  useEffect(() => {
    const entries = Object.entries(remoteStreams);
    if (entries.length === 0) return;
    let ctx: AudioContext | null = null;
    const analysers = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>();
    try {
      ctx = new AudioContext();
      for (const [peerId, stream] of entries) {
        if (!stream.getAudioTracks()[0]) continue;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analysers.set(peerId, { analyser, source });
      }
    } catch {
      return; // audio analysis unavailable; skip speaking detection
    }
    if (analysers.size === 0) {
      void ctx?.close();
      return;
    }
    const data = new Uint8Array(512);
    const clearTimers = new Map<string, number>();
    const id = window.setInterval(() => {
      for (const [peerId, { analyser }] of analysers) {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        if (sum / data.length > 5) {
          setSpeaking((prev) => (prev[peerId] ? prev : { ...prev, [peerId]: true }));
          const timer = clearTimers.get(peerId);
          if (timer) window.clearTimeout(timer);
          clearTimers.set(
            peerId,
            window.setTimeout(() => {
              setSpeaking((prev) => {
                if (!prev[peerId]) return prev;
                const next = { ...prev };
                delete next[peerId];
                return next;
              });
            }, 700),
          );
        }
      }
    }, 250);
    return () => {
      window.clearInterval(id);
      clearTimers.forEach((t) => window.clearTimeout(t));
      analysers.forEach(({ source }) => source.disconnect());
      void ctx?.close();
    };
  }, [remoteStreams]);

  // ---- network quality via peer connection stats ----
  useEffect(() => {
    if (!joined) return;
    const id = window.setInterval(() => {
      for (const [peerId, pc] of pcRef.current) {
        pc.getStats()
          .then((stats) => {
            type Inbound = { type: string; kind?: string; packetsLost?: number; packetsReceived?: number };
            type Pair = { type: string; nominated?: boolean; currentRoundTripTime?: number };
            let loss = 0;
            let rtt = 0;
            stats.forEach((s) => {
              const inbound = s as Inbound;
              if (
                inbound.type === "inbound-rtp" &&
                inbound.kind === "audio" &&
                typeof inbound.packetsLost === "number" &&
                typeof inbound.packetsReceived === "number" &&
                inbound.packetsLost + inbound.packetsReceived > 0
              ) {
                loss = inbound.packetsLost / (inbound.packetsLost + inbound.packetsReceived);
              }
              const pair = s as Pair;
              if (pair.type === "candidate-pair" && pair.nominated && typeof pair.currentRoundTripTime === "number") {
                rtt = pair.currentRoundTripTime * 1000;
              }
            });
            const q: PeerQuality = loss > 0.15 || rtt > 400 ? "poor" : loss > 0.05 || rtt > 200 ? "okay" : "good";
            setQuality((prev) => (prev[peerId] === q ? prev : { ...prev, [peerId]: q }));
          })
          .catch(() => {
            // stats unavailable; ignore
          });
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [joined]);

  // ---- live captions via the Web Speech API (no fake text) ----
  useEffect(() => {
    if (!captionsEnabled || !joined) return;
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      // Browser support check happens once per toggle; sync state is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCaptionError("Live captions aren't supported in this browser (try Chrome or Edge).");
      setCaptionsEnabled(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          setCaptions((prev) => {
            const next = [...prev, result[0].transcript.trim()].filter(Boolean);
            return next.slice(-60);
          });
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimCaption(interim);
    };
    rec.onerror = () => {
      // transient errors (e.g. no speech); keep going
    };
    try {
      rec.start();
    } catch {
      setCaptionError("Couldn't start live captions in this browser.");
      setCaptionsEnabled(false);
    }
    return () => {
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    };
  }, [captionsEnabled, joined]);

  // ---- teardown on unmount ----
  useEffect(() => {
    const pcs = pcRef.current;
    const streams = streamRef.current;
    return () => {
      recorderRef.current?.stop();
      videoCaptureRef.current?.stop();
      videoCaptureRef.current = null;
      // Don't kill a cloud recording when this tab closes — see `leave`.
      if (lkRoomRef.current) {
        lkRoomRef.current.disconnect();
        lkRoomRef.current = null;
        lkPublishedRef.current = {};
      }
      if (joinedRef.current) void leaveRoom({ code, clientId });
      if (recordingState?.mode !== "cloud") {
        void setRecordingState({ code, clientId, state: { active: false } }).catch(() => {});
      }
      for (const pc of pcs.values()) pc.close();
      pcs.clear();
      streams.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, clientId, leaveRoom, setRecordingState, recordingState?.mode]);

  // ---- LiveKit cloud recording: publish our tracks to the recording room ----
  const publishTracksToLiveKit = useCallback(async () => {
    const lp = lkRoomRef.current?.localParticipant;
    if (!lp) return;
    const published = lkPublishedRef.current;
    const publish = async (
      track: MediaStreamTrack | undefined,
      source: Track.Source,
      key: "audio" | "video" | "share",
    ) => {
      const existing = published[key];
      if (existing && existing !== track) {
        try {
          await lp.unpublishTrack(existing);
        } catch {
          // already unpublished
        }
        delete published[key];
      }
      if (track && existing !== track) {
        try {
          await lp.publishTrack(track, { source });
          published[key] = track;
        } catch {
          // track may already be published / no longer valid
        }
      }
    };
    await publish(
      localStreamRef.current?.getAudioTracks()[0],
      Track.Source.Microphone,
      "audio",
    );
    await publish(
      camOn ? localStreamRef.current?.getVideoTracks()[0] : undefined,
      Track.Source.Camera,
      "video",
    );
    await publish(
      sharing ? shareStreamRef.current?.getVideoTracks()[0] : undefined,
      Track.Source.ScreenShare,
      "share",
    );
  }, [camOn, sharing]);

  const connectLiveKit = useCallback(async () => {
    if (lkRoomRef.current || lkConnectingRef.current) return;
    lkConnectingRef.current = true;
    try {
      const { url, token } = await getParticipantToken({ code, clientId, name });
      const room = new Room({ adaptiveStream: false, dynacast: false });
      await room.connect(url, token);
      lkRoomRef.current = room;
      await publishTracksToLiveKit();
    } catch (error) {
      // One participant failing to publish must not break the meeting.
      setRecordingError(
        error instanceof Error ? error.message : "Couldn't connect to the cloud recorder.",
      );
    } finally {
      lkConnectingRef.current = false;
    }
  }, [clientId, code, getParticipantToken, name, publishTracksToLiveKit]);

  const disconnectLiveKit = useCallback(() => {
    const room = lkRoomRef.current;
    if (!room) return;
    room.disconnect();
    lkRoomRef.current = null;
    lkPublishedRef.current = {};
  }, []);

  // Everyone (including the starter) connects + publishes while a cloud
  // recording is live, and disconnects when it stops.
  useEffect(() => {
    if (!joined) return;
    if (recordingState?.active === true && recordingState?.mode === "cloud") {
      void connectLiveKit();
    } else {
      disconnectLiveKit();
    }
  }, [joined, recordingState?.active, recordingState?.mode, connectLiveKit, disconnectLiveKit]);

  // Start/stop presenting mid-recording: keep the recording's screen share in sync.
  useEffect(() => {
    if (!lkRoomRef.current) return;
    void publishTracksToLiveKit();
  }, [sharing, publishTracksToLiveKit]);

  const join = useCallback(async () => {
    if (joinedRef.current) return;
    try {
      const res = await joinRoom({ code, clientId, name, userId, token });
      joinedRef.current = true;
      setJoined(true);
      setJoinedAt(Date.now());
      setJoinError(null);
      setWaiting(res.waiting);
      if (res.waiting) return;

      const nameMap: Record<string, string> = { [clientId]: name };
      for (const other of res.participants) nameMap[other.clientId] = other.name;
      setNames(nameMap);

      for (const other of res.participants) {
        if (clientId < other.clientId) {
          const pc = ensurePeer(other.clientId);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal({
              code,
              from: clientId,
              to: other.clientId,
              kind: "offer",
              payload: JSON.stringify(pc.localDescription),
            });
          } catch {
            // failed to open; ignore
          }
        }
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const lower = raw.toLowerCase();
      let message = "Couldn't join the meeting.";
      if (/doesn't look right|not found|doesn't exist|isn't valid/i.test(raw)) {
        message = "This meeting code isn't valid or the meeting was never created.";
      } else if (/expired/i.test(raw)) {
        message = "This meeting has expired.";
      } else if (/link is no longer valid/i.test(raw)) {
        message = "This meeting link is no longer valid.";
      } else if (/locked/i.test(raw)) {
        message = "This meeting is locked by the host.";
      } else if (/cancelled/i.test(raw)) {
        message = "This meeting was cancelled.";
      } else if (/ended/i.test(raw)) {
        message = "This meeting has ended.";
      } else if (
        /network|fetch|connection|unavailable|failed to connect|timed out/i.test(
          lower,
        )
      ) {
        message = "Unable to connect. Check your connection and try again.";
      } else if (raw) {
        message = raw;
      }
      setJoinError(message);
    }
  }, [clientId, code, ensurePeer, joinRoom, name, sendSignal, userId, token]);

  const toggleMic = useCallback(() => {
    const next = !micOn;
    localStream?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }, [localStream, micOn]);

  const toggleCam = useCallback(() => {
    const next = !camOn;
    localStream?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }, [localStream, camOn]);

  /** Switch microphone / camera devices and push the new tracks to every peer. */
  const setDevices = useCallback(
    (devices: { audio?: string; video?: string }) => {
      const constraints: MediaStreamConstraints = {
        audio: devices.audio ? { deviceId: { exact: devices.audio } } : true,
        video: devices.video
          ? { deviceId: { exact: devices.video } }
          : { width: 1280, height: 720 },
      };
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          const current = localStreamRef.current ?? new MediaStream();
          localStreamRef.current = current;
          const replacements: { kind: "audio" | "video"; track: MediaStreamTrack }[] = [];
          for (const track of stream.getTracks()) {
            current.getTracks().filter((t) => t.kind === track.kind).forEach((t) => t.stop());
            current.addTrack(track);
            replacements.push({ kind: track.kind as "audio" | "video", track });
          }
          setLocalStream(current);
          for (const pc of pcRef.current.values()) {
            for (const { kind, track } of replacements) {
              const sender = pc.getSenders().find((s) => s.track?.kind === kind);
              void sender?.replaceTrack(track);
            }
          }
          // keep the cloud recording room in sync with the new tracks
          if (lkRoomRef.current) void publishTracksToLiveKit();
        })
        .catch(() => setMediaError("Couldn't switch to the selected device."));
    },
    [publishTracksToLiveKit],
  );

  const toggleHand = useCallback(() => {
    const next = !handRaisedRef.current;
    handRaisedRef.current = next;
    setHandRaised(next);
    void setHandRaisedM({ code, clientId, raised: next });
  }, [clientId, code, setHandRaisedM]);

  const stopSharing = useCallback(async () => {
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    for (const pc of pcRef.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && camTrack) await sender.replaceTrack(camTrack);
    }
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    shareStreamRef.current = null;
    setShareStream(null);
    setSharing(false);
    void announceSharing({ code, clientId, sharing: false });
  }, [announceSharing, clientId, code]);

  const toggleShare = useCallback(async () => {
    if (sharing) {
      await stopSharing();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.onended = () => void stopSharing();
      shareStreamRef.current = screenStream;
      for (const pc of pcRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(videoTrack);
      }
      setShareStream(screenStream);
      setSharing(true);
      void announceSharing({ code, clientId, sharing: true });
    } catch {
      // user cancelled the picker
    }
  }, [announceSharing, clientId, code, sharing, stopSharing]);

  const postMessage = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      try {
        await sendMessage({ code, from: clientId, name, text: clean });
      } catch {
        // message dropped
      }
    },
    [clientId, code, name, sendMessage],
  );

  const fireReaction = useCallback(
    (emoji: string) => {
      void sendReaction({ code, clientId, emoji, name });
    },
    [clientId, code, name, sendReaction],
  );

  // ---- recording: cloud-first (LiveKit egress), local capture fallback ----
  // Cloud mode: the server starts a RoomComposite egress on LiveKit and
  // broadcasts the state; this client (and every participant) then publishes
  // mic/cam to the recording room so the egress captures everyone at full
  // quality — server-side, so it keeps recording even if this tab closes.
  const startRecording = useCallback(async () => {
    if (recorderRef.current || lkRoomRef.current) return;
    setRecordingStatus("recording");
    setRecordingError(null);

    try {
      await startRoomRecordingAction({ code, clientId, name });
      return; // recordingState flips active → the effect connects us to LiveKit
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/livekit/i.test(message)) {
        setRecordingStatus("error");
        setRecordingError(message || "Couldn't start the recording.");
        return;
      }
      // LiveKit isn't configured — fall back to a local capture (still
      // broadcast to everyone via the room's recording state).
      setRecordingError(null);
    }

    // Claim the recording server-side first so every participant sees the
    // indicator immediately and only the host/co-host can start one.
    const startedAt = Date.now();
    try {
      await setRecordingState({
        code,
        clientId,
        state: { active: true, startedAt, byClientId: clientId, byName: name },
      });
    } catch (error) {
      setRecordingStatus("error");
      setRecordingError(
        error instanceof Error ? error.message : "Only the host can start a recording.",
      );
      return;
    }

    const mixed = new MediaStream();
    localStreamRef.current?.getAudioTracks().forEach((t) => mixed.addTrack(t));
    for (const stream of streamRef.current.values()) {
      stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
    }
    if (mixed.getAudioTracks().length === 0) {
      void setRecordingState({ code, clientId, state: { active: false } }).catch(() => {});
      setRecordingStatus("error");
      setRecordingError("No audio tracks to record — enable your microphone.");
      return;
    }

    // Video: canvas-composited tiles at ~4fps when supported.
    const videoCapture = opts?.getVideoTiles ? buildVideoCapture(opts.getVideoTiles) : null;
    if (videoCapture) mixed.addTrack(videoCapture.track);

    const videoMime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    const audioMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    const mime = videoCapture && videoMime ? videoMime : audioMime;

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
    } catch (error) {
      videoCapture?.stop();
      void setRecordingState({ code, clientId, state: { active: false } }).catch(() => {});
      setRecordingStatus("error");
      setRecordingError(
        error instanceof Error ? error.message : "Couldn't start recording in this browser.",
      );
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      recorderRef.current = null;
      videoCaptureRef.current = null;
      videoCapture?.stop();
      const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
      if (blob.size === 0) {
        setRecordingStatus("error");
        setRecordingError("Recording came back empty.");
        return;
      }
      void (async () => {
        setRecordingStatus("processing");
        try {
          const uploadUrl = await generateUploadUrl();
          const put = await fetch(uploadUrl, { method: "PUT", body: blob });
          if (!put.ok) throw new Error("Upload failed.");
          const storageId = (new URL(uploadUrl).pathname.split("/").pop() ?? "") as Id<"_storage">;
          await saveRecording({
            code,
            storageId,
            durationMs: Date.now() - startedAt,
          });
          try {
            await transcribeMeeting({ code, storageId });
          } catch (error) {
            setRecordingError(
              error instanceof Error ? error.message : "Transcription failed.",
            );
          }
          setRecordingStatus("ready");
        } catch (error) {
          setRecordingStatus("error");
          setRecordingError(
            error instanceof Error ? error.message : "Couldn't save the recording.",
          );
        }
      })();
    };
    rec.start();
    recorderRef.current = rec;
    if (videoCapture) videoCaptureRef.current = videoCapture;
    setRecording(true);
    setRecordingPaused(false);
    setRecordingStatus("recording");
    setRecordingError(null);
  }, [
    code,
    clientId,
    name,
    opts?.getVideoTiles,
    generateUploadUrl,
    saveRecording,
    setRecordingState,
    transcribeMeeting,
    startRoomRecordingAction,
  ]);

  const pauseRecording = useCallback(() => {
    // LiveKit's room-composite egress has no pause — only local captures pause.
    if (recordingState?.mode === "cloud") return;
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    setRecordingPaused(true);
    void setRecordingState({ code, clientId, state: { active: true, paused: true } }).catch(
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, clientId, setRecordingState, recordingState?.mode]);

  const resumeRecording = useCallback(() => {
    if (recordingState?.mode === "cloud") return;
    const rec = recorderRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    setRecordingPaused(false);
    void setRecordingState({ code, clientId, state: { active: true, paused: false } }).catch(
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, clientId, setRecordingState, recordingState?.mode]);

  const stopRecording = useCallback(() => {
    // Cloud: stop the egress server-side, then poll for the finished file.
    if (recordingState?.mode === "cloud") {
      const egressId = recordingState.egressId;
      void (async () => {
        try {
          await stopRoomRecordingAction({ code, clientId });
        } catch (error) {
          setRecordingStatus("error");
          setRecordingError(
            error instanceof Error ? error.message : "Couldn't stop the recording.",
          );
          return;
        }
        setRecording(false);
        if (!egressId) {
          setRecordingStatus("ready");
          return;
        }
        // The MP4 takes a moment to finalize + upload on LiveKit's side.
        for (let attempt = 0; attempt < 45; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          try {
            const result = await checkEgressAction({ code, egressId });
            if (result.status === "ready" || result.status === "error") {
              setRecordingStatus(result.status);
              if (result.status === "error") {
                setRecordingError("The cloud recording failed to save.");
              }
              return;
            }
          } catch {
            // transient — keep polling
          }
        }
        setRecordingStatus("ready");
        setRecordingError(
          "The recording is still finalizing in the background — it will appear in the meeting's Recordings tab.",
        );
      })();
      return;
    }
    // Local fallback
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    setRecording(false);
    setRecordingPaused(false);
    void setRecordingState({ code, clientId, state: { active: false } }).catch(() => {});
  }, [
    code,
    clientId,
    recordingState?.mode,
    recordingState?.egressId,
    stopRoomRecordingAction,
    checkEgressAction,
    setRecordingState,
  ]);

  return {
    clientId,
    joined,
    waiting,
    join,
    joinError,
    leave,
    joinedAt,
    localStream,
    micOn,
    camOn,
    mediaError,
    toggleMic,
    toggleCam,
    setDevices,
    sharing,
    shareStream,
    toggleShare,
    handRaised,
    toggleHand,
    remoteStreams,
    names,
    participants,
    remoteTrackStates,
    speaking,
    quality,
    messages,
    postMessage,
    reactions,
    fireReaction,
    captionsEnabled,
    toggleCaptions: () => setCaptionsEnabled((v) => !v),
    captions,
    interimCaption,
    captionError,
    recording,
    recordingPaused,
    recordingStatus,
    recordingError,
    recordingState,
    isRecordingStarter: recordingState?.byClientId === clientId,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    kicked,
    endedByHost,
  };
}
