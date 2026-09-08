/**
 * RecordingViewer — Displays a single recording with appropriate player.
 *
 * ISOLATED: does not modify any existing component.
 */
import { useState, useRef, useCallback } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Loader2,
  Download,
  Clock,
} from "lucide-react";

interface Recording {
  _id: Id<"recordings">;
  code: string;
  url?: string;
  storageId?: Id<"_storage">;
  createdBy: Id<"users">;
  createdAt: number;
  durationMs?: number;
  egressId?: string;
  startedAt?: number;
  filename?: string;
  status?: "recording" | "finalizing" | "ready" | "error";
}

interface Props {
  recording: Recording;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Detect if a URL likely points to a video file. */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|mkv)($|\?)/i.test(url);
}

export function RecordingViewer({ recording }: Props) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const isVideo = recording.url ? isVideoUrl(recording.url) : false;

  const togglePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = mediaRef.current;
      if (!el || !duration) return;
      const pct = Number(e.target.value);
      el.currentTime = (pct / 100) * duration;
      setProgress(pct);
    },
    [duration],
  );

  const handleTimeUpdate = useCallback(() => {
    const el = mediaRef.current;
    if (!el || !duration) return;
    setCurrentTime(el.currentTime);
    setProgress((el.currentTime / duration) * 100);
  }, [duration]);

  const handleLoadedMetadata = useCallback(() => {
    const el = mediaRef.current;
    if (el) setDuration(el.duration);
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = mediaRef.current;
    if (el && el.requestFullscreen) {
      void el.requestFullscreen();
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!recording.url) return;
    const a = document.createElement("a");
    a.href = recording.url;
    a.download = recording.filename || `recording-${recording.code}.mp4`;
    a.click();
  }, [recording.url, recording.filename, recording.code]);

  // Status: still processing
  if (recording.status === "recording" || recording.status === "finalizing") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">Recording processing…</p>
          <p className="text-xs text-muted-foreground">
            The cloud recording is being finalized on the server.
          </p>
        </div>
      </div>
    );
  }

  // Status: error
  if (recording.status === "error") {
    return (
      <div className="rounded-xl border border-dashed border-destructive/40 p-4">
        <p className="text-sm text-destructive">
          This recording failed to save.
        </p>
      </div>
    );
  }

  // No URL yet
  if (!recording.url) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Recording URL not available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      {/* Media player */}
      <div className="relative bg-black">
        {isVideo ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={recording.url}
            className="w-full"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setPlaying(false)}
            playsInline
            preload="metadata"
          />
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={recording.url}
            className="hidden"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setPlaying(false)}
            preload="metadata"
          />
        )}

        {/* Overlay for audio recordings (show waveform-like visual) */}
        {!isVideo && (
          <div className="flex h-24 items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
            <div className="flex items-end gap-1">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-primary/30"
                  style={{
                    height: `${12 + Math.sin(i * 0.8) * 10 + (playing ? Math.random() * 8 : 0)}px`,
                    transition: "height 0.15s ease",
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 bg-card px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={togglePlay}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>

        <span className="w-12 text-center font-mono text-[10px] text-muted-foreground">
          {formatTime(currentTime)}
        </span>

        {/* Progress bar */}
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={handleSeek}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />

        <span className="w-12 text-center font-mono text-[10px] text-muted-foreground">
          {duration ? formatTime(duration) : recording.durationMs ? formatDuration(recording.durationMs) : "—"}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={toggleMute}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>

        {isVideo && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={handleFullscreen}
          >
            <Maximize className="size-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={handleDownload}
        >
          <Download className="size-4" />
        </Button>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
        <Clock className="size-3" />
        <span>{new Date(recording.createdAt).toLocaleString()}</span>
        {recording.durationMs ? (
          <span>· {formatDuration(recording.durationMs)}</span>
        ) : null}
      </div>
    </div>
  );
}
