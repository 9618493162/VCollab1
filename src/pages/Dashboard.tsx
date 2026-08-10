import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { LogOut, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type Hi = {
  _id: string;
  name: string;
  note?: string;
  intensity: number;
  createdAt: number;
};

const INTENSITIES = [1, 2, 3, 4, 5] as const;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function useStats(his: Hi[] | undefined) {
  return useMemo(() => {
    if (!his) return undefined;
    const today = dayKey(new Date());
    let todayCount = 0;
    const days = new Set<string>();
    for (const h of his) {
      const key = dayKey(new Date(h.createdAt));
      days.add(key);
      if (key === today) todayCount += 1;
    }
    // Streak: consecutive days ending today (or yesterday, if today is still empty).
    let streak = 0;
    const cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { total: his.length, today: todayCount, streak };
  }, [his]);
}

function IntensityDots({ intensity }: { intensity: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-label={`${intensity} out of 5 hi`}>
      {INTENSITIES.map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i <= intensity ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-2 border-t border-border pt-5">
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const his = useQuery(api.his.listHis);
  const addHi = useMutation(api.his.addHi);
  const deleteHi = useMutation(api.his.deleteHi);

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [intensity, setIntensity] = useState<number>(3);
  const [submitting, setSubmitting] = useState(false);

  const stats = useStats(his);
  const firstName = user?.name?.split(" ")[0];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Who did you say hi to?");
      return;
    }
    setSubmitting(true);
    try {
      await addHi({
        name: trimmed,
        note: note.trim() || undefined,
        intensity,
      });
      setName("");
      setNote("");
      setIntensity(3);
      toast.success("Hi logged.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't log that hi.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: Id<"his">) => {
    try {
      await deleteHi({ id });
      toast.success("Hi forgotten.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete that hi.");
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">
      {/* Top bar */}
      <header className="border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-[15px] font-semibold tracking-tight"
          >
            hiiiiii<span className="text-muted-foreground">.</span>
          </button>
          <div className="flex items-center gap-6">
            <span className="hidden text-sm text-muted-foreground sm:block">
              hi{firstName ? `, ${firstName}` : ""}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-16 sm:pt-24">
        {/* Heading */}
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Your hello journal
        </p>
        <h1 className="mt-4 text-4xl font-extralight tracking-tight sm:text-5xl">
          Every hi, in one place.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground">
          Log the hellos you send. Keep the ones worth keeping. Build a quiet
          streak, one greeting at a time.
        </p>

        {/* Stats */}
        <div className="mt-14 grid grid-cols-3 border-y border-border">
          {[
            { label: "Today", value: stats?.today ?? "–" },
            { label: "Streak", value: stats?.streak ?? "–" },
            { label: "Total", value: stats?.total ?? "–" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "py-8 text-center",
                i > 0 && "border-l border-border",
              )}
            >
              <p className="text-4xl font-extralight tabular-nums tracking-tight sm:text-5xl">
                {s.value}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Log a hi */}
        <section className="mt-16">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Log a hi
          </h2>
          <form onSubmit={handleSubmit} className="mt-8 border border-border p-6 sm:p-8">
            <label className="text-sm font-medium" htmlFor="hi-name">
              Who did you say hi to?
            </label>
            <Input
              id="hi-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mom, the barista, your cousin"
              maxLength={60}
              className="mt-3 h-12 rounded-md"
              autoComplete="off"
            />

            <label className="mt-6 block text-sm font-medium" htmlFor="hi-note">
              Anything worth remembering?{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="hi-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Called during lunch, just to check in."
              maxLength={240}
              rows={2}
              className="mt-3 rounded-md"
            />

            <p className="mt-6 text-sm font-medium">How much hi was it?</p>
            <div className="mt-3 flex items-center gap-2">
              {INTENSITIES.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIntensity(i)}
                  aria-label={`${i} out of 5`}
                  aria-pressed={intensity === i}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full border text-sm tabular-nums transition-all duration-200",
                    intensity === i
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                  )}
                >
                  {i}
                </button>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-6">
              <p className="hidden text-xs text-muted-foreground sm:block">
                {intensity === 1
                  ? "A nod from across the street."
                  : intensity === 5
                    ? "The full, arms-wide hello."
                    : "A respectable hello."}
              </p>
              <Button
                type="submit"
                disabled={submitting || !name.trim()}
                className="h-11 rounded-full px-8"
              >
                {submitting ? (
                  "Logging…"
                ) : (
                  <>
                    <Plus className="mr-2 size-4" />
                    Log it
                  </>
                )}
              </Button>
            </div>
          </form>
        </section>

        {/* The record */}
        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              The record
            </h2>
            {his && his.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground/70">
                {his.length} hi{his.length === 1 ? "" : "'s"}
              </span>
            )}
          </div>

          <div className="mt-8">
            {his === undefined ? (
              <SkeletonRows />
            ) : his.length === 0 ? (
              <div className="border-t border-border py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  No hellos yet.
                </p>
                <p className="mt-2 text-xs text-muted-foreground/70">
                  Log your first one above — it counts.
                </p>
              </div>
            ) : (
              <ul>
                {his.map((h) => (
                  <li
                    key={h._id}
                    className="group flex items-start justify-between gap-6 border-t border-border py-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium">{h.name}</p>
                      {h.note && (
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {h.note}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground/70">
                        {formatDistanceToNow(new Date(h.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 pt-1">
                      <IntensityDots intensity={h.intensity} />
                      <button
                        type="button"
                        onClick={() => handleDelete(h._id)}
                        aria-label={`Delete hi to ${h.name}`}
                        className="text-muted-foreground/40 opacity-0 transition-all duration-200 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="mt-24 border-t border-border pt-8">
          <p className="text-xs text-muted-foreground">
            Say hi every day. Build a streak.
          </p>
        </footer>
      </div>
    </main>
  );
}
