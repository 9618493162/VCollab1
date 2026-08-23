import { LayoutGrid, Presentation, Maximize, Users, Focus } from "lucide-react";
import { cn } from "@/lib/utils";

export type LayoutMode = "gallery" | "speaker" | "screen" | "focus";

interface LayoutOption {
  id: LayoutMode;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const LAYOUTS: LayoutOption[] = [
  { id: "gallery", label: "Gallery", icon: <LayoutGrid className="size-4" />, description: "Equal grid of all participants" },
  { id: "speaker", label: "Speaker", icon: <Presentation className="size-4" />, description: "Large active speaker, small strip" },
  { id: "screen", label: "Screen Share", icon: <Maximize className="size-4" />, description: "Shared screen takes focus" },
  { id: "focus", label: "Focus", icon: <Focus className="size-4" />, description: "Minimal UI, just the video" },
];

interface LayoutSwitcherProps {
  current: LayoutMode;
  onChange: (mode: LayoutMode) => void;
  hasScreenShare?: boolean;
}

export function LayoutSwitcher({ current, onChange, hasScreenShare }: LayoutSwitcherProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-background/80 p-1 backdrop-blur-xl border border-border/40">
      {LAYOUTS.map((layout) => {
        // Auto-switch to screen layout when sharing is active
        const isActive = current === layout.id;
        const isDisabled = layout.id === "screen" && !hasScreenShare;

        return (
          <button
            key={layout.id}
            type="button"
            onClick={() => !isDisabled && onChange(layout.id)}
            disabled={isDisabled}
            title={layout.description}
            aria-label={`${layout.label} layout`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              isActive
                ? "bg-primary/15 text-primary"
                : isDisabled
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {layout.icon}
            <span className="hidden sm:inline">{layout.label}</span>
          </button>
        );
      })}
    </div>
  );
}
