import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { useQuery } from "convex/react";
import { Mail, Plus, Search, UserRoundPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Picks meeting invitees: search registered users by name/email, or type a
 * raw email for someone outside the workspace. Shows selected people as
 * removable chips.
 */
export function AttendeePicker({
  value,
  onChange,
  className,
}: {
  value: { email: string; name?: string }[];
  onChange: (next: { email: string; name?: string }[]) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number | null>(null);

  // Cancel the pending blur-close timer if the picker unmounts before it fires
  // (avoids a state update after the component is gone).
  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  const results = useQuery(
    api.users.searchUsers,
    draft.trim().length > 0 ? { query: draft } : "skip",
  );

  const normalized = value.map((a) => a.email.toLowerCase());
  const matches = (results ?? []).filter(
    (u) => !normalized.includes(u.email.toLowerCase()),
  );

  const add = (email: string, name?: string) => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return;
    if (normalized.includes(clean)) return;
    onChange([...value, { email: clean, name }]);
    setDraft("");
    setDraftEmail(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (email: string) => {
    onChange(value.filter((a) => a.email.toLowerCase() !== email.toLowerCase()));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (draftEmail) {
        add(draftEmail);
      } else if (EMAIL_RE.test(draft.trim())) {
        add(draft.trim());
      }
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      remove(value[value.length - 1].email);
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className={className}>
      {/* selected chips */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((a) => (
            <span
              key={a.email}
              className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 py-1 pl-2 pr-1 text-xs"
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[9px] font-bold text-white">
                {(a.name ?? a.email)[0]?.toUpperCase() ?? "?"}
              </span>
              {a.name ?? a.email}
              <button
                type="button"
                onClick={() => remove(a.email)}
                aria-label={`Remove ${a.name ?? a.email}`}
                className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* input + results */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftEmail(
              EMAIL_RE.test(e.target.value.trim()) ? e.target.value.trim() : null,
            );
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search people or type an email…"
          autoComplete="off"
          className="h-10 rounded-xl pl-9"
        />

        {open && (draft.trim().length > 0 || draftEmail) && (
          <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-lg">
            {matches.length > 0 && (
              <ul className="max-h-52 overflow-y-auto p-1">
                {matches.map((u) => (
                  <li key={u._id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(u.email, u.name);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      {u.image ? (
                        <img
                          src={u.image}
                          alt=""
                          className="size-7 shrink-0 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-bold text-white">
                          {(u.name ?? "?")[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                      <UserRoundPlus className="ml-auto size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {draftEmail && !normalized.includes(draftEmail.toLowerCase()) && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(draftEmail);
                }}
                className="flex w-full items-center gap-2.5 border-t border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Mail className="size-3.5 text-muted-foreground" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">Invite {draftEmail}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    sends an email invite
                  </span>
                </span>
                <Plus className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </button>
            )}

            {matches.length === 0 && !draftEmail && (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No teammates found — type a full email to invite them.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
