import { cn } from "@/lib/utils";
import type { PresenceStatus } from "@/convex/presence";

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  available: "Available",
  away: "Away",
  dnd: "Do not disturb",
  offline: "Offline",
};

const STATUS_COLORS: Record<PresenceStatus, string> = {
  available: "bg-emerald-500",
  away: "bg-amber-400",
  dnd: "bg-rose-500",
  offline: "bg-muted-foreground/40",
};

export function PresenceDot({
  status,
  className,
}: {
  status: PresenceStatus | string;
  className?: string;
}) {
  const s = (["available", "away", "dnd", "offline"].includes(status)
    ? status
    : "offline") as PresenceStatus;
  return (
    <span
      title={STATUS_LABELS[s]}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full ring-2 ring-background",
        STATUS_COLORS[s],
        className,
      )}
    />
  );
}
