import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { Check, ListChecks, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  pending: "Up next",
  active: "Now",
  done: "Done",
};

export function AgendaPanel({
  code,
  isHost,
  onClose,
}: {
  code: string;
  isHost: boolean;
  onClose: () => void;
}) {
  const agenda = useQuery(api.agenda.listAgenda, { code });
  const addItem = useMutation(api.agenda.addAgendaItem);
  const setStatus = useMutation(api.agenda.setAgendaStatus);
  const removeItem = useMutation(api.agenda.removeAgendaItem);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [presenter, setPresenter] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    setBusy(true);
    try {
      await addItem({
        code,
        title,
        presenter: presenter || undefined,
        durationMinutes: duration ? Number(duration) : undefined,
      });
      setTitle("");
      setPresenter("");
      setDuration("");
      setAdding(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the item.");
    } finally {
      setBusy(false);
    }
  };

  const done = (agenda ?? []).filter((i) => i.status === "done").length;

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xs flex-col border-l border-border/60 bg-background/95 backdrop-blur-md">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="size-4" /> Agenda
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close agenda"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {(agenda ?? []).length > 0 && (
          <p className="text-[11px] text-muted-foreground/70">
            {done} of {agenda?.length} items done
          </p>
        )}

        {isHost && !adding && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="w-full rounded-full border-border/60 text-foreground hover:bg-muted"
          >
            <Plus className="mr-1 size-3.5" /> Add agenda item
          </Button>
        )}

        {isHost && adding && (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/50 p-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Agenda item…"
              maxLength={120}
              autoFocus
              className="h-9 border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex gap-2">
              <Input
                value={presenter}
                onChange={(e) => setPresenter(e.target.value)}
                placeholder="Presenter"
                maxLength={60}
                className="h-9 flex-1 border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Min"
                inputMode="numeric"
                className="h-9 w-16 border-border/60 bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy || !title.trim()}
                onClick={() => void handleAdd()}
                className="flex-1 rounded-full"
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdding(false)}
                className="rounded-full border-border/60 text-foreground hover:bg-muted"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {agenda === undefined ? (
          <p className="pt-8 text-center text-sm text-muted-foreground/70">Loading…</p>
        ) : agenda.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted-foreground/70">
            No agenda yet. {isHost ? "Add the first item." : "The host can build one."}
          </p>
        ) : (
          agenda.map((item) => (
            <div
              key={item._id}
              className={cn(
                "rounded-xl border bg-muted/50 p-3",
                item.status === "active"
                  ? "border-indigo-400/50 bg-indigo-500/10"
                  : item.status === "done"
                    ? "border-border/60 opacity-70"
                    : "border-border/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {(item.presenter || item.durationMinutes !== undefined) && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                      {[item.presenter, item.durationMinutes ? `${item.durationMinutes} min` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    item.status === "active"
                      ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300"
                      : item.status === "done"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                        : "bg-muted/80 text-muted-foreground",
                  )}
                >
                  {STATUS_LABEL[item.status]}
                </span>
              </div>

              {item.description && (
                <p className="mt-1.5 text-xs text-muted-foreground">{item.description}</p>
              )}

              {isHost && (
                <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
                  {item.status !== "active" && (
                    <button
                      type="button"
                      onClick={() => void setStatus({ code, itemId: item._id, status: "active" })}
                      className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Start
                    </button>
                  )}
                  {item.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => void setStatus({ code, itemId: item._id, status: "done" })}
                      className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-600 dark:text-emerald-300"
                    >
                      <Check className="mr-1 inline size-3" /> Done
                    </button>
                  )}
                  {item.status !== "pending" && (
                    <button
                      type="button"
                      onClick={() => void setStatus({ code, itemId: item._id, status: "pending" })}
                      className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void removeItem({ code, itemId: item._id })}
                    aria-label="Delete agenda item"
                    className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-red-500/20 hover:text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isHost && (
        <div className="border-t border-border/60 p-3 text-center">
          <p className="text-[11px] text-muted-foreground/70">
            You're the host — everyone sees the agenda as you work through it.
          </p>
        </div>
      )}
    </aside>
  );
}
