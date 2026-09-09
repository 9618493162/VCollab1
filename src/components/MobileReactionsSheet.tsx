/**
 * CallToolbarReactions — mobile-only emoji picker sheet for the call toolbar.
 *
 * WHY THIS EXISTS: the desktop reaction picker lives inside the desktop-only
 * control bar (hidden below `sm:`). The mobile More menu's "React" button
 * toggles `showReactions`, but the desktop picker is display:none on phones —
 * so the More → React flow previously opened nothing on mobile. This isolated
 * component renders the same emoji list as a fixed bottom sheet, visible only
 * below the `sm` breakpoint, so the existing mobile More → React button now
 * actually opens a picker. No existing component or behavior is modified:
 * the desktop picker keeps working exactly as before.
 */
import { REACTION_EMOJIS } from "@/components/reactionEmojis";

interface Props {
  open: boolean;
  onPick: (emoji: string) => void;
  onDismiss: () => void;
}

export function MobileReactionsSheet({ open, onPick, onDismiss }: Props) {
  if (!open) return null;
  return (
    <>
      {/* tap-outside to close */}
      <div
        className="fixed inset-0 z-[99997] sm:hidden"
        onClick={onDismiss}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Pick a reaction"
        className="fixed inset-x-4 bottom-24 z-[99998] mx-auto flex max-w-md flex-wrap justify-center gap-1 rounded-2xl border border-border/60 bg-background/95 p-2 shadow-2xl backdrop-blur-2xl sm:hidden"
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="flex size-11 items-center justify-center rounded-xl text-2xl transition-all hover:scale-125 hover:bg-muted active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
