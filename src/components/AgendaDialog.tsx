import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation, useQuery } from "convex/react";
import { Check, ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ScheduledMeeting = {
  code: string;
  title: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Up next",
  active: "Now",
  done: "Done",
};

/** Host edits the agenda of a scheduled meeting before it starts. */
export function AgendaDialog({
  open,
  onOpenChange,
  meeting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: ScheduledMeeting | null;
}) {
  const code = meeting?.code ?? "";
  const agenda = useQuery(api.agenda.listAgenda, open && code ? { code } : "skip");
  const addItem = useMutation(api.agenda.addAgendaItem);
  const setStatus = useMutation(api.agenda.setAgendaStatus);
  const removeItem = useMutation(api.agenda.removeAgendaItem);

  const [title, setTitle] = useState("");
  const [presenter, setPresenter] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!code) return;
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the item.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ListChecks className="size-4 text-primary" /> Meeting agenda
          </DialogTitle>
          <DialogDescription>
            {meeting
              ? `Plan “${meeting.title}” so everyone knows what's coming.`
              : "Plan the meeting."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {agenda === undefined ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : agenda.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No agenda items yet. Add the first one below.
            </p>
          ) : (
            agenda.map((item) => (
              <div
                key={item._id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  item.status === "active"
                    ? "border-primary/40 bg-primary/[0.05]"
                    : "border-border/80 bg-card/40",
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    item.status === "active"
                      ? "bg-primary"
                      : item.status === "done"
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/30",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.presenter, item.durationMinutes ? `${item.durationMinutes} min` : null]
                      .filter(Boolean)
                      .join(" · ") || STATUS_LABEL[item.status]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {item.status !== "done" && (
                    <button
                      type="button"
                      title="Mark done"
                      aria-label="Mark done"
                      onClick={() => void setStatus({ code, itemId: item._id, status: "done" })}
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-emerald-500/15 hover:text-emerald-500"
                    >
                      <Check className="size-3.5" />
                    </button>
                  )}
                  {item.status !== "pending" && (
                    <button
                      type="button"
                      title="Reset"
                      aria-label="Reset status"
                      onClick={() =>
                        void setStatus({ code, itemId: item._id, status: "pending" })
                      }
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                    >
                      ↺
                    </button>
                  )}
                  <button
                    type="button"
                    title="Delete"
                    aria-label="Delete item"
                    onClick={() => void removeItem({ code, itemId: item._id })}
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Agenda item…"
              maxLength={120}
              className="h-9 flex-1 rounded-full"
            />
            <Input
              value={presenter}
              onChange={(e) => setPresenter(e.target.value)}
              placeholder="Presenter"
              maxLength={60}
              className="h-9 w-28 rounded-full"
            />
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Min"
              inputMode="numeric"
              className="h-9 w-16 rounded-full"
            />
          </div>
          <Button
            onClick={() => void handleAdd()}
            disabled={busy || !title.trim()}
            className="w-full rounded-full"
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Add item
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
