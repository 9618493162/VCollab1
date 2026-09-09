/**
 * useDeepgramLive — Captures microphone audio in short WAV chunks and sends
 * them to the Deepgram pre-recorded API via a Convex action. The result is
 * appended to the meeting's live transcript so the AI assistant can use it.
 *
 * Falls back silently when DEEPGRAM_API_KEY is not set — the existing
 * Web Speech API captions continue to work.
 *
 * Audio pipeline:
 *   mic → AudioContext (AnalyserNode for level metering)
 *       → ScriptProcessorNode (PCM float32 @ ctx.sampleRate)
 *       → resample to 16 kHz mono
 *       → encode as WAV (16-bit PCM)
 *       → base64 → Convex action (transcribeChunk)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";

/** How often to send an audio chunk to Deepgram (ms). */
const CHUNK_INTERVAL_MS = 3_000;

/** Target sample rate for Deepgram (16 kHz). */
const TARGET_RATE = 16_000;

interface Options {
  code: string;
  enabled: boolean;
  clientId?: string;
}

export function useDeepgramLive({ code, enabled, clientId }: Options) {
  const transcribeChunk = useAction(api.ai.transcribeChunk);

  const [status, setStatus] = useState<
    "off" | "starting" | "active" | "error" | "unavailable"
  >("off");
  const [level, setLevel] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRafRef = useRef<number>(0);
  const uploadingRef = useRef(false);
  const enabledRef = useRef(enabled);

  // Keep ref in sync.
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  /** Resample a Float32Array from `fromRate` to `toRate` (mono). */
  const resample = useCallback(
    (input: Float32Array, fromRate: number, toRate: number): Float32Array => {
      if (fromRate === toRate) return input;
      const ratio = fromRate / toRate;
      const newLen = Math.round(input.length / ratio);
      const output = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) {
        const srcIdx = i * ratio;
        const idx = Math.floor(srcIdx);
        const frac = srcIdx - idx;
        output[i] =
          input[idx] * (1 - frac) +
          (input[Math.min(idx + 1, input.length - 1)] ?? 0) * frac;
      }
      return output;
    },
    [],
  );

  /** Encode Float32 PCM samples as a WAV file (16-bit, mono). */
  const encodeWav = useCallback(
    (samples: Float32Array, sampleRate: number): ArrayBuffer => {
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      const dataSize = samples.length * (bitsPerSample / 8);
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++)
          view.setUint8(offset + i, str.charCodeAt(i));
      };

      writeStr(0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeStr(36, "data");
      view.setUint32(40, dataSize, true);

      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(
          44 + i * 2,
          s < 0 ? s * 0x8000 : s * 0x7fff,
          true,
        );
      }

      return buffer;
    },
    [],
  );

  /** Convert ArrayBuffer → base64. */
  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, []);

  /** Upload the buffered audio to Deepgram via Convex. */
  const flushBuffer = useCallback(async () => {
    if (uploadingRef.current) return;
    const chunks = bufferRef.current;
    if (chunks.length === 0) return;

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    bufferRef.current = [];

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const resampled = resample(merged, ctx.sampleRate, TARGET_RATE);
    const wav = encodeWav(resampled, TARGET_RATE);
    const audioBase64 = arrayBufferToBase64(wav);

    uploadingRef.current = true;
    try {
      await transcribeChunk({
        code,
        audioBase64,
        sampleRate: TARGET_RATE,
        clientId,
      });
    } catch (err) {
      console.warn("[Deepgram] chunk upload failed:", err);
    } finally {
      uploadingRef.current = false;
    }
  }, [code, clientId, resample, encodeWav, arrayBufferToBase64, transcribeChunk]);

  /** Start the live transcription pipeline. */
  const start = useCallback(async () => {
    if (status === "active" || status === "starting") return;
    setStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (!enabledRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        bufferRef.current.push(new Float32Array(input));
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      audioCtxRef.current = ctx;
      sourceRef.current = source;
      analyserRef.current = analyser;
      processorRef.current = processor;
      streamRef.current = stream;
      bufferRef.current = [];

      timerRef.current = setInterval(() => {
        void flushBuffer();
      }, CHUNK_INTERVAL_MS);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(avg / 255);
        levelRafRef.current = requestAnimationFrame(updateLevel);
      };
      levelRafRef.current = requestAnimationFrame(updateLevel);

      setStatus("active");
    } catch (err) {
      console.warn("[Deepgram] start failed:", err);
      setStatus(err instanceof DOMException && err.name === "NotAllowedError"
        ? "error"
        : "error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, flushBuffer]);

  /** Stop the pipeline and clean up. */
  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = 0;
    }
    void flushBuffer();

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    void audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    audioCtxRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    processorRef.current = null;
    streamRef.current = null;
    bufferRef.current = [];
    uploadingRef.current = false;
    setLevel(0);
    setStatus("off");
  }, [flushBuffer]);

  // Auto-start / stop when `enabled` changes.
  useEffect(() => {
    if (enabled && status === "off") {
      void start();
    } else if (!enabled && status !== "off") {
      stop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      void audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { status, level, start, stop };
}
