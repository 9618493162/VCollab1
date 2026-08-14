import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";
import { PresenceDot } from "@/components/PresenceDot";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  Calendar,
  CheckCheck,
  CircleHelp,
  History,
  LayoutGrid,
  Layers,
  LogOut,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const TYPE_ICONS: Record<string, string> = {
  ai: "✨",
  meeting: "📅",
  task: "✅",
  invite: "📨",
  reminder: "⏰",
  starting: "🚀",
  ended: "🏁",
};

export function AppHeader({
  active,
}: {
  active:
    | "dashboard"
    | "history"
    | "settings"
    | "calendar"
    | "search"
    | "workspaces"
    | "messages"
    | "admin"
    | "help";
}) {
  const { user, signOut } = useAuth();
  usePresence();
  const navigate = useNavigate();
  const notifications = useQuery(api.notifications.listNotifications);
  const unread = useQuery(api.notifications.unreadCount);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const markRead = useMutation(api.notifications.markRead);
  const setStatus = useMutation(api.presence.setStatus);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <button type="button" onClick={() => navigate("/")}>
            <Logo />
          </button>
          <nav className="hidden items-center gap-1 sm:flex">
            <NavLink
              active={active === "dashboard"}
              onClick={() => navigate("/dashboard")}
              icon={<LayoutGrid className="size-3.5" />}
              label="Dashboard"
            />
            <NavLink
              active={active === "calendar"}
              onClick={() => navigate("/calendar")}
              icon={<Calendar className="size-3.5" />}
              label="Calendar"
            />
            <NavLink
              active={active === "history"}
              onClick={() => navigate("/history")}
              icon={<History className="size-3.5" />}
              label="History"
            />
            <NavLink
              active={active === "search"}
              onClick={() => navigate("/search")}
              icon={<Search className="size-3.5" />}
              label="Search"
            />
            <NavLink
              active={active === "workspaces"}
              onClick={() => navigate("/workspaces")}
              icon={<Layers className="size-3.5" />}
              label="Workspaces"
            />
            <NavLink
              active={active === "messages"}
              onClick={() => navigate("/messages")}
              icon={<MessageSquare className="size-3.5" />}
              label="Messages"
            />
            <NavLink
              active={active === "admin"}
              onClick={() => navigate("/admin")}
              icon={<ShieldCheck className="size-3.5" />}
              label="Admin"
            />
            <NavLink
              active={active === "help"}
              onClick={() => navigate("/help")}
              icon={<CircleHelp className="size-3.5" />}
              label="Help"
            />
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("vcollab:open-palette"))}
            aria-label="Open command palette"
            title="Command palette (Ctrl/Cmd + K)"
            className="hidden h-9 items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 text-muted-foreground transition-all hover:text-foreground hover:shadow-md dark:bg-white/5 md:flex"
          >
            <Search className="size-3.5" />
            <span className="text-xs">Search…</span>
            <kbd className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
          <ThemeToggle />

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex size-9 items-center justify-center rounded-full border border-border/80 bg-card/60 text-muted-foreground transition-all hover:scale-105 hover:text-foreground hover:shadow-md dark:bg-white/5"
              >
                <Bell className="size-4" />
                {(unread ?? 0) > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[9px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <p className="text-sm font-semibold">Notifications</p>
                {(unread ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <CheckCheck className="size-3" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications === undefined ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : notifications.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No notifications yet.
                  </p>
                ) : (
                  <ul>
                    {notifications.map((n) => (
                      <li key={n._id}>
                        <button
                          type="button"
                          onClick={() => {
                            void markRead({ id: n._id });
                            if (n.link) navigate(n.link);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                            !n.read && "bg-primary/[0.04]",
                          )}
                        >
                          <span className="mt-0.5 text-base">
                            {TYPE_ICONS[n.type] ?? "🔔"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {n.title}
                            </span>
                            {n.body && (
                              <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                                {n.body}
                              </span>
                            )}
                            <span className="mt-1 block text-[11px] text-muted-foreground/70">
                              {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                            </span>
                          </span>
                          {!n.read && (
                            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white transition-transform hover:scale-105"
                aria-label="Account menu"
              >
                {(user?.name ?? "?").trim()[0]?.toUpperCase() ?? "?"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <p className="text-sm font-semibold">{user?.name ?? "Guest"}</p>
                <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                  {user?.email ?? "Anonymous"}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                <LayoutGrid className="mr-2 size-4" /> Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/calendar")}>
                <Calendar className="mr-2 size-4" /> Calendar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/workspaces")}>
                <Layers className="mr-2 size-4" /> Workspaces
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/messages")}>
                <MessageSquare className="mr-2 size-4" /> Messages
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/history")}>
                <History className="mr-2 size-4" /> Meeting history
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/search")}>
                <Search className="mr-2 size-4" /> Search workspace
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <ShieldCheck className="mr-2 size-4" /> Org admin
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="mr-2 size-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/help")}>
                <CircleHelp className="mr-2 size-4" /> Help center
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                <p className="text-xs font-medium text-muted-foreground">Set status</p>
                <div className="mt-1.5 flex items-center gap-1">
                  {(
                    [
                      ["available", "bg-emerald-500"] as const,
                      ["away", "bg-amber-400"] as const,
                      ["dnd", "bg-rose-500"] as const,
                    ] as const
                  ).map(([status, color]) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void setStatus({ status })}
                      title={status}
                      className="flex size-6 items-center justify-center rounded-full border border-border/70 transition-colors hover:bg-muted/60"
                      aria-label={`Set status to ${status}`}
                    >
                      <PresenceDot status={status} className={color} />
                    </button>
                  ))}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void signOut().then(() => navigate("/"))}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="hidden text-sm text-muted-foreground lg:block">
            hi, <span className="font-medium text-foreground">{firstName}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-all",
        active
          ? "glass-interactive font-medium text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
