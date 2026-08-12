import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { BarChart3, Check, Lock, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_LABEL: Record<string, string> = {
  single: "Single choice",
  multiple: "Multiple choice",
  anonymous: "Anonymous",
};

export function PollsPanel({
  code,
  isHost,
  clientId,
  onClose,
}: {
  code: string;
  isHost: boolean;
  clientId: string;
  onClose: () => void;
}) {
  const polls = useQuery(api.polls.listPolls, { code, viewer: clientId });
  const createPoll = useMutation(api.polls.createPoll);
  const launchPoll = useMutation(api.polls.launchPoll);
  const closePoll = useMutation(api.polls.closePoll);
  const togglePollResults = useMutation(api.polls.togglePollResults);
  const deletePoll = useMutation(api.polls.deletePoll);
  const setPollVote = useMutation(api.polls.setPollVote);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"single" | "multiple" | "anonymous">("single");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const list = options
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      await createPoll({ code, title, type, options: list });
      setTitle("");
      setOptions("");
      setCreating(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the poll.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-white/10 bg-neutral-900/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="size-4" /> Polls
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 transition-colors hover:text-white"
          aria-label="Close polls"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {isHost && !creating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreating(true)}
            className="w-full rounded-full border-white/10 text-white hover:bg-white/10"
          >
            + New poll
          </Button>
        )}

        {isHost && creating && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Question…"
              maxLength={120}
              className="h-9 border-white/10 bg-white/5 text-sm text-white placeholder:text-neutral-500"
            />
            <div className="flex gap-1">
              {(["single", "multiple", "anonymous"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 rounded-full px-2 py-1 text-[11px] transition-colors",
                    type === t
                      ? "bg-white/20 text-white"
                      : "text-neutral-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={"One option per line (2–8)…"}
              rows={4}
              maxLength={600}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-white/30"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void handleCreate()}
                className="flex-1 rounded-full"
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreating(false)}
                className="rounded-full border-white/10 text-white hover:bg-white/10"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {polls === undefined ? (
          <p className="pt-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : polls.length === 0 ? (
          <p className="pt-8 text-center text-sm text-neutral-500">
            No polls yet. {isHost ? "Create one to get going." : "The host can start one."}
          </p>
        ) : (
          polls.map((poll) => {
            const total = poll.totals.reduce((a, b) => a + b, 0);
            const open = poll.launched && !poll.closed;
            return (
              <div
                key={poll._id}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-white">{poll.title}</p>
                  <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">
                    {TYPE_LABEL[poll.type]}
                  </span>
                </div>

                {!poll.launched && (
                  <p className="mt-1 text-[11px] text-neutral-500">Draft — launch when ready.</p>
                )}

                <div className="mt-2.5 space-y-1.5">
                  {poll.options.map((option, index) => {
                    const count = poll.totals[index] ?? 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const mine = poll.myChoices.includes(index);
                    const showResults = poll.showResults || poll.closed;
                    return (
                      <button
                        key={index}
                        type="button"
                        disabled={!open}
                        onClick={() => {
                          const vote = !mine;
                          void setPollVote({
                            code,
                            pollId: poll._id,
                            voter: clientId,
                            choice: index,
                            vote,
                          }).catch((error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Couldn't vote.",
                            ),
                          );
                        }}
                        className={cn(
                          "relative w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                          open
                            ? "border-white/15 text-neutral-100 hover:border-white/30"
                            : "border-white/10 text-neutral-400",
                          mine && "border-indigo-400/60 bg-indigo-500/10",
                        )}
                      >
                        {showResults && (
                          <span
                            className="absolute inset-y-0 left-0 bg-white/10"
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        <span className="relative flex items-center justify-between gap-2">
                          <span>{option}</span>
                          <span className="flex items-center gap-1.5">
                            {mine && open && <Check className="size-3 text-indigo-300" />}
                            {showResults && (
                              <span className="tabular-nums text-neutral-400">
                                {count} · {pct}%
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {poll.voterCount > 0 && (
                  <p className="mt-2 text-[10px] text-neutral-500">
                    {poll.voterCount} vote{poll.voterCount === 1 ? "" : "s"}
                  </p>
                )}

                {isHost && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/10 pt-2.5">
                    {!poll.launched && (
                      <Button
                        size="sm"
                        onClick={() => void launchPoll({ code, pollId: poll._id })}
                        className="h-7 rounded-full px-2.5 text-[11px]"
                      >
                        Launch
                      </Button>
                    )}
                    {open && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void closePoll({ code, pollId: poll._id })}
                        className="h-7 rounded-full border-white/10 px-2.5 text-[11px] text-white hover:bg-white/10"
                      >
                        <Lock className="mr-1 size-3" /> Close
                      </Button>
                    )}
                    {poll.launched && (
                      <button
                        type="button"
                        onClick={() =>
                          void togglePollResults({
                            code,
                            pollId: poll._id,
                            show: !poll.showResults,
                          })
                        }
                        className="h-7 rounded-full border border-white/10 px-2.5 text-[11px] text-neutral-300 transition-colors hover:bg-white/10"
                      >
                        {poll.showResults ? "Hide results" : "Show results"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deletePoll({ code, pollId: poll._id })}
                      aria-label="Delete poll"
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-red-500/20 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isHost && (
        <div className="border-t border-white/10 p-3 text-center">
          <p className="text-[11px] text-neutral-500">
            You're the host — you control when polls launch and close.
          </p>
        </div>
      )}
    </aside>
  );
}
