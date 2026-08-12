import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-mono text-xs text-foreground">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copied.`);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={`Copy ${label.toLowerCase()}`}
        title={`Copy ${label.toLowerCase()}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

export function MeetingInfoModal({
  open,
  onOpenChange,
  code,
  title,
  hostName,
  startedAt,
  participantCount,
  durationLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  title?: string;
  hostName?: string;
  startedAt?: number;
  participantCount: number;
  durationLabel: string;
}) {
  const link = typeof window !== "undefined" ? `${window.location.origin}/call/${code}` : "";
  const startLabel = startedAt
    ? new Date(startedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meeting information</DialogTitle>
          <DialogDescription>
            Details for this meeting — share the code or link to invite people.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <InfoRow label="Meeting" value={title || "Untitled meeting"} />
          <InfoRow label="Host" value={hostName || "—"} />
          <InfoRow label="Started" value={startLabel} />
          <InfoRow label="Duration" value={durationLabel} />
          <InfoRow label="Participants" value={String(participantCount)} />
        </div>

        <div className="space-y-2">
          <CopyRow label="Meeting code" value={code} />
          <CopyRow label="Meeting link" value={link} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              toast.success("Invitation link copied.");
            }}
          >
            <Share2 className="size-4" /> Share invitation
          </Button>
          <Button className="rounded-full" onClick={() => onOpenChange(false)}>
            <Link2 className="size-4" /> Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
