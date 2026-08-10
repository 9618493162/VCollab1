import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  Copy,
  LogOut,
  Plus,
  Video,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

function extractCode(raw: string): string {
  const match = raw
    .toLowerCase()
    .match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/);
  return match?.[1] ?? "";
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const createRoom = useMutation(api.rooms.createRoom);
  const myRooms = useQuery(api.rooms.listMyRooms);

  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const firstName = user?.name?.split(" ")[0];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const code = await createRoom();
      navigate(`/call/${code}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't start a meeting.",
      );
      setCreating(false);
    }
  };

  const handleJoin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = extractCode(joinCode);
    if (!code) {
      toast.error("That doesn't look like a meeting code.");
      return;
    }
    navigate(`/call/${code}`);
  };

  const handleCopy = async (code: string) => {
    const url = `${window.location.origin}/call/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">
      {/* Top bar */}
      <header className="border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
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

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-16 sm:pt-20">
        {/* Heading */}
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Meetings
        </p>
        <h1 className="mt-4 text-4xl font-extralight tracking-tight sm:text-5xl">
          Say hi, face to face.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground">
          Start a video meeting in one click. Share the code — anyone with the
          link can join, no account needed on their side.
        </p>

        {/* Actions */}
        <div className="mt-12 flex flex-col gap-6 sm:flex-row">
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="h-12 flex-1 rounded-full px-8 text-base"
          >
            <Plus className="mr-2 size-4" />
            {creating ? "Starting…" : "New meeting"}
          </Button>
          <form
            onSubmit={handleJoin}
            className="flex flex-1 items-center gap-2"
          >
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter a code or link"
              className="h-12 flex-1 rounded-full px-5"
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              aria-label="Join meeting"
            >
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </div>

        {/* Recent meetings */}
        <section className="mt-16">
          <div className="flex items-baseline justify-between border-t border-border pt-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Your meetings
            </h2>
            {myRooms && myRooms.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground/70">
                {myRooms.length}
              </span>
            )}
          </div>

          <div className="mt-6">
            {myRooms === undefined ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-md bg-muted"
                  />
                ))}
              </div>
            ) : myRooms.length === 0 ? (
              <div className="border border-dashed border-border py-14 text-center">
                <Video className="mx-auto size-6 text-muted-foreground/60" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No meetings yet.
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground/70">
                  Start one above — the code is shareable forever.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {myRooms.map((room) => (
                  <li
                    key={room._id}
                    className="group flex items-center justify-between gap-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm tracking-tight">
                        {room.code}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {new Date(room.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        ·{" "}
                        {new Date(room.createdAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-full"
                        onClick={() => handleCopy(room.code)}
                        aria-label="Copy meeting link"
                      >
                        {copied === room.code ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 rounded-full"
                        onClick={() => navigate(`/call/${room.code}`)}
                      >
                        <Video className="size-3.5" />
                        Join
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="mt-24 border-t border-border pt-8">
          <p className="text-xs text-muted-foreground">
            Meetings are peer-to-peer. Nothing you say is stored.
          </p>
        </footer>
      </div>
    </main>
  );
}
