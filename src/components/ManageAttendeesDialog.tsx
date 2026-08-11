import { api } from "@/convex/_generated/api";
import { AttendeePicker } from "@/components/AttendeePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Mail, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/** The minimal scheduled-meeting shape the dialog needs from its parent. */
export type ManageableMeeting = {
  code: string;
  title: string;
  attendees?: string[];
};

/**
 * Host-side management for an already-scheduled meeting: add new attendees
 * (they get an in-app invite + email) or re-send the invite email to
 * everyone already on the list.
 */
export function ManageAttendeesDialog({
  open,
  onOpenChange,
  meeting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: ManageableMeeting | null;
}) {
  const addAttendees = useMutation(api.meetings.addAttendees);
  const resendInvites = useMutation(api.meetings.resendInvites);
  const [selected, setSelected] = useState<{ email: string; name?: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [resending, setResending] = useState(false);

  const existingEmails = useMemo(
    () => (meeting?.attendees ?? []).map((e) => e.toLowerCase()),
    [meeting],
  );

  // Resolve current attendees to names where they're registered users.
  const resolved = useQuery(
    api.users.getUsersByEmails,
    open && meeting ? { emails: meeting.attendees ?? [] } : "skip",
  );
  const nameByEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of resolved ?? []) m.set(u.email.toLowerCase(), u.name);
    return m;
  }, [resolved]);

  const handleAdd = async () => {
    if (!meeting || selected.length === 0) return;
    setAdding(true);
    try {
      const added = await addAttendees({
        code: meeting.code,
        emails: selected.map((a) => a.email),
      });
      if (added === 0) {
        toast.success("Everyone on that list is already invited.");
      } else {
        toast.success(
          `Invited ${added} ${added === 1 ? "person" : "people"} — emails on the way.`,
        );
      }
      setSelected([]);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add attendees.");
    } finally {
      setAdding(false);
    }
  };

  const handleResend = async () => {
    if (!meeting) return;
    setResending(true);
    try {
      const count = await resendInvites({ code: meeting.code });
      toast.success(
        count === 0
          ? "There's no one on the invite list yet."
          : `Re-sent invite emails to ${count} ${count === 1 ? "person" : "people"}.`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't re-send invites.");
    } finally {
      setResending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Manage attendees</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {meeting?.title ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* current invitees */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Currently invited ({existingEmails.length})
            </p>
            {existingEmails.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground/70">
                No one is on the list yet — add people below.
              </p>
            ) : (
              <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {existingEmails.map((email) => (
                  <span
                    key={email}
                    title={email}
                    className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 py-1 pl-2 pr-2.5 text-xs"
                  >
                    <span className="flex size-4 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[9px] font-bold text-white">
                      {(nameByEmail.get(email) ?? email)[0]?.toUpperCase() ?? "?"}
                    </span>
                    {nameByEmail.get(email) ?? email}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* add more */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Add more people
            </label>
            <AttendeePicker value={selected} onChange={setSelected} className="mt-1.5" />
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">
              New invitees get an email invite with the join link plus an
              in-app invitation and reminder. Already-invited people are left
              alone.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={handleResend}
            disabled={resending || adding}
          >
            {resending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Mail className="mr-2 size-4" />
            )}
            Re-send invites
          </Button>
          <Button
            type="button"
            className="rounded-full"
            onClick={handleAdd}
            disabled={adding || resending || selected.length === 0}
          >
            {adding ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Add &amp; invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
