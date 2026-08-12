import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useMutation } from "convex/react";
import {
  ArrowRight,
  Calendar,
  CalendarPlus,
  History,
  LayoutGrid,
  LogIn,
  Moon,
  Palette,
  Search,
  Settings,
  Sun,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";

function extractCode(raw: string): string {
  const match = raw.toLowerCase().match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/);
  return match?.[1] ?? "";
}

/** Global ⌘K / Ctrl+K command palette. Mounted once, inside the router. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [joinMode, setJoinMode] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const navigate = useNavigate();
  const { setTheme, resolvedTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const createRoom = useMutation(api.rooms.createRoom);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    // Also allow other components (e.g. the header ⌘K button) to open it.
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("vcollab:open-palette", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("vcollab:open-palette", onCustom);
    };
  }, []);

  const close = () => {
    setOpen(false);
    setJoinMode(false);
    setJoinCode("");
  };

  const go = (path: string) => {
    close();
    navigate(path);
  };

  const handleNewMeeting = async () => {
    close();
    setCreating(true);
    try {
      const code = await createRoom();
      navigate(`/call/${code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start a meeting.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (event?: React.FormEvent) => {
    event?.preventDefault();
    const code = extractCode(joinCode);
    if (!code) {
      toast.error("That doesn't look like a meeting code.");
      return;
    }
    go(`/call/${code}`);
  };

  const toggleTheme = () => {
    close();
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setJoinMode(false);
          setJoinCode("");
        }
      }}
      title="Command palette"
      description="Search for a command"
    >
      {joinMode ? (
        <Command shouldFilter={false}>
          <form onSubmit={handleJoin}>
            <CommandInput
              autoFocus
              value={joinCode}
              onValueChange={setJoinCode}
              placeholder="Enter a meeting code… e.g. abc-defg-hij"
            />
          </form>
          <CommandList>
            <CommandEmpty>Type a meeting code to join.</CommandEmpty>
            <CommandGroup heading="Join meeting">
              <CommandItem
                onSelect={() => handleJoin()}
                disabled={!extractCode(joinCode)}
              >
                <ArrowRight className="size-4" />
                Join <span className="font-mono text-xs">{extractCode(joinCode) || "…"}</span>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => setJoinMode(false)}>
                <LogIn className="size-4" />
                Back
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      ) : (
        <Command>
          <CommandInput placeholder="Type a command or search…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {isAuthenticated && (
              <>
                <CommandGroup heading="Meetings">
                  <CommandItem
                    onSelect={() => void handleNewMeeting()}
                    disabled={creating}
                    keywords={["start", "call", "video"]}
                  >
                    <Video className="size-4" />
                    New meeting
                  </CommandItem>
                  <CommandItem onSelect={() => setJoinMode(true)} keywords={["call", "code", "enter"]}>
                    <LogIn className="size-4" />
                    Join meeting
                  </CommandItem>
                  <CommandItem
                    onSelect={() => go("/dashboard?schedule=1")}
                    keywords={["book", "plan", "invite"]}
                  >
                    <CalendarPlus className="size-4" />
                    Schedule meeting
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Go to">
                  <CommandItem onSelect={() => go("/dashboard")} keywords={["home"]}>
                    <LayoutGrid className="size-4" />
                    Dashboard
                  </CommandItem>
                  <CommandItem onSelect={() => go("/calendar")} keywords={["schedule"]}>
                    <Calendar className="size-4" />
                    Calendar
                  </CommandItem>
                  <CommandItem onSelect={() => go("/history")} keywords={["past", "recordings"]}>
                    <History className="size-4" />
                    Meeting history
                  </CommandItem>
                  <CommandItem
                    onSelect={() => go("/search")}
                    keywords={["find", "notes", "transcript", "files"]}
                  >
                    <Search className="size-4" />
                    Search workspace
                  </CommandItem>
                  <CommandItem onSelect={() => go("/settings")} keywords={["account", "prefs"]}>
                    <Settings className="size-4" />
                    Settings
                  </CommandItem>
                </CommandGroup>
              </>
            )}
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem onSelect={toggleTheme} keywords={["dark", "light", "mode"]}>
                {resolvedTheme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
                Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  close();
                  toast.info("Tip: in a meeting, press M to mute, C for camera, H for hand.");
                }}
                keywords={["keyboard", "shortcut", "help"]}
              >
                <Palette className="size-4" />
                Meeting shortcuts
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </CommandDialog>
  );
}
