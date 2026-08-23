import { useMemo } from "react";
import { Activity, Wifi, WifiOff, AlertTriangle, Signal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectionStats {
  latency?: number;
  packetLoss?: number;
  bitrate?: number;
  connectionState?: string;
  iceState?: string;
}

interface QualityIndicatorProps {
  label: string;
  value: string;
  status: "good" | "warning" | "poor" | "unknown";
}

function QualityIndicator({ label, value, status }: QualityIndicatorProps) {
  const colors = {
    good: "text-emerald-500",
    warning: "text-amber-500",
    poor: "text-red-500",
    unknown: "text-muted-foreground/60",
  };
  const dots = {
    good: "bg-emerald-500",
    warning: "bg-amber-500",
    poor: "bg-red-500",
    unknown: "bg-muted-foreground/40",
  };
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground/70">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn("text-xs font-medium tabular-nums", colors[status])}>{value}</span>
        <span className={cn("size-1.5 rounded-full", dots[status])} />
      </div>
    </div>
  );
}

interface MeetingHealthProps {
  stats: ConnectionStats;
  audioQuality?: "good" | "warning" | "poor" | "unknown";
  videoQuality?: "good" | "warning" | "poor" | "unknown";
  isReconnecting?: boolean;
}

function getStatusFromLatency(ms?: number): "good" | "warning" | "poor" | "unknown" {
  if (ms === undefined) return "unknown";
  if (ms < 100) return "good";
  if (ms < 250) return "warning";
  return "poor";
}

function getStatusFromPacketLoss(pct?: number): "good" | "warning" | "poor" | "unknown" {
  if (pct === undefined) return "unknown";
  if (pct < 1) return "good";
  if (pct < 5) return "warning";
  return "poor";
}

function getStatusFromBitrate(kbps?: number): "good" | "warning" | "poor" | "unknown" {
  if (kbps === undefined) return "unknown";
  if (kbps > 500) return "good";
  if (kbps > 100) return "warning";
  return "poor";
}

export function MeetingHealth({ stats, audioQuality = "unknown", videoQuality = "unknown", isReconnecting }: MeetingHealthProps) {
  const overall = useMemo(() => {
    if (isReconnecting) return "poor";
    const latStatus = getStatusFromLatency(stats.latency);
    const lossStatus = getStatusFromPacketLoss(stats.packetLoss);
    if (latStatus === "poor" || lossStatus === "poor") return "poor";
    if (latStatus === "warning" || lossStatus === "warning") return "warning";
    return "good";
  }, [stats.latency, stats.packetLoss, isReconnecting]);

  const overallLabel = {
    good: "Excellent",
    warning: "Fair",
    poor: "Poor",
    unknown: "Checking…",
  };

  const overallIcon = {
    good: <Signal className="size-3.5 text-emerald-500" />,
    warning: <AlertTriangle className="size-3.5 text-amber-500" />,
    poor: <WifiOff className="size-3.5 text-red-500" />,
    unknown: <Activity className="size-3.5 text-muted-foreground animate-pulse" />,
  };

  return (
    <div className="space-y-2">
      {/* Overall status */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
        {overallIcon[overall]}
        <div className="flex-1">
          <p className="text-xs font-medium">
            Connection: {overallLabel[overall]}
          </p>
          {stats.connectionState && (
            <p className="text-[10px] text-muted-foreground/60 capitalize">
              {stats.iceState ? `ICE: ${stats.iceState}` : stats.connectionState}
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="space-y-0.5 px-1">
        <QualityIndicator
          label="Latency"
          value={stats.latency !== undefined ? `${stats.latency} ms` : "—"}
          status={getStatusFromLatency(stats.latency)}
        />
        <QualityIndicator
          label="Packet loss"
          value={stats.packetLoss !== undefined ? `${stats.packetLoss.toFixed(1)}%` : "—"}
          status={getStatusFromPacketLoss(stats.packetLoss)}
        />
        <QualityIndicator
          label="Bitrate"
          value={stats.bitrate !== undefined ? `${stats.bitrate} kbps` : "—"}
          status={getStatusFromBitrate(stats.bitrate)}
        />
        <QualityIndicator
          label="Audio"
          value={audioQuality === "good" ? "Clear" : audioQuality === "warning" ? "Degraded" : audioQuality === "poor" ? "Poor" : "—"}
          status={audioQuality}
        />
        <QualityIndicator
          label="Video"
          value={videoQuality === "good" ? "Clear" : videoQuality === "warning" ? "Degraded" : videoQuality === "poor" ? "Poor" : "—"}
          status={videoQuality}
        />
      </div>

      {isReconnecting && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <Wifi className="size-3.5 animate-pulse text-amber-500" />
          <p className="text-xs text-amber-600 dark:text-amber-400">Reconnecting…</p>
        </div>
      )}
    </div>
  );
}
