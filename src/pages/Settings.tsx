import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  Check,
  Clock,
  Globe,
  Loader2,
  Moon,
  Palette,
  Sun,
  User,
  Video,
  Monitor,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "es", label: "Español (Spanish)" },
  { code: "fr", label: "Français (French)" },
  { code: "de", label: "Deutsch (German)" },
  { code: "pt", label: "Português (Portuguese)" },
  { code: "ja", label: "日本語 (Japanese)" },
];

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const settings = useQuery(api.settings.getSettings);
  const updateSettings = useMutation(api.settings.updateSettings);
  const updateProfile = useMutation(api.settings.updateProfile);
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [profileSaved, setProfileSaved] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setImage(user.image ?? "");
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ name, image: image || undefined });
      setProfileSaved(true);
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save profile.");
    } finally {
      setSaving(false);
    }
  };

  const setPref = async (patch: Parameters<typeof updateSettings>[0]) => {
    try {
      await updateSettings(patch);
      toast.success("Settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save settings.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="settings" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, appearance, and account preferences.
        </p>

        <div className="mt-8 space-y-5">
          {/* ---------------- Profile ---------------- */}
          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <User className="size-4 text-primary" /> Profile
            </h2>
            <div className="mt-5 flex items-center gap-4">
              {user?.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="size-16 rounded-full border border-border object-cover"
                />
              ) : (
                <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-bold text-white">
                  {(user?.name ?? "?").trim()[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name ?? "Guest"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email ?? "Anonymous account"}
                </p>
                {user?.isAnonymous && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    Signed in as a guest — sign in with email to attach this profile to an account.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Display name</label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="Your name"
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Profile image URL
                </label>
                <Input
                  value={image}
                  onChange={(e) => {
                    setImage(e.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="https://…"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground/70">
                Sign-in email can't be changed here.
              </p>
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => void saveProfile()}
                disabled={saving || profileSaved}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : profileSaved ? (
                  <Check className="mr-1.5 size-3.5" />
                ) : null}
                {saving ? "Saving…" : profileSaved ? "Saved" : "Save changes"}
              </Button>
            </div>
          </section>

          {/* ---------------- Appearance ---------------- */}
          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Palette className="size-4 text-primary" /> Appearance
            </h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {THEMES.map((t) => {
                const Icon = t.icon;
                const active = (theme ?? "system") === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all",
                      active
                        ? "border-primary/60 bg-primary/10 font-medium text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---------------- Notifications ---------------- */}
          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Bell className="size-4 text-primary" /> Notifications
            </h2>
            <div className="mt-4 divide-y divide-border/60">
              <PrefRow
                label="Meeting reminders"
                hint="10 minutes before a scheduled meeting starts"
                checked={settings?.notifyReminders ?? true}
                onChecked={(v) => void setPref({ notifyReminders: v })}
              />
              <PrefRow
                label="Meeting invitations"
                hint="When someone schedules a meeting and invites you"
                checked={settings?.notifyInvites ?? true}
                onChecked={(v) => void setPref({ notifyInvites: v })}
              />
              <PrefRow
                label="AI summaries"
                hint="When a transcript, summary, or action items are ready"
                checked={settings?.notifySummaries ?? true}
                onChecked={(v) => void setPref({ notifySummaries: v })}
              />
              <PrefRow
                label="Collaboration updates"
                hint="Notes, tasks, and files shared with you"
                checked={settings?.notifyCollaboration ?? true}
                onChecked={(v) => void setPref({ notifyCollaboration: v })}
              />
            </div>
          </section>

          {/* ---------------- Meeting ---------------- */}
          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Video className="size-4 text-primary" /> Meeting
            </h2>
            <div className="mt-4 divide-y divide-border/60">
              <PrefRow
                label="Join with microphone on"
                hint="Applied to your mic toggle when you join a call"
                checked={settings?.joinWithMic ?? true}
                onChecked={(v) => void setPref({ joinWithMic: v })}
              />
              <PrefRow
                label="Join with camera on"
                hint="Applied to your camera toggle when you join a call"
                checked={settings?.joinWithCam ?? true}
                onChecked={(v) => void setPref({ joinWithCam: v })}
              />
            </div>
          </section>

          {/* ---------------- Language & timezone ---------------- */}
          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Globe className="size-4 text-primary" /> Language & region
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Language</label>
                <Select
                  value={settings?.language ?? "en"}
                  onValueChange={(v) => void setPref({ language: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Timezone</label>
                <Select
                  value={settings?.timezone ?? "UTC"}
                  onValueChange={(v) => void setPref({ timezone: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <Clock className="size-3" />
              Preferences are saved to your account.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function PrefRow({
  label,
  hint,
  checked,
  onChecked,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChecked: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChecked} />
    </div>
  );
}
