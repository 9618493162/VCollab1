import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Building2, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function Workspaces() {
  const { user } = useAuth();
  usePresence();
  const navigate = useNavigate();
  const workspaces = useQuery(api.workspaces.listMyWorkspaces);
  const createWorkspace = useMutation(api.workspaces.createWorkspace);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length === 0) {
      toast.error("Give the workspace a name.");
      return;
    }
    setBusy(true);
    try {
      const id = await createWorkspace({ name, description });
      setOpen(false);
      setName("");
      setDescription("");
      navigate(`/workspaces/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create workspace.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Team spaces for channels, messages, meetings and shared work.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> New workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create a workspace</DialogTitle>
              <DialogDescription>
                You'll become the owner. Invite teammates after it's created.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Name</Label>
                <Input
                  id="ws-name"
                  placeholder="e.g. Engineering Team"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-desc">Description (optional)</Label>
                <Input
                  id="ws-desc"
                  placeholder="What is this workspace for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={160}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={busy}>
                {busy ? "Creating…" : "Create workspace"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {workspaces === undefined ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : workspaces.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border/80 p-12 text-center">
          <Building2 className="mx-auto size-10 text-muted-foreground/60" />
          <p className="mt-4 font-medium">No workspaces yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.name?.split(" ")[0] ?? "You"} can create one and invite your team.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w) => (
            <button
              key={w._id}
              type="button"
              onClick={() => navigate(`/workspaces/${w._id}`)}
              className="group rounded-2xl border border-border/80 bg-card/60 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-lg font-semibold text-primary">
                  {w.name.trim()[0]?.toUpperCase()}
                </div>
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                  {w.myRole}
                </span>
              </div>
              <p className="mt-3 font-semibold">{w.name}</p>
              {w.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {w.description}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" /> {w.memberCount} member
                  {w.memberCount === 1 ? "" : "s"}
                </span>
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
