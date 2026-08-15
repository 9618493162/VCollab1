import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { ShieldCheck, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function Toggle({
  label,
  description,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  description?: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "border-border/60 bg-muted/50 hover:bg-muted",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground">{label}</span>
        {description && <span className="block text-[11px] text-muted-foreground/70">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-indigo-500" : "bg-foreground/10",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-all",
            on ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function SecurityPanel({
  code,
  isHost,
  isCoHost,
  onClose,
}: {
  code: string;
  isHost: boolean;
  isCoHost: boolean;
  onClose: () => void;
}) {
  const settings = useQuery(api.security.getMeetingSettings, { code });
  const room = useQuery(api.rooms.getRoom, { code });
  const updateSettings = useMutation(api.security.updateMeetingSettings);
  const lockMeeting = useMutation(api.meetings.lockMeeting);

  const canManage = isHost || isCoHost;
  const locked = room?.locked === true;

  const toggle = (field: "waitingRoom" | "allowMic" | "allowCam" | "allowShare" | "allowChat" | "allowReactions") => {
    if (settings === undefined || settings === null) return;
    void updateSettings({ code, [field]: !settings[field] }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't update security."),
    );
  };

  const toggleLock = () => {
    void lockMeeting({ code, locked: !locked }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't lock the meeting."),
    );
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-border/60 bg-background/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4" /> Security
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close security"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Meeting access
          </p>
          <Toggle
            label={locked ? "Meeting locked" : "Meeting unlocked"}
            description={locked ? "New joiners are blocked." : "Anyone with the link can join."}
            on={locked}
            disabled={!canManage}
            onToggle={toggleLock}
          />
          <Toggle
            label="Waiting room"
            description="Hold new joiners until you admit them."
            on={settings?.waitingRoom === true}
            disabled={!canManage}
            onToggle={() => toggle("waitingRoom")}
          />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Participant permissions
          </p>
          {(
            [
              ["allowMic", "Microphone", "Participants can use their mic."],
              ["allowCam", "Camera", "Participants can use their camera."],
              ["allowShare", "Screen sharing", "Participants can present their screen."],
              ["allowChat", "Chat", "Participants can post in chat."],
              ["allowReactions", "Reactions", "Participants can react."],
            ] as const
          ).map(([field, label, description]) => (
            <Toggle
              key={field}
              label={label}
              description={description}
              on={settings?.[field] !== false}
              disabled={!canManage}
              onToggle={() => toggle(field)}
            />
          ))}
        </div>

        {!canManage && (
          <p className="rounded-xl border border-border/60 bg-muted/50 p-3 text-[11px] text-muted-foreground/70">
            Only the host or a co-host can change security settings.
          </p>
        )}
      </div>

      <div className="border-t border-border/60 p-3 text-center">
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Users className="size-3" /> The host is notified when the waiting room is used.
        </p>
      </div>
    </aside>
  );
}
