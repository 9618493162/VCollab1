import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
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
export function useCallRoom(code: string, name: string) {
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
  const [remoteTrackStates, setRemoteTrackStates] = useState<Record<string, TrackStates>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [quality, setQuality] = useState<Record<string, PeerQuality>>({});

  // ---- captions ----
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captions, setCaptions] = useState<string[]>([]);
  const [interimCaption, setInterimCaption] = useState("");
  const [captionError, setCaptionError] = useState<string | null>(null);

  // ---- recording ----
  const [recording, setRecording] = useState(false);
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
    recorderRef.current?.stop();
    for (const pc of pcRef.current.values()) pc.close();
    pcRef.current.clear();
    streamRef.current.clear();
    pendingIceRef.current.clear();
    setRemoteStreams({});
    setSpeaking({});
    setQuality({});
    setCaptionsEnabled(false);
    await leaveRoom({ code, clientId });
  }, [code, clientId, leaveRoom]);

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
        void leave();
      } else if (sig.kind === "mute") {
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
      for (const pc of pcs.values()) pc.close();
      pcs.clear();
      streams.clear();
      if (joinedRef.current) void leaveRoom({ code, clientId });
    };
  }, [code, clientId, leaveRoom]);

  const join = useCallback(async () => {
    if (joinedRef.current) return;
    try {
      const others = await joinRoom({ code, clientId, name });
      joinedRef.current = true;
      setJoined(true);
      setJoinedAt(Date.now());
      setJoinError(null);

      const nameMap: Record<string, string> = { [clientId]: name };
      for (const other of others) nameMap[other.clientId] = other.name;
      setNames(nameMap);

      for (const other of others) {
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
      setJoinError(error instanceof Error ? error.message : "Couldn't join the meeting.");
    }
  }, [clientId, code, ensurePeer, joinRoom, name, sendSignal]);

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

  // ---- recording: mix local + remote audio, upload, then transcribe ----
  const startRecording = useCallback(async () => {
    if (recorderRef.current) return;
    const mixed = new MediaStream();
    localStreamRef.current?.getAudioTracks().forEach((t) => mixed.addTrack(t));
    for (const stream of streamRef.current.values()) {
      stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
    }
    if (mixed.getAudioTracks().length === 0) {
      setRecordingStatus("error");
      setRecordingError("No audio tracks to record — enable your microphone.");
      return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    const rec = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    const startedAt = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      recorderRef.current = null;
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
    setRecording(true);
    setRecordingStatus("recording");
    setRecordingError(null);
  }, [code, generateUploadUrl, saveRecording, transcribeMeeting]);

  const stopRecording = useCallback(() => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    setRecording(false);
  }, []);

  return {
    clientId,
    joined,
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
    recordingStatus,
    recordingError,
    startRecording,
    stopRecording,
    kicked,
    endedByHost,
  };
}
