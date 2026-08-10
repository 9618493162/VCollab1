import { cn } from "@/lib/utils";

/** VCollab wordmark — reuse everywhere so branding stays consistent. */
export function Logo({
  className,
  dot = true,
}: {
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-display text-lg font-bold tracking-tight",
        className,
      )}
    >
      V
      <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
        Collab
      </span>
      {dot && <span className="text-gradient">.</span>}
    </span>
  );
}
