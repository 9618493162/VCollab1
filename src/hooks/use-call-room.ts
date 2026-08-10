import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
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

export type Participant = { clientId: string; name: string };

/**
 * A peer-to-peer mesh call room.
 *
 * Media (mic/cam) is acquired on mount. Once `join()` resolves, the caller is
 * registered in the room and WebRTC connections are opened to every existing
 * participant. The peer with the lexicographically smaller clientId initiates
 * the offer for each pair, so there's never glare. Offers, answers and ICE
 * candidates are relayed through Convex (`call.sendSignal` / `call.listSignals`).
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
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [sharing, setSharing] = useState(false);
  const [shareStream, setShareStream] = useState<MediaStream | null>(null);

  const pcRef = useRef(new Map<string, RTCPeerConnection>());
  const streamRef = useRef(new Map<string, MediaStream>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const processedRef = useRef(new Set<string>());
  const joinedRef = useRef(false);
  const shareStreamRef = useRef<MediaStream | null>(null);

  // ---- convex ----
  const joinRoom = useMutation(api.call.joinRoom);
  const leaveRoom = useMutation(api.call.leaveRoom);
  const heartbeat = useMutation(api.call.heartbeat);
  const sendSignal = useMutation(api.call.sendSignal);
  const sendMessage = useMutation(api.call.sendMessage);
  const announceSharing = useMutation(api.call.setSharing);

  const signals = useQuery(
    api.call.listSignals,
    joined ? { code, to: clientId } : "skip",
  );
  const participants = useQuery(
    api.call.listParticipants,
    joined ? { code } : "skip",
  );
  const messages = useQuery(
    api.call.listMessages,
    joined ? { code } : "skip",
  );

  // ---- acquire media on mount ----
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStreamRef.current = stream;
          setLocalStream(stream);
          setCamOn(false);
        } catch {
          if (!cancelled) {
            setMediaError("No camera or microphone available.");
          }
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
        for (const track of local.getTracks()) {
          pc.addTrack(track, local);
        }
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
        for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
          if (!stream.getTracks().includes(track)) stream.addTrack(track);
        }
        setRemoteStreams((prev) => ({ ...prev, [peerId]: stream! }));
      };

      return pc;
    },
    [clientId, code, sendSignal],
  );

  const flushPendingIce = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      const pending = pendingIceRef.current.get(peerId) ?? [];
      pendingIceRef.current.delete(peerId);
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          // ignore invalid candidates
        }
      }
    },
    [],
  );

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
        setNames((prev) => ({
          ...prev,
          [sig.from]: String(payload.name ?? "Guest"),
        }));
        // smaller clientId initiates: if we're smaller, open the connection
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
          await pc.setRemoteDescription(
            payload as unknown as RTCSessionDescriptionInit,
          );
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
          // could not answer; drop the peer
          removePeer(sig.from);
        }
      } else if (sig.kind === "answer") {
        const pc = ensurePeer(sig.from);
        try {
          await pc.setRemoteDescription(
            payload as unknown as RTCSessionDescriptionInit,
          );
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
      }
    },
    [clientId, code, ensurePeer, flushPendingIce, removePeer, sendSignal],
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

  // ---- teardown on unmount ----
  useEffect(() => {
    const pcs = pcRef.current;
    const streams = streamRef.current;
    return () => {
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
      for (const other of others) {
        nameMap[other.clientId] = other.name;
      }
      setNames(nameMap);

      // offer to every peer where we're the smaller clientId
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
      setJoinError(
        error instanceof Error ? error.message : "Couldn't join the meeting.",
      );
    }
  }, [clientId, code, ensurePeer, joinRoom, name, sendSignal]);

  const leave = useCallback(async () => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    setJoined(false);
    for (const pc of pcRef.current.values()) pc.close();
    pcRef.current.clear();
    streamRef.current.clear();
    pendingIceRef.current.clear();
    setRemoteStreams({});
    await leaveRoom({ code, clientId });
  }, [code, clientId, leaveRoom]);

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
  }, [clientId, code, announceSharing]);

  const toggleShare = useCallback(async () => {
    if (sharing) {
      await stopSharing();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
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
  }, [sharing, stopSharing, clientId, code, announceSharing]);

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
    remoteStreams,
    names,
    participants,
    messages,
    postMessage,
  };
}
