import { useEffect, useRef, useState } from "react";
import { Check, Mic, MonitorSpeaker, Video, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCallRoom } from "@/hooks/use-call-room";

type Device = { deviceId: string; label: string };

export function DeviceSettingsPanel({
  call,
  onClose,
}: {
  call: ReturnType<typeof useCallRoom>;
  onClose: () => void;
}) {
  const [mics, setMics] = useState<Device[]>([]);
  const [cams, setCams] = useState<Device[]>([]);
  const [speakers, setSpeakers] = useState<Device[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [camId, setCamId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const list = (kind: string) =>
          devices
            .filter((d) => d.kind === kind)
            .map((d) => ({ deviceId: d.deviceId, label: d.label || "Default device" }));
        const micList = list("audioinput");
        const camList = list("videoinput");
        const spkList = list("audiooutput");
        if (cancelled) return;
        setMics(micList);
        setCams(camList);
        setSpeakers(spkList);
        if (micList.length) setMicId((prev) => prev || micList[0].deviceId);
        if (camList.length) setCamId((prev) => prev || camList[0].deviceId);
        if (spkList.length) setSpeakerId((prev) => prev || spkList[0].deviceId);
      } catch {
        if (!cancelled) setPreviewError("Device list unavailable — check browser permissions.");
      }
    }
    void load();
    return () => {
      cancelled = true;
      previewStreamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close();
    };
  }, []);

  // Live camera preview for the selected camera
  useEffect(() => {
    if (!camId) return;
    let cancelled = false;
    async function preview() {
      try {
        previewStreamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: camId } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          await previewRef.current.play().catch(() => undefined);
        }
        setPreviewError(null);
      } catch {
        if (!cancelled) setPreviewError("Camera preview unavailable — check permissions.");
      }
    }
    void preview();
    return () => {
      cancelled = true;
      previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [camId]);

  const testMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, Math.round((avg / 255) * 100)));
        if (audioCtxRef.current) requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setPreviewError("Microphone access denied — check browser permissions.");
    }
  };

  const testSpeaker = () => {
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1);
    } catch {
      setPreviewError("Couldn't play a test tone.");
    }
  };

  const apply = () => {
    call.setDevices({
      audio: micId || undefined,
      video: camId || undefined,
    });
    onClose();
  };

  const picker = (label: string, icon: React.ReactNode, value: string, options: Device[], onChange: (v: string) => void) => (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full rounded-lg border-border/60 bg-muted/50 text-sm text-foreground">
          <SelectValue placeholder="Select device" />
        </SelectTrigger>
        <SelectContent className="border-border/60 bg-muted/60 text-foreground">
          {options.map((d) => (
            <SelectItem key={d.deviceId} value={d.deviceId}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-border/60 bg-background/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <p className="text-sm font-medium">Device settings</p>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close device settings"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="overflow-hidden rounded-xl border border-border/60 bg-black">
          <video ref={previewRef} muted playsInline className="aspect-video w-full object-cover" />
          {!camId && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground/70">
              No camera detected.
            </p>
          )}
        </div>
        {previewError && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            {previewError}
          </p>
        )}

        {picker("Microphone", <Mic className="size-3.5" />, micId, mics, setMicId)}
        {picker("Camera", <Video className="size-3.5" />, camId, cams, setCamId)}
        {speakers.length > 0 &&
          picker("Speaker", <MonitorSpeaker className="size-3.5" />, speakerId, speakers, setSpeakerId)}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={testMic}
            className="flex-1 border-border/60 text-xs text-foreground hover:bg-muted"
          >
            <Mic className="mr-1.5 size-3.5" /> Test mic
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={testSpeaker}
            className="flex-1 border-border/60 text-xs text-foreground hover:bg-muted"
          >
            <Volume2 className="mr-1.5 size-3.5" /> Test speaker
          </Button>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Microphone level</span>
            <span className="tabular-nums">{level}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-100"
              style={{ width: `${level}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border/60 p-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border-border/60 text-foreground hover:bg-muted"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={apply}>
          <Check className="mr-1.5 size-4" /> Apply
        </Button>
      </div>
    </aside>
  );
}
