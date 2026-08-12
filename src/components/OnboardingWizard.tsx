import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "convex/react";
import { ArrowRight, Camera, Mic, Sparkles, Video } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function OnboardingWizard() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const updateProfile = useMutation(api.settings.updateProfile);
  const updateSettings = useMutation(api.settings.updateSettings);
  const completeOnboarding = useMutation(api.onboarding.completeOnboarding);
  const createRoom = useMutation(api.rooms.createRoom);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [withMic, setWithMic] = useState(true);
  const [withCam, setWithCam] = useState(false);
  const [busy, setBusy] = useState(false);

  const needs = isAuthenticated && user !== undefined && user !== null && user.onboardedAt === undefined;
  if (!needs) return null;

  const finish = async (startMeeting: boolean) => {
    setBusy(true);
    try {
      await completeOnboarding();
      if (startMeeting) {
        const code = await createRoom();
        navigate(`/call/${code}`);
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't finish setup.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md">
        {step === 0 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
                <Sparkles className="size-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Welcome to VCollab</h2>
              <p className="text-sm text-muted-foreground">
                Video calls, meetings, and team collaboration in one place.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboard-name">What should people call you?</Label>
              <Input
                id="onboard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={user?.name ?? "Your name"}
                autoFocus
              />
            </div>
            <Button
              className="w-full rounded-full"
              disabled={busy || (name.trim().length > 0 && name.trim().length < 2)}
              onClick={async () => {
                if (name.trim()) {
                  await updateProfile({ name }).catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Couldn't save your name."),
                  );
                }
                setStep(1);
              }}
            >
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-semibold tracking-tight">Your meeting defaults</h2>
              <p className="text-sm text-muted-foreground">
                Choose how you'd like to start calls. You can change these anytime in Settings.
              </p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setWithMic((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  withMic ? "border-primary/50 bg-primary/5" : "border-border",
                )}
              >
                <Mic className="size-4" />
                <span className="flex-1 text-sm font-medium">Join with microphone on</span>
                <span className={cn("text-xs", withMic ? "text-primary" : "text-muted-foreground")}>
                  {withMic ? "On" : "Off"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setWithCam((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  withCam ? "border-primary/50 bg-primary/5" : "border-border",
                )}
              >
                <Video className="size-4" />
                <span className="flex-1 text-sm font-medium">Join with camera on</span>
                <span className={cn("text-xs", withCam ? "text-primary" : "text-muted-foreground")}>
                  {withCam ? "On" : "Off"}
                </span>
              </button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-full" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button
                className="flex-1 rounded-full"
                disabled={busy}
                onClick={async () => {
                  await updateSettings({ joinWithMic: withMic, joinWithCam: withCam }).catch(
                    (error) =>
                      toast.error(error instanceof Error ? error.message : "Couldn't save settings."),
                  );
                  setStep(2);
                }}
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 py-2 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
              <Camera className="size-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">You're all set, {name.trim() || user?.name?.split(" ")[0] || "friend"}!</h2>
              <p className="text-sm text-muted-foreground">
                Start a meeting right away, or head to your dashboard to schedule one and invite your team.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-full" disabled={busy} onClick={() => void finish(false)}>
                Go to dashboard
              </Button>
              <Button className="flex-1 rounded-full" disabled={busy} onClick={() => void finish(true)}>
                Start a meeting
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
